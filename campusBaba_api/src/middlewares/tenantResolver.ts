import { Request, Response, NextFunction } from "express";
import { Tenant } from "../masterModels/Tenant";
import { container } from "../composition/container";
import { RlsTenantStore } from "../infrastructure/persistence/postgres/rlsTransaction";

declare global {
  namespace Express {
    interface Request {
      tenant?: any;
      resolvedTenantSlug?: string;
    }
  }
}

/**
 * Extracts subdomain slug from HTTP Host / hostname.
 * Supports:
 * - <slug>.campusbaba.com -> <slug>
 * - <slug>.localhost -> <slug>
 */
export function extractHostSubdomain(
  hostHeaderOrHostname: string,
  baseDomain: string
): string | null {
  if (!hostHeaderOrHostname) return null;
  const cleanHost = hostHeaderOrHostname.split(":")[0].toLowerCase().trim();

  if (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost === baseDomain
  ) {
    return null;
  }

  if (cleanHost.endsWith(`.${baseDomain}`)) {
    const sub = cleanHost.slice(0, -(baseDomain.length + 1));
    if (sub && !sub.includes(".")) return sub;
  }

  if (cleanHost.endsWith(".localhost")) {
    const sub = cleanHost.slice(0, -".localhost".length);
    if (sub && !sub.includes(".")) return sub;
  }

  const parts = cleanHost.split(".");
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

/**
 * Hardened Multi-Tenant Resolver (Pure PostgreSQL RLS — Fixes P0-3):
 * 1. Resolves tenant from verified HTTP Host header first.
 * 2. Blocks reserved platform slugs (www, app, api, admin, rms, mail, support, status).
 * 3. Rejects any request where `x-tenant-id` header attempts to spoof a different tenant than the Host header.
 * 4. In production (`TENANT_RESOLUTION=host`), completely rejects `x-tenant-id` when Host has no valid tenant subdomain.
 * 5. Enforces subscription lifecycle (`inactive` / `suspended` / `purged` blocked with 403).
 * 6. Establishes PostgreSQL `RlsTenantStore` (`SET LOCAL app.current_tenant`) context in `AsyncLocalStorage`.
 */
export const tenantResolver = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawHost =
      (req.headers["x-forwarded-host"] as string) ||
      req.headers.host ||
      req.hostname ||
      "";
    const hostSubdomain = extractHostSubdomain(
      rawHost,
      container.config.app.baseDomain
    );
    const headerTenantId = (req.headers["x-tenant-id"] as string | undefined)
      ?.toLowerCase()
      .trim();

    // P0-3 Guard 1: If both Host subdomain and x-tenant-id header are present and differ -> block spoofing!
    if (hostSubdomain && headerTenantId && hostSubdomain !== headerTenantId) {
      return res.status(403).json({
        success: false,
        message: `Cross-tenant header spoofing rejected: Host '${hostSubdomain}' does not match x-tenant-id '${headerTenantId}'`,
      });
    }

    // P0-3 Guard 2: In strict 'host' mode, never trust x-tenant-id without a matching Host subdomain
    const resolutionMode = container.config.tenancy.resolutionMode;
    const tenantId =
      resolutionMode === "host"
        ? hostSubdomain
        : hostSubdomain || headerTenantId || null;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Tenant subdomain could not be resolved from Host",
      });
    }

    // Block reserved subdomains (www, app, api, admin, rms, mail, support, status)
    if (container.config.tenancy.reservedSubdomains.has(tenantId)) {
      return res.status(400).json({
        success: false,
        message: `Subdomain '${tenantId}' is a reserved platform subdomain`,
      });
    }

    let tenant: any = container.platformSaas.getTenant(tenantId);
    if (!tenant) {
      tenant = await Tenant.findOne({ subdomain: tenantId });
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    if (
      tenant.subscriptionStatus === "inactive" ||
      tenant.subscriptionStatus === "suspended" ||
      tenant.subscriptionStatus === "purged"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Tenant subscription is inactive or suspended. Please contact support.",
      });
    }

    req.tenant = tenant;
    req.resolvedTenantSlug = tenant.subdomain;

    // Bind PostgreSQL Row-Level Security (RLS) context (`app.current_tenant`)
    RlsTenantStore.runWithTenantContext(
      {
        tenantId: tenant.subdomain,
        tenantSlug: tenant.subdomain,
      },
      () => next()
    );
  } catch (error) {
    console.error("Tenant Resolver Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resolve tenant",
    });
  }
};
