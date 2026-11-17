import { Readable } from "stream";

export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
  etag?: string;
  checksumSha256?: string;
}

export interface ObjectInfo {
  key: string;
  sizeBytes: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export interface StoragePort {
  readonly driverName: string;

  putObject(
    key: string,
    body: Buffer | Readable,
    opts: {
      contentType: string;
      sizeBytes: number;
      metadata?: Record<string, string>;
      tenantId?: string;
    }
  ): Promise<StoredObject>;

  getSignedDownloadUrl(
    key: string,
    opts?: {
      ttlSeconds?: number;
      downloadName?: string;
      forceDownload?: boolean;
      tenantId?: string;
    }
  ): Promise<string>;

  createSignedUploadUrl(
    key: string,
    opts: {
      contentType: string;
      maxBytes: number;
      ttlSeconds?: number;
      tenantId?: string;
    }
  ): Promise<{ url: string; headers: Record<string, string> }>;

  headObject(key: string, opts?: { tenantId?: string }): Promise<ObjectInfo | null>;

  getObjectBuffer(key: string, opts?: { tenantId?: string }): Promise<Buffer>;

  deleteObject(key: string, opts?: { tenantId?: string }): Promise<void>;

  deletePrefix(prefix: string, opts?: { tenantId?: string }): Promise<number>;

  list(
    prefix: string,
    cursor?: string,
    opts?: { tenantId?: string }
  ): Promise<{ items: ObjectInfo[]; next?: string }>;

  verifySignedUrl?(url: string, currentTenantId?: string): {
    valid: boolean;
    key?: string;
    expired?: boolean;
    reason?: string;
  };
}
