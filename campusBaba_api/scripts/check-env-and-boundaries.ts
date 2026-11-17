import fs from "fs";
import path from "path";
import { ENV_KEYS } from "../src/config/env";

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") {
        continue;
      }
      results.push(...walkTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function parseEnvExampleKeys(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing .env.example file at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const keys: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      keys.push(trimmed.slice(0, eqIdx).trim());
    }
  }
  return keys;
}

/**
 * CI Gate:
 * 1. Verifies `.env.example` exists for all 3 apps and matches Zod schema keys.
 * 2. Verifies no server secret is referenced in frontend client code.
 * 3. Verifies Hexagonal Architecture boundaries in `campusBaba_api/src/`:
 *    - Only `src/config/` may reference `process.env`.
 *    - `src/domain/`, `src/ports/`, and `src/application/` must never import `express`, `mongoose`, `pg`, `drizzle-orm`, or `@aws-sdk/`.
 */
export function runEnvAndBoundaryChecks(): {
  passed: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const repoRoot = path.resolve(__dirname, "../..");

  // 1. Check .env.example parity for all 3 apps
  const apiEnvExample = path.join(repoRoot, "campusBaba_api/.env.example");
  const uiEnvExample = path.join(repoRoot, "campusBaba_ui/.env.example");
  const rmsEnvExample = path.join(repoRoot, "campusbaba-rms/.env.example");

  try {
    const apiExampleKeys = new Set(parseEnvExampleKeys(apiEnvExample));
    for (const k of ENV_KEYS) {
      if (!apiExampleKeys.has(k)) {
        violations.push(`campusBaba_api/.env.example is missing schema key '${k}'`);
      }
    }
    for (const k of apiExampleKeys) {
      if (!ENV_KEYS.includes(k as any)) {
        violations.push(`campusBaba_api/.env.example has undocumented key '${k}' not in Zod schema`);
      }
    }
  } catch (err: any) {
    violations.push(err.message);
  }

  for (const [appName, exPath] of [
    ["campusBaba_ui", uiEnvExample],
    ["campusbaba-rms", rmsEnvExample],
  ] as const) {
    try {
      const keys = parseEnvExampleKeys(exPath);
      if (keys.length === 0) {
        violations.push(`${appName}/.env.example is empty`);
      }
    } catch (err: any) {
      violations.push(err.message);
    }
  }

  // 2. Check that no backend secret is referenced in client-side UI/RMS components
  const serverSecretNames = [
    "JWT_SECRET",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "APP_ENCRYPTION_KEY",
    "R2_SECRET_ACCESS_KEY",
    "DATABASE_URL",
    "DATABASE_ADMIN_URL",
    "SUPERADMIN_BOOTSTRAP_TOKEN",
  ];
  const clientDirs = [
    path.join(repoRoot, "campusBaba_ui/src"),
    path.join(repoRoot, "campusbaba-rms/src"),
  ];
  for (const dir of clientDirs) {
    for (const file of walkTsFiles(dir)) {
      const content = fs.readFileSync(file, "utf8");
      for (const secret of serverSecretNames) {
        if (content.includes(`process.env.${secret}`)) {
          violations.push(
            `Client leak: server secret '${secret}' referenced in ${path.relative(repoRoot, file)}`
          );
        }
      }
    }
  }

  // 3. Enforce Hexagonal Architecture boundaries in campusBaba_api/src
  const apiSrc = path.join(repoRoot, "campusBaba_api/src");
  const configDir = path.join(apiSrc, "config");

  for (const file of walkTsFiles(apiSrc)) {
    const rel = path.relative(apiSrc, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");

    // Rule A: No process.env outside src/config/
    if (!file.startsWith(configDir)) {
      if (/\bprocess\.env\b/.test(content)) {
        violations.push(
          `Boundary violation: 'process.env' accessed outside src/config/ in src/${rel}`
        );
      }
    }

    // Rule B: Pure layers (domain, ports, application) must not import Express, Mongoose, PG, Drizzle, or AWS SDK
    if (
      rel.startsWith("domain/") ||
      rel.startsWith("ports/") ||
      rel.startsWith("application/")
    ) {
      const forbiddenImports = [
        "express",
        "mongoose",
        "pg",
        "drizzle-orm",
        "@aws-sdk/",
      ];
      for (const mod of forbiddenImports) {
        const importRegex = new RegExp(`from\\s+["']${mod}`, "i");
        if (importRegex.test(content)) {
          violations.push(
            `Boundary violation: pure layer 'src/${rel}' imports forbidden infrastructure/transport package '${mod}'`
          );
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

if (require.main === module) {
  const res = runEnvAndBoundaryChecks();
  if (!res.passed) {
    console.error("❌ Environment & Architecture Boundary Check Failed:");
    for (const v of res.violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }
  console.log(
    "✅ Environment & Architecture Boundary Check Passed (.env.example synced, no secret leaks, Hexagonal boundaries clean)."
  );
}
