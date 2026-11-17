import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local" });
dotenv.config();

export const ENV_KEYS = [
  // --- App ---
  "NODE_ENV",
  "APP_NAME",
  "APP_BASE_DOMAIN",
  "PORT",
  "LOG_LEVEL",
  // --- Tenancy ---
  "RESERVED_SUBDOMAINS",
  "TENANT_RESOLUTION",
  "CORS_ALLOWED_ORIGINS",
  // --- Database ---
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "DB_POOL_MAX",
  "DB_SSL",
  "MONGODB_URI",
  // --- Auth & Security ---
  "JWT_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_EXPIRES_IN",
  "ACCESS_TTL",
  "REFRESH_TTL",
  "COOKIE_DOMAIN_MODE",
  "APP_ENCRYPTION_KEY",
  "SUPERADMIN_BOOTSTRAP_EMAIL",
  "SUPERADMIN_BOOTSTRAP_TOKEN",
  // --- Cache & Queue ---
  "CACHE_DRIVER",
  "REDIS_URL",
  "QUEUE_DRIVER",
  // --- Storage (Cloudflare R2 / S3 / MinIO / Local) ---
  "STORAGE_DRIVER",
  "STORAGE_BUCKET",
  "STORAGE_LOCAL_DIR",
  "STORAGE_PUBLIC_BASE_URL",
  "STORAGE_SIGNED_URL_TTL",
  "STORAGE_MAX_UPLOAD_MB",
  "STORAGE_ALLOWED_MIME",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
  // --- SMS / Email / Payments ---
  "SMS_DRIVER",
  "SMS_API_KEY",
  "SMS_SENDER_ID",
  "EMAIL_DRIVER",
  "EMAIL_FROM",
  "PAYMENT_DRIVERS",
  "BKASH_APP_KEY",
  "BKASH_APP_SECRET",
  "NAGAD_MERCHANT_ID",
  "SSLCOMMERZ_STORE_ID",
  "SSLCOMMERZ_STORE_PASS",
  "AAMARPAY_STORE_ID",
  "AAMARPAY_SIGNATURE_KEY",
  // --- Feature Flags ---
  "FEATURE_LIBRARY",
  "FEATURE_TRANSPORT",
  "FEATURE_HOSTEL",
  "FEATURE_SMS",
  "FEATURE_ONLINE_PAYMENTS",
  "FEATURE_COACHING_BATCHES",
  // --- Observability ---
  "SENTRY_DSN",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
] as const;

