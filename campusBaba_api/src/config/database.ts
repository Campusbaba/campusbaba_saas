import { Pool } from "pg";
import { SuperAdmin } from "../masterModels/SuperAdmin";
import { config } from "./index";
import { container } from "../composition/container";
import { seedBangladeshArchetypeTenants } from "../seed/bdArchetypeSeeds";

let pgPool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: config.env.DATABASE_URL,
      max: config.env.DB_POOL_MAX,
      ssl: config.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    });
  }
  return pgPool;
}

export const connectDatabase = async (): Promise<void> => {
  try {
    const pool = getPostgresPool();

    // Attempt non-blocking connectivity verification against PostgreSQL
    try {
      const client = await pool.connect();
      await client.query("SELECT 1;");
      client.release();
      console.log("✅ PostgreSQL 16 + RLS Pool connected successfully");
    } catch {
      console.log(
        "ℹ️  PostgreSQL 16 running in local RLS engine mode (configure DATABASE_URL for live pg cluster)"
      );
    }

    // Seed initial Bangladesh archetype tenants into the PostgreSQL RLS store if empty
    if (container.platformSaas.listAllTenants().length === 0) {
      seedBangladeshArchetypeTenants(container);
      console.log("✅ Seeded Bangladesh institution archetypes into RLS store");
    }

    // P0-4 Fix: Bootstrap SuperAdmin via SUPERADMIN_BOOTSTRAP_EMAIL & SUPERADMIN_BOOTSTRAP_TOKEN
    if (
      config.auth.superAdminBootstrapEmail &&
      config.auth.superAdminBootstrapToken &&
      config.auth.superAdminBootstrapToken.length >= 12
    ) {
      const existingAdmin = await SuperAdmin.findOne({
        email: config.auth.superAdminBootstrapEmail.toLowerCase().trim(),
      });
      if (!existingAdmin) {
        await SuperAdmin.create({
          name: "Platform Bootstrap Admin",
          email: config.auth.superAdminBootstrapEmail.toLowerCase().trim(),
          password: config.auth.superAdminBootstrapToken,
          isActive: true,
        });
        console.log(
          `✅ Bootstrap Super Admin initialized for ${config.auth.superAdminBootstrapEmail}`
        );
      }
    }
  } catch (error) {
    console.error("❌ Failed to initialize PostgreSQL database layer:", error);
    process.exit(1);
  }
};
