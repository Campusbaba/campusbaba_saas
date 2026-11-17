import express, { Application } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import router from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import { config } from "./config";
import { container } from "./composition/container";

const app: Application = express();

// Security middleware
app.use(helmet());

/**
 * Tenant-Aware CORS Allowlist Validator (Fixes P0-10):
 * Allows:
 * - Explicitly configured origins in CORS_ALLOWED_ORIGINS
 * - Any valid tenant subdomain matching https://<slug>.<APP_BASE_DOMAIN> or http://<slug>.localhost:<port>
 */
export function isAllowedCorsOrigin(
  origin: string | undefined,
  baseDomain = config.app.baseDomain,
  explicitAllowlist = config.tenancy.corsAllowedOrigins
): boolean {
  if (!origin) return true; // Same-origin or server-to-server requests
  if (explicitAllowlist.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === baseDomain || host.endsWith(`.${baseDomain}`)) {
      return true;
    }
    if (
      config.app.nodeEnv !== "production" &&
      (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost"))
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not permitted by tenant CORS policy`));
      }
    },
    credentials: true,
  })
);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging middleware
if (config.app.nodeEnv === "development") {
  app.use(morgan("dev"));
} else if (config.app.nodeEnv !== "test") {
  app.use(morgan("combined"));
}

// Liveness probe
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    message: "Server is running",
    timestamp: container.clock.now().toISOString(),
  });
});

// Readiness probe (Reports active plug-and-play drivers without exposing secrets)
app.get("/ready", async (_req, res) => {
  const queueStats = await container.queue.getStats();
  res.status(200).json({
    success: true,
    status: "ready",
    drivers: {
      storage: container.storage.driverName,
      cache: container.cache.driverName,
      queue: container.queue.driverName,
      sms: container.sms.driverName,
      email: container.email.driverName,
      pdf: container.pdf.driverName,
      payments: Array.from(container.paymentGateways.keys()),
    },
    features: config.features,
    queueStats,
    timestamp: container.clock.now().toISOString(),
  });
});

// API routes
app.use("/api/v1", router);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