export const baseEnvSchema = z.object({
  // --- App ---
  NODE_ENV: z
    .enum(["development", "production", "test", "staging"])
    .default("development"),
  APP_NAME: z.string().default("CampusBaba"),
  APP_BASE_DOMAIN: z.string().default("campusbaba.com"),
  PORT: z.string().default("5001"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // --- Tenancy ---
  RESERVED_SUBDOMAINS: z
    .string()
    .default("www,app,api,admin,rms,mail,support,status"),
  TENANT_RESOLUTION: z
    .enum(["host", "host_or_header"])
    .default("host_or_header"),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001"),

  // --- Database ---
  DATABASE_URL: z
    .string()
    .default("postgresql://app_user:app_pass@localhost:5432/campusbaba"),
  DATABASE_ADMIN_URL: z
    .string()
    .default("postgresql://app_admin:admin_pass@localhost:5432/campusbaba"),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(20),
  DB_SSL: z.enum(["true", "false"]).default("false"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/schooler"),

  // --- Auth & Security ---
  JWT_SECRET: z
    .string()
    .default("dev-only-jwt-secret-key-at-least-32-chars-long"),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z
    .string()
    .default("dev-only-refresh-secret-key-at-least-32-chars"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL: z.string().default("30d"),
  COOKIE_DOMAIN_MODE: z.enum(["host-only"]).default("host-only"),
  APP_ENCRYPTION_KEY: z
    .string()
    .default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  SUPERADMIN_BOOTSTRAP_EMAIL: z.string().default(""),
  SUPERADMIN_BOOTSTRAP_TOKEN: z.string().default(""),

  // --- Cache & Queue ---
  CACHE_DRIVER: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  QUEUE_DRIVER: z.enum(["inline", "bullmq"]).default("inline"),

  // --- Storage ---
  STORAGE_DRIVER: z.enum(["local", "r2", "s3", "minio"]).default("local"),
  STORAGE_BUCKET: z.string().default("campusbaba-files"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  STORAGE_PUBLIC_BASE_URL: z.string().default(""),
  STORAGE_SIGNED_URL_TTL: z.coerce.number().int().min(30).default(300),
  STORAGE_MAX_UPLOAD_MB: z.coerce.number().min(1).max(100).default(10),
  STORAGE_ALLOWED_MIME: z
    .string()
    .default(
      "image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
    ),
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default(""),
  R2_ENDPOINT: z.string().default(""),

  // --- SMS / Email / Payments ---
  SMS_DRIVER: z
    .enum(["console", "bulksmsbd", "alpha", "ssl_wireless"])
    .default("console"),
  SMS_API_KEY: z.string().default(""),
  SMS_SENDER_ID: z.string().default("CAMPUSBABA"),
  EMAIL_DRIVER: z.enum(["console", "smtp", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("no-reply@campusbaba.com"),
  PAYMENT_DRIVERS: z.string().default("manual"),
  BKASH_APP_KEY: z.string().default(""),
  BKASH_APP_SECRET: z.string().default(""),
  NAGAD_MERCHANT_ID: z.string().default(""),
  SSLCOMMERZ_STORE_ID: z.string().default(""),
  SSLCOMMERZ_STORE_PASS: z.string().default(""),
  AAMARPAY_STORE_ID: z.string().default(""),
  AAMARPAY_SIGNATURE_KEY: z.string().default(""),

  // --- Feature Flags ---
  FEATURE_LIBRARY: z.enum(["true", "false"]).default("true"),
  FEATURE_TRANSPORT: z.enum(["true", "false"]).default("true"),
  FEATURE_HOSTEL: z.enum(["true", "false"]).default("true"),
  FEATURE_SMS: z.enum(["true", "false"]).default("true"),
  FEATURE_ONLINE_PAYMENTS: z.enum(["true", "false"]).default("true"),
  FEATURE_COACHING_BATCHES: z.enum(["true", "false"]).default("true"),

  // --- Observability ---
  SENTRY_DSN: z.string().default(""),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(""),
});

export type ParsedEnv = z.infer<typeof baseEnvSchema>;

/**
 * Validates environment variables. In production, enforces strict secret presence
 * (no silent fallback secrets, host-only tenant resolution, R2 credentials when r2 is selected).
 */
export const parseEnv = (
  rawEnv: Record<string, string | undefined> = process.env,
  exitOnError = true
): ParsedEnv => {
  try {
    const parsed = baseEnvSchema.parse(rawEnv);
    const missingProdVars: string[] = [];

    if (parsed.NODE_ENV === "production") {
      if (!rawEnv.JWT_SECRET && !rawEnv.JWT_ACCESS_SECRET) {
        missingProdVars.push("JWT_SECRET or JWT_ACCESS_SECRET (required in production)");
      }
      if (!rawEnv.JWT_REFRESH_SECRET) {
        missingProdVars.push("JWT_REFRESH_SECRET (required in production)");
      }
      if (!rawEnv.APP_ENCRYPTION_KEY || rawEnv.APP_ENCRYPTION_KEY.length < 32) {
        missingProdVars.push("APP_ENCRYPTION_KEY (min 32 chars required in production)");
      }
      if (!rawEnv.DATABASE_URL) {
        missingProdVars.push("DATABASE_URL (required in production)");
      }
      if (parsed.STORAGE_DRIVER === "r2") {
        if (!parsed.R2_ACCOUNT_ID) missingProdVars.push("R2_ACCOUNT_ID");
        if (!parsed.R2_ACCESS_KEY_ID) missingProdVars.push("R2_ACCESS_KEY_ID");
        if (!parsed.R2_SECRET_ACCESS_KEY) missingProdVars.push("R2_SECRET_ACCESS_KEY");
      }
      if (parsed.CACHE_DRIVER === "redis" && !rawEnv.REDIS_URL) {
        missingProdVars.push("REDIS_URL");
      }
    }

    if (missingProdVars.length > 0) {
      const msg = `Missing or invalid required production environment variables:\n  - ${missingProdVars.join("\n  - ")}`;
      throw new Error(msg);
    }

    // Force host-only tenant resolution in production unless explicitly overridden for staging tests
    if (parsed.NODE_ENV === "production" && !rawEnv.TENANT_RESOLUTION) {
      parsed.TENANT_RESOLUTION = "host";
    }

    return parsed;
  } catch (error: any) {
    if (exitOnError) {
      console.error("❌ Invalid environment variables:", error.message || error);
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv(process.env, process.env.NODE_ENV !== "test");
