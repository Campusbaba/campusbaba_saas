import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { StoragePort, StoredObject, ObjectInfo } from "../../ports/StoragePort";
import { StorageKeyBuilder } from "../../domain/storage/StorageKeyBuilder";

async function streamToBuffer(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Local Filesystem Adapter for StoragePort
 * - Works out-of-the-box in dev/test with zero external accounts.
 * - Enforces tenant prefix isolation on every operation.
 * - Generates and verifies HMAC-SHA256 signed upload/download URLs with TTL expiry.
 */
export class LocalFsStorageAdapter implements StoragePort {
  readonly driverName = "local";
  private readonly rootDir: string;
  private readonly signingSecret: string;
  private readonly baseUrl: string;
  private readonly defaultTtlSeconds: number;
  private readonly metaStore = new Map<
    string,
    { contentType: string; metadata?: Record<string, string>; lastModified: Date }
  >();

  constructor(opts: {
    rootDir: string;
    signingSecret: string;
    baseUrl?: string;
    defaultTtlSeconds?: number;
  }) {
    this.rootDir = path.resolve(opts.rootDir);
    this.signingSecret = opts.signingSecret;
    this.baseUrl = opts.baseUrl || "http://localhost:5001/api/v1/files/local-stream";
    this.defaultTtlSeconds = opts.defaultTtlSeconds || 300;
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  private resolveSafeFilePath(key: string, tenantId?: string): string {
    if (tenantId) {
      StorageKeyBuilder.assertKeyBelongsToTenant(key, tenantId);
    } else if (key.includes("..") || key.includes("\\") || key.startsWith("/")) {
      throw new Error("Path traversal detected in storage key");
    }

    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error("Path escapes storage root directory");
    }
    return resolved;
  }

  private signParams(payload: string): string {
    return crypto
      .createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("hex");
  }

  async putObject(
    key: string,
    body: Buffer | Readable,
    opts: {
      contentType: string;
      sizeBytes: number;
      metadata?: Record<string, string>;
      tenantId?: string;
    }
  ): Promise<StoredObject> {
    const filePath = this.resolveSafeFilePath(key, opts.tenantId);
    const buffer = await streamToBuffer(body);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);

    const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    this.metaStore.set(key, {
      contentType: opts.contentType,
      metadata: opts.metadata,
      lastModified: new Date(),
    });

    return {
      key,
      sizeBytes: buffer.length,
      contentType: opts.contentType,
      etag: `"${checksumSha256.slice(0, 32)}"`,
      checksumSha256,
    };
  }

  async getSignedDownloadUrl(
    key: string,
    opts?: {
      ttlSeconds?: number;
      downloadName?: string;
      forceDownload?: boolean;
      tenantId?: string;
    }
  ): Promise<string> {
    this.resolveSafeFilePath(key, opts?.tenantId);
    const ttl = opts?.ttlSeconds ?? this.defaultTtlSeconds;
    const exp = Date.now() + ttl * 1000;
    const disposition =
      opts?.forceDownload || (opts?.downloadName && !key.match(/\.(jpg|jpeg|png|webp)$/i))
        ? "attachment"
        : "inline";
    const payload = `GET:${key}:${exp}:${disposition}`;
    const sig = this.signParams(payload);
    const params = new URLSearchParams({
      key,
      exp: String(exp),
      disp: disposition,
      ...(opts?.downloadName ? { filename: opts.downloadName } : {}),
      sig,
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  async createSignedUploadUrl(
    key: string,
    opts: {
      contentType: string;
      maxBytes: number;
      ttlSeconds?: number;
      tenantId?: string;
    }
  ): Promise<{ url: string; headers: Record<string, string> }> {
    this.resolveSafeFilePath(key, opts.tenantId);
    const ttl = opts.ttlSeconds ?? this.defaultTtlSeconds;
    const exp = Date.now() + ttl * 1000;
    const payload = `PUT:${key}:${opts.contentType}:${opts.maxBytes}:${exp}`;
    const sig = this.signParams(payload);
    const params = new URLSearchParams({
      key,
      contentType: opts.contentType,
      maxBytes: String(opts.maxBytes),
      exp: String(exp),
      sig,
    });
    return {
      url: `${this.baseUrl}/upload?${params.toString()}`,
      headers: {
        "Content-Type": opts.contentType,
        "x-max-content-length": String(opts.maxBytes),
      },
    };
  }

  verifySignedUrl(
    urlStr: string,
    currentTenantId?: string
  ): { valid: boolean; key?: string; expired?: boolean; reason?: string } {
    try {
      const parsed = new URL(urlStr);
      const key = parsed.searchParams.get("key") || "";
      const exp = Number(parsed.searchParams.get("exp") || "0");
      const sig = parsed.searchParams.get("sig") || "";

      if (!key || !exp || !sig) {
        return { valid: false, reason: "Missing signed URL parameters" };
      }
      if (Date.now() > exp) {
        return { valid: false, key, expired: true, reason: "Signed URL has expired" };
      }
      if (currentTenantId) {
        StorageKeyBuilder.assertKeyBelongsToTenant(key, currentTenantId);
      }

      const isUpload = parsed.pathname.endsWith("/upload");
      const expectedPayload = isUpload
        ? `PUT:${key}:${parsed.searchParams.get("contentType")}:${parsed.searchParams.get("maxBytes")}:${exp}`
        : `GET:${key}:${exp}:${parsed.searchParams.get("disp") || "inline"}`;
      const expectedSig = this.signParams(expectedPayload);

      if (sig !== expectedSig) {
        return { valid: false, key, reason: "Invalid signature on signed URL" };
      }

      return { valid: true, key };
    } catch (err: any) {
      return { valid: false, reason: err.message || "Invalid signed URL" };
    }
  }

  async headObject(key: string, opts?: { tenantId?: string }): Promise<ObjectInfo | null> {
    const filePath = this.resolveSafeFilePath(key, opts?.tenantId);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const meta = this.metaStore.get(key);
    return {
      key,
      sizeBytes: stat.size,
      contentType: meta?.contentType || "application/octet-stream",
      lastModified: meta?.lastModified || stat.mtime,
      metadata: meta?.metadata,
    };
  }

  async getObjectBuffer(key: string, opts?: { tenantId?: string }): Promise<Buffer> {
    const filePath = this.resolveSafeFilePath(key, opts?.tenantId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object not found: ${key}`);
    }
    return fs.readFileSync(filePath);
  }

  async deleteObject(key: string, opts?: { tenantId?: string }): Promise<void> {
    const filePath = this.resolveSafeFilePath(key, opts?.tenantId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.metaStore.delete(key);
  }

  async deletePrefix(prefix: string, opts?: { tenantId?: string }): Promise<number> {
    if (opts?.tenantId) {
      StorageKeyBuilder.assertKeyBelongsToTenant(prefix, opts.tenantId);
    }
    const { items } = await this.list(prefix, undefined, opts);
    let deleted = 0;
    for (const item of items) {
      await this.deleteObject(item.key, opts);
      deleted++;
    }
    return deleted;
  }

  async list(
    prefix: string,
    _cursor?: string,
    opts?: { tenantId?: string }
  ): Promise<{ items: ObjectInfo[]; next?: string }> {
    if (opts?.tenantId) {
      StorageKeyBuilder.assertKeyBelongsToTenant(prefix, opts.tenantId);
    }
    const items: ObjectInfo[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const relKey = path.relative(this.rootDir, full).replace(/\\/g, "/");
          if (relKey.startsWith(prefix)) {
            const stat = fs.statSync(full);
            const meta = this.metaStore.get(relKey);
            items.push({
              key: relKey,
              sizeBytes: stat.size,
              contentType: meta?.contentType || "application/octet-stream",
              lastModified: meta?.lastModified || stat.mtime,
              metadata: meta?.metadata,
            });
          }
        }
      }
    };

    walk(this.rootDir);
    return { items };
  }
}
