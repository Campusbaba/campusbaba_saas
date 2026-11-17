import fs from "fs";
import path from "path";
import { TENANT_RLS_TABLES } from "../src/infrastructure/persistence/postgres/schema";

/**
 * CI Gate: Verifies that every tenant-scoped table in `TENANT_RLS_TABLES`
 * has:
 * 1. `CREATE TABLE IF NOT EXISTS <tableName>` with `tenant_id uuid NOT NULL`
 * 2. `ALTER TABLE <tableName> ENABLE ROW LEVEL SECURITY;`
 * 3. `ALTER TABLE <tableName> FORCE ROW LEVEL SECURITY;`
 * 4. `CREATE POLICY tenant_isolation_policy ON <tableName>` with `USING` and `WITH CHECK`
 */
export function verifyRlsPoliciesOnMigration(sqlContent: string): {
  passed: boolean;
  checkedTables: number;
  violations: string[];
} {
  const violations: string[] = [];

  for (const table of TENANT_RLS_TABLES) {
    const createTableRegex = new RegExp(
      `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\);`,
      "i"
    );
    const tableMatch = sqlContent.match(createTableRegex);
    if (!tableMatch) {
      violations.push(`Missing CREATE TABLE definition for tenant table '${table}'`);
      continue;
    }

    const columnsBody = tableMatch[1];
    if (!/tenant_id\s+uuid\s+NOT\s+NULL/i.test(columnsBody)) {
      violations.push(
        `Table '${table}' is missing 'tenant_id uuid NOT NULL' column constraint`
      );
    }

    const enableRlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`,
      "i"
    );
    if (!enableRlsRegex.test(sqlContent)) {
      violations.push(`Table '${table}' is missing ENABLE ROW LEVEL SECURITY`);
    }

    const forceRlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`,
      "i"
    );
    if (!forceRlsRegex.test(sqlContent)) {
      violations.push(`Table '${table}' is missing FORCE ROW LEVEL SECURITY`);
    }

    const policyRegex = new RegExp(
      `CREATE\\s+POLICY\\s+tenant_isolation_policy\\s+ON\\s+${table}\\s+AS\\s+RESTRICTIVE\\s+FOR\\s+ALL\\s+TO\\s+app_user\\s+USING\\s*\\(\\s*tenant_id\\s*=\\s*current_tenant_id\\(\\)\\s*\\)\\s+WITH\\s+CHECK\\s*\\(\\s*tenant_id\\s*=\\s*current_tenant_id\\(\\)\\s*\\)\\s*;`,
      "i"
    );
    if (!policyRegex.test(sqlContent)) {
      violations.push(
        `Table '${table}' is missing restrictive USING + WITH CHECK tenant_isolation_policy`
      );
    }
  }

  return {
    passed: violations.length === 0,
    checkedTables: TENANT_RLS_TABLES.length,
    violations,
  };
}

if (require.main === module) {
  const migrationPath = path.resolve(
    __dirname,
    "../src/infrastructure/persistence/postgres/migrations/0001_initial_rls_schema.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  const result = verifyRlsPoliciesOnMigration(sql);

  if (!result.passed) {
    console.error("❌ RLS Verification Failed:");
    for (const v of result.violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ RLS Verification Passed: All ${result.checkedTables} tenant tables enforce tenant_id NOT NULL + ENABLE/FORCE RLS + USING/WITH CHECK policy.`
  );
}
