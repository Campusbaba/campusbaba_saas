export interface EmailPort {
  readonly driverName: string;
  sendEmail(input: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
  }): Promise<{ messageId: string }>;
}

export interface CachePort {
  readonly driverName: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPrefix(prefix: string): Promise<number>;
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

export interface QueueJob<TPayload = unknown> {
  id: string;
  queueName: string;
  payload: TPayload;
  tenantId?: string;
  attempts: number;
}

export interface QueuePort {
  readonly driverName: string;
  enqueue<TPayload>(
    queueName: string,
    payload: TPayload,
    opts?: { tenantId?: string; delayMs?: number; idempotencyKey?: string }
  ): Promise<{ jobId: string }>;

  registerWorker<TPayload>(
    queueName: string,
    handler: (job: QueueJob<TPayload>) => Promise<void>
  ): void;

  getStats(): Promise<{ queued: number; processed: number; failed: number }>;
}

export interface PdfPort {
  readonly driverName: string;
  renderHtmlToPdf(
    html: string,
    opts?: { format?: "A4" | "THERMAL_80MM" | "THERMAL_58MM" | "ID_CARD"; landscape?: boolean }
  ): Promise<Buffer>;
}

export interface PushPort {
  readonly driverName: string;
  sendPushNotification(input: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<{ delivered: boolean }>;
}

export interface ScanPort {
  readonly driverName: string;
  scanBuffer(buffer: Buffer, filename: string): Promise<{ clean: boolean; threat?: string }>;
}

export interface ClockPort {
  now(): Date;
  todayDhaka(): string; // YYYY-MM-DD in Asia/Dhaka
}

export interface IdGeneratorPort {
  newUuid(): string;
  newRandomToken(bytes?: number): string;
}

export interface AuditEntry {
  id?: string;
  tenantId?: string | null;
  actorUserId?: string | null;
  impersonatedByAdminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt?: Date;
}

export interface AuditPort {
  record(entry: AuditEntry): Promise<AuditEntry>;
  query(filter: {
    tenantId?: string;
    action?: string;
    actorUserId?: string;
    limit?: number;
  }): Promise<AuditEntry[]>;
}
