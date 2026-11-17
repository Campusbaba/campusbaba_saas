import { env, parseEnv, ENV_KEYS, ParsedEnv } from "./env";

export interface AppConfig {
  readonly env: ParsedEnv;
  readonly app: {
    readonly name: string;
    readonly nodeEnv: ParsedEnv["NODE_ENV"];
    readonly port: number;
    readonly baseDomain: string;
    readonly logLevel: ParsedEnv["LOG_LEVEL"];
  };
  readonly tenancy: {
    readonly reservedSubdomains: ReadonlySet<string>;
    readonly resolutionMode: "host" | "host_or_header";
    readonly corsAllowedOrigins: readonly string[];
  };
  readonly auth: {
    readonly accessSecret: string;
    readonly refreshSecret: string;
    readonly accessTtl: string;
    readonly refreshTtl: string;
    readonly cookieDomainMode: "host-only";
    readonly encryptionKey: string;
    readonly superAdminBootstrapEmail: string;
    readonly superAdminBootstrapToken: string;
  };
  readonly drivers: {
    readonly storage: ParsedEnv["STORAGE_DRIVER"];
    readonly cache: ParsedEnv["CACHE_DRIVER"];
    readonly queue: ParsedEnv["QUEUE_DRIVER"];
    readonly sms: ParsedEnv["SMS_DRIVER"];
    readonly email: ParsedEnv["EMAIL_DRIVER"];
    readonly payments: readonly string[];
  };
  readonly storage: {
    readonly driver: ParsedEnv["STORAGE_DRIVER"];
    readonly bucket: string;
    readonly localDir: string;
    readonly publicBaseUrl: string;
    readonly signedUrlTtlSeconds: number;
    readonly maxUploadBytes: number;
    readonly allowedMimeTypes: ReadonlySet<string>;
    readonly r2: {
      readonly accountId: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly bucket: string;
      readonly endpoint: string;
    };
  };
  readonly features: {
    readonly library: boolean;
    readonly transport: boolean;
    readonly hostel: boolean;
    readonly sms: boolean;
    readonly onlinePayments: boolean;
    readonly coachingBatches: boolean;
  };
}

export function buildConfig(parsed: ParsedEnv = env): AppConfig {
  const reserved = new Set(
    parsed.RESERVED_SUBDOMAINS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const corsOrigins = parsed.CORS_ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedMimes = new Set(
    parsed.STORAGE_ALLOWED_MIME.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const paymentDrivers = parsed.PAYMENT_DRIVERS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return Object.freeze({
    env: parsed,
    app: Object.freeze({
      name: parsed.APP_NAME,
      nodeEnv: parsed.NODE_ENV,
      port: parseInt(parsed.PORT, 10) || 5001,
      baseDomain: parsed.APP_BASE_DOMAIN.toLowerCase(),
      logLevel: parsed.LOG_LEVEL,
    }),
    tenancy: Object.freeze({
      reservedSubdomains: reserved,
      resolutionMode: parsed.TENANT_RESOLUTION,
      corsAllowedOrigins: Object.freeze(corsOrigins),
    }),
    auth: Object.freeze({
      accessSecret: parsed.JWT_ACCESS_SECRET || parsed.JWT_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      accessTtl: parsed.ACCESS_TTL || parsed.JWT_EXPIRES_IN,
      refreshTtl: parsed.REFRESH_TTL,
      cookieDomainMode: parsed.COOKIE_DOMAIN_MODE,
      encryptionKey: parsed.APP_ENCRYPTION_KEY,
      superAdminBootstrapEmail: parsed.SUPERADMIN_BOOTSTRAP_EMAIL,
      superAdminBootstrapToken: parsed.SUPERADMIN_BOOTSTRAP_TOKEN,
    }),
    drivers: Object.freeze({
      storage: parsed.STORAGE_DRIVER,
      cache: parsed.CACHE_DRIVER,
      queue: parsed.QUEUE_DRIVER,
      sms: parsed.SMS_DRIVER,
      email: parsed.EMAIL_DRIVER,
      payments: Object.freeze(paymentDrivers),
    }),
    storage: Object.freeze({
      driver: parsed.STORAGE_DRIVER,
      bucket: parsed.R2_BUCKET || parsed.STORAGE_BUCKET,
      localDir: parsed.STORAGE_LOCAL_DIR,
      publicBaseUrl: parsed.STORAGE_PUBLIC_BASE_URL,
      signedUrlTtlSeconds: parsed.STORAGE_SIGNED_URL_TTL,
      maxUploadBytes: parsed.STORAGE_MAX_UPLOAD_MB * 1024 * 1024,
      allowedMimeTypes: allowedMimes,
      r2: Object.freeze({
        accountId: parsed.R2_ACCOUNT_ID,
        accessKeyId: parsed.R2_ACCESS_KEY_ID,
        secretAccessKey: parsed.R2_SECRET_ACCESS_KEY,
        bucket: parsed.R2_BUCKET || parsed.STORAGE_BUCKET,
        endpoint:
          parsed.R2_ENDPOINT ||
          (parsed.R2_ACCOUNT_ID
            ? `https://${parsed.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
            : ""),
      }),
    }),
    features: Object.freeze({
      library: parsed.FEATURE_LIBRARY === "true",
      transport: parsed.FEATURE_TRANSPORT === "true",
      hostel: parsed.FEATURE_HOSTEL === "true",
      sms: parsed.FEATURE_SMS === "true",
      onlinePayments: parsed.FEATURE_ONLINE_PAYMENTS === "true",
      coachingBatches: parsed.FEATURE_COACHING_BATCHES === "true",
    }),
  });
}

export const config = buildConfig(env);
export { env, parseEnv, ENV_KEYS };
