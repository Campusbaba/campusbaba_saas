import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { container } from "../composition/container";
import { PermissionCode, roleHasPermission } from "../domain/rbac/Permissions";
import { AppError } from "./errorHandler";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        referenceId: string;
        tenantId: string;
        impersonatedBy?: string;
      };
      superAdmin?: {
        id: string;
        email: string;
        role: "superadmin";
      };
    }
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

export function extractBearerOrCookieToken(
  req: Request,
  cookieName: string
): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[cookieName] || null;
}

/**
 * Per-IP / Per-Tenant Rate Limiting Middleware
 */
export function rateLimit(opts: { windowSeconds: number; maxRequests: number; keyPrefix: string }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantPart = req.tenant?.subdomain || "global";
      const ipPart = req.ip || req.socket?.remoteAddress || "unknown";
      const key = `rl:${opts.keyPrefix}:${tenantPart}:${ipPart}`;
      const count = await container.cache.incrWithTtl(key, opts.windowSeconds);
      if (count > opts.maxRequests) {
        return res.status(429).json({
          success: false,
          message: "Too many requests. Please try again later.",
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * SuperAdmin Authentication, Role Guard & Automatic Mutation Audit Logger (Fixes P0-1)
 */
export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractBearerOrCookieToken(req, "superadmin_token");
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "SuperAdmin authentication required",
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, container.config.auth.accessSecret);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired SuperAdmin token",
      });
    }

    if (decoded.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: SuperAdmin role required",
      });
    }

    req.superAdmin = {
      id: String(decoded.id),
      email: String(decoded.email || "superadmin"),
      role: "superadmin",
    };

    // Automatically record platform audit log on mutating requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      await container.audit.record({
        actorUserId: req.superAdmin.id,
        action: `superadmin.${req.method.toLowerCase()}.${req.path}`,
        entityType: "PlatformRoute",
        entityId: req.params?.id || null,
        ipAddress: req.ip || null,
        metadata: {
          method: req.method,
          path: req.originalUrl,
        },
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Tenant User Authentication & Cross-Tenant Token Isolation Guard (Fixes P0-2 & P0-3)
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = extractBearerOrCookieToken(req, "access_token");
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please sign in.",
    });
  }

  const activeTenantId =
    req.tenant?.subdomain || req.tenant?.id || (req as any).resolvedTenantSlug;

  if (!activeTenantId) {
    return res.status(400).json({
      success: false,
      message: "Tenant context missing for authentication",
    });
  }

  try {
    const claims = container.invitationAuth.verifyTenantAccessToken(
      token,
      activeTenantId
    );
    req.user = claims;
    next();
  } catch (err: any) {
    const isCrossTenant = String(err.message || "").includes("Cross-tenant");
    return res.status(isCrossTenant ? 403 : 401).json({
      success: false,
      message: err.message || "Invalid or expired token",
    });
  }
};

/**
 * Role-Based & Permission-Based Access Control Middleware (Fixes P0-2)
 */
export const authorize = (...requiredPermissions: PermissionCode[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    for (const perm of requiredPermissions) {
      if (!roleHasPermission(req.user.role, perm)) {
        return res.status(403).json({
          success: false,
          message: `Forbidden: role '${req.user.role}' lacks permission '${perm}'`,
        });
      }
    }

    next();
  };
};
