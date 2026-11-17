import { AppConfig, config as defaultConfig } from "../config";
import {
  StoragePort,
  SmsPort,
  PaymentGatewayPort,
  CachePort,
  QueuePort,
  PdfPort,
  EmailPort,
  PushPort,
  ScanPort,
  ClockPort,
  IdGeneratorPort,
  AuditPort,
} from "../ports";
import { LocalFsStorageAdapter } from "../infrastructure/storage/local-fs.adapter";
import { S3CompatibleStorageAdapter } from "../infrastructure/storage/r2.adapter";
import {
  ConsoleSmsAdapter,
  BulkSmsBdAdapter,
  AlphaSmsAdapter,
  SslWirelessSmsAdapter,
} from "../infrastructure/sms/sms.adapters";
import { BangladeshiPaymentGatewayAdapter } from "../infrastructure/payments/payment.adapters";
import { ProviderResolver } from "../infrastructure/security/ProviderResolver";
import {
  MemoryCacheAdapter,
  InlineQueueAdapter,
  NotoBengaliPdfAdapter,
  AppendOnlyAuditAdapter,
  SystemClockAdapter,
  UuidV7GeneratorAdapter,
  ConsoleEmailAdapter,
  ConsolePushAdapter,
  NoopScanAdapter,
} from "../infrastructure/system/system.adapters";
import { RlsTenantStore } from "../infrastructure/persistence/postgres/rlsTransaction";
import { PlatformSaasService } from "../application/services/PlatformSaasService";
import { InvitationAuthService } from "../application/services/InvitationAuthService";
import { FileStorageService } from "../application/services/FileStorageService";
import { BangladeshModulesService } from "../application/services/BangladeshModulesService";

export interface AppContainer {
  readonly config: AppConfig;
  readonly storage: StoragePort;
  readonly sms: SmsPort;
  readonly paymentGateways: ReadonlyMap<string, PaymentGatewayPort>;
  readonly providerResolver: ProviderResolver;
  readonly cache: CachePort;
  readonly queue: QueuePort;
  readonly pdf: PdfPort;
  readonly email: EmailPort;
  readonly push: PushPort;
  readonly scanner: ScanPort;
  readonly clock: ClockPort;
  readonly idGenerator: IdGeneratorPort;
  readonly audit: AuditPort;
  readonly rlsStore: RlsTenantStore;
  readonly platformSaas: PlatformSaasService;
  readonly invitationAuth: InvitationAuthService;
  readonly fileStorage: FileStorageService;
  readonly bdModules: BangladeshModulesService;
}

/**
 * Composition Root — The ONLY module in campusBaba_api that wires Ports to Concrete Adapters
 * and Application Use-Case Services based on the validated AppConfig.
 */
export function createContainer(cfg: AppConfig = defaultConfig): AppContainer {
  // 1. StoragePort selection (local | r2 | s3 | minio)
  let storage: StoragePort;
  if (cfg.storage.driver === "local") {
    storage = new LocalFsStorageAdapter({
      rootDir: cfg.storage.localDir,
      signingSecret: cfg.auth.accessSecret,
      defaultTtlSeconds: cfg.storage.signedUrlTtlSeconds,
    });
  } else {
    storage = new S3CompatibleStorageAdapter({
      driverName: cfg.storage.driver,
      endpoint:
        cfg.storage.r2.endpoint ||
        `https://${cfg.storage.r2.accountId || "demo"}.r2.cloudflarestorage.com`,
      bucket: cfg.storage.bucket,
      accessKeyId: cfg.storage.r2.accessKeyId || "demo-key",
      secretAccessKey: cfg.storage.r2.secretAccessKey || cfg.auth.accessSecret,
      defaultTtlSeconds: cfg.storage.signedUrlTtlSeconds,
    });
  }

  // 2. SmsPort selection (console | bulksmsbd | alpha | ssl_wireless)
  let sms: SmsPort;
  const senderId = cfg.env.SMS_SENDER_ID || "CAMPUSBABA";
  switch (cfg.drivers.sms) {
    case "bulksmsbd":
      sms = new BulkSmsBdAdapter(senderId);
      break;
    case "alpha":
      sms = new AlphaSmsAdapter(senderId);
      break;
    case "ssl_wireless":
      sms = new SslWirelessSmsAdapter(senderId);
      break;
    default:
      sms = new ConsoleSmsAdapter(senderId);
      break;
  }

  // 3. PaymentGatewayPort instances
  const allGatewayCodes: ("manual" | "sslcommerz" | "bkash" | "nagad" | "aamarpay")[] = [
    "manual",
    "sslcommerz",
    "bkash",
    "nagad",
    "aamarpay",
  ];
  const paymentGatewayList = allGatewayCodes.map(
    (code) =>
      new BangladeshiPaymentGatewayAdapter({
        gatewayCode: code,
        signingSecret: `${cfg.auth.accessSecret}:${code}`,
      })
  );
  const paymentGateways = new Map<string, PaymentGatewayPort>(
    paymentGatewayList.map((g) => [g.gatewayCode, g])
  );

  // 4. Per-Tenant ProviderResolver with AES-256-GCM envelope encryption
  const providerResolver = new ProviderResolver({
    encryptionKey: cfg.auth.encryptionKey,
    defaultSms: sms,
    defaultPaymentGateways: paymentGatewayList,
  });

  // 5. System Ports
  const cache = new MemoryCacheAdapter();
  const queue = new InlineQueueAdapter();
  const pdf = new NotoBengaliPdfAdapter();
  const email = new ConsoleEmailAdapter();
  const push = new ConsolePushAdapter();
  const scanner = new NoopScanAdapter();
  const clock = new SystemClockAdapter();
  const idGenerator = new UuidV7GeneratorAdapter();
  const audit = new AppendOnlyAuditAdapter();
  const rlsStore = new RlsTenantStore();

  // 6. Application Use-Case Services
  const platformSaas = new PlatformSaasService({
    audit,
    idGen: idGenerator,
    clock,
    storage,
    rlsStore,
  });

  const invitationAuth = new InvitationAuthService({
    accessSecret: cfg.auth.accessSecret,
    refreshSecret: cfg.auth.refreshSecret,
    accessTtl: cfg.auth.accessTtl,
    refreshTtl: cfg.auth.refreshTtl,
    rlsStore,
    idGen: idGenerator,
    clock,
    audit,
  });

  const fileStorage = new FileStorageService({
    storage,
    rlsStore,
    audit,
    idGen: idGenerator,
    scanner,
    maxUploadBytes: cfg.storage.maxUploadBytes,
    allowedMimeTypes: cfg.storage.allowedMimeTypes,
  });

  const bdModules = new BangladeshModulesService({
    rlsStore,
    providerResolver,
    pdf,
    audit,
    idGen: idGenerator,
  });

  return Object.freeze({
    config: cfg,
    storage,
    sms,
    paymentGateways,
    providerResolver,
    cache,
    queue,
    pdf,
    email,
    push,
    scanner,
    clock,
    idGenerator,
    audit,
    rlsStore,
    platformSaas,
    invitationAuth,
    fileStorage,
    bdModules,
  });
}

export const container = createContainer(defaultConfig);
