import { StoragePort, AuditPort, IdGeneratorPort, ScanPort } from "../../ports";
import {
  StorageKeyBuilder,
  sniffMagicByteMime,
  stripJpegExif,
  evaluateR2UsageGuardrail,
} from "../../domain/storage/StorageKeyBuilder";
import { RlsTenantStore } from "../../infrastructure/persistence/postgres/rlsTransaction";

export interface FileMetadataRecord {
  id: string;
  tenant_id: string;
  object_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256?: string;
  module: string;
  entity_type: string;
  entity_id: string;
  is_sensitive: boolean;
  visibility: "private" | "public";
  status: "pending" | "ready" | "deleted" | "quarantined";
  uploaded_by: string;
  createdAt?: Date;
}

const SENSITIVE_MODULES = new Set([
  "nid",
  "birth_certificate",
  "transfer_certificate",
  "medical_record",
]);

/**
 * File Storage Use-Case Service (Cloudflare R2 / StoragePort):
 * - Enforces tenant prefix isolation via StorageKeyBuilder
 * - Tracks source-of-truth metadata in RLS-protected `files` table
 * - Enforces R2 Free-Tier guardrails (per-tenant storage quota + 70%/90% platform alerts)
 * - Sniffs magic bytes, strips JPEG EXIF, runs ScanPort, and audit-logs sensitive downloads
 */
export class FileStorageService {
  constructor(
    private readonly deps: {
      storage: StoragePort;
      rlsStore: RlsTenantStore;
      audit: AuditPort;
      idGen: IdGeneratorPort;
      scanner: ScanPort;
      maxUploadBytes: number;
      allowedMimeTypes: ReadonlySet<string>;
    }
  ) {}

  getTenantUsedBytes(tenantId: string): number {
    return RlsTenantStore.runWithTenantContext({ tenantId }, () => {
      const files = this.deps.rlsStore.findMany<FileMetadataRecord>(
        "files",
        (f) => f.status === "pending" || f.status === "ready"
      );
      return files.reduce((sum, f) => sum + Number(f.size_bytes || 0), 0);
    });
  }

  async requestSignedUpload(input: {
    tenantId: string;
    tenantQuotaMb: number;
    module: string;
    entityType: string;
    entityId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedByUserId: string;
    isSensitive?: boolean;
  }): Promise<{
    fileId: string;
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
    platformAlertLevel: "normal" | "warning_70" | "critical_90";
  }> {
    const normalizedMime = input.mimeType.trim().toLowerCase();
    if (normalizedMime.startsWith("video/")) {
      throw new Error(
        "Video hosting is prohibited on the R2 free tier. Link to YouTube/Google Meet instead."
      );
    }
    if (!this.deps.allowedMimeTypes.has(normalizedMime)) {
      throw new Error(`MIME type '${normalizedMime}' is not permitted`);
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > this.deps.maxUploadBytes) {
      throw new Error(
        `File size ${input.sizeBytes} bytes exceeds maximum allowed (${this.deps.maxUploadBytes} bytes)`
      );
    }

    // Profile photo 300 KB guardrail
    if (
      input.module === "profile_photo" &&
      input.sizeBytes > 300 * 1024
    ) {
      throw new Error("Profile photos must be compressed to at most 300 KB");
    }

    const usedBytes = this.getTenantUsedBytes(input.tenantId);
    const guardrail = evaluateR2UsageGuardrail({
      tenantUsedBytes: usedBytes,
      tenantQuotaMb: input.tenantQuotaMb,
      platformTotalBytes: usedBytes,
      uploadSizeBytes: input.sizeBytes,
    });
    if (!guardrail.allowed) {
      throw new Error(guardrail.reason || "Storage quota exceeded");
    }

    const fileId = this.deps.idGen.newUuid();
    const objectKey = StorageKeyBuilder.buildTenantKey({
      tenantId: input.tenantId,
      module: input.module,
      entityId: input.entityId,
      fileUuid: fileId,
      originalName: input.originalName,
    });

    const isSensitive =
      input.isSensitive ?? SENSITIVE_MODULES.has(input.module.toLowerCase());

    RlsTenantStore.runWithTenantContext(
      { tenantId: input.tenantId, actorUserId: input.uploadedByUserId },
      () => {
        this.deps.rlsStore.insert("files", {
          id: fileId,
          object_key: objectKey,
          original_name: input.originalName,
          mime_type: normalizedMime,
          size_bytes: input.sizeBytes,
          module: input.module,
          entity_type: input.entityType,
          entity_id: input.entityId,
          is_sensitive: isSensitive,
          visibility: "private",
          status: "pending",
          uploaded_by: input.uploadedByUserId,
        });
      }
    );

    const signed = await this.deps.storage.createSignedUploadUrl(objectKey, {
      contentType: normalizedMime,
      maxBytes: input.sizeBytes,
      tenantId: input.tenantId,
    });

    return {
      fileId,
      objectKey,
      uploadUrl: signed.url,
      headers: signed.headers,
      platformAlertLevel: guardrail.platformAlertLevel,
    };
  }

  /**
   * Direct / Server-Side Upload with Magic-Byte Verification, Antivirus Scan, and JPEG EXIF Stripping.
   */
  async uploadAndConfirmBuffer(input: {
    tenantId: string;
    tenantQuotaMb: number;
    module: string;
    entityType: string;
    entityId: string;
    originalName: string;
    declaredMimeType: string;
    buffer: Buffer;
    uploadedByUserId: string;
    isSensitive?: boolean;
  }): Promise<FileMetadataRecord> {
    const req = await this.requestSignedUpload({
      tenantId: input.tenantId,
      tenantQuotaMb: input.tenantQuotaMb,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      originalName: input.originalName,
      mimeType: input.declaredMimeType,
      sizeBytes: input.buffer.length,
      uploadedByUserId: input.uploadedByUserId,
      isSensitive: input.isSensitive,
    });

    // 1. Magic-byte MIME verification
    const sniffedMime = sniffMagicByteMime(input.buffer);
    if (!sniffedMime || sniffedMime !== input.declaredMimeType.toLowerCase()) {
      RlsTenantStore.runWithTenantContext({ tenantId: input.tenantId }, () => {
        this.deps.rlsStore.updateById("files", req.fileId, { status: "quarantined" });
      });
      throw new Error(
        `MIME magic-byte mismatch: declared '${input.declaredMimeType}', detected '${sniffedMime || "unknown"}'`
      );
    }

    // 2. Antivirus scan hook
    const scanResult = await this.deps.scanner.scanBuffer(
      input.buffer,
      input.originalName
    );
    if (!scanResult.clean) {
      RlsTenantStore.runWithTenantContext({ tenantId: input.tenantId }, () => {
        this.deps.rlsStore.updateById("files", req.fileId, { status: "quarantined" });
      });
      throw new Error(`File quarantined due to security threat: ${scanResult.threat}`);
    }

    // 3. Strip EXIF metadata on JPEG photos
    const processedBuffer =
      sniffedMime === "image/jpeg" ? stripJpegExif(input.buffer) : input.buffer;

    const stored = await this.deps.storage.putObject(req.objectKey, processedBuffer, {
      contentType: sniffedMime,
      sizeBytes: processedBuffer.length,
      tenantId: input.tenantId,
    });

    const head = await this.deps.storage.headObject(req.objectKey, {
      tenantId: input.tenantId,
    });
    if (!head) {
      throw new Error("Upload confirmation failed: object not found in storage");
    }

    return RlsTenantStore.runWithTenantContext({ tenantId: input.tenantId }, () => {
      const updated = this.deps.rlsStore.updateById<FileMetadataRecord>(
        "files",
        req.fileId,
        {
          size_bytes: head.sizeBytes,
          checksum_sha256: stored.checksumSha256,
          status: "ready",
        }
      );
      return updated!;
    });
  }

  /**
   * Generates a short-lived signed download URL after verifying tenant RLS,
   * ownership/permission, and audit-logging access to sensitive documents.
   */
  async getAuthorizedDownloadUrl(input: {
    tenantId: string;
    fileId: string;
    actorUserId: string;
    actorRole: string;
    allowedEntityIds?: string[]; // e.g. for student/parent, only their own studentId(s)
  }): Promise<{ downloadUrl: string; file: FileMetadataRecord }> {
    const file = RlsTenantStore.runWithTenantContext(
      { tenantId: input.tenantId, actorUserId: input.actorUserId },
      () => this.deps.rlsStore.findById<FileMetadataRecord>("files", input.fileId)
    );

    if (!file || file.status !== "ready") {
      throw new Error("File not found or not ready for download");
    }

    // Ownership check for students/parents
    if (
      (input.actorRole === "student" || input.actorRole === "parent") &&
      input.allowedEntityIds &&
      !input.allowedEntityIds.includes(file.entity_id)
    ) {
      throw new Error("Access denied: you do not have permission to view this document");
    }

    // Audit-log access to sensitive documents (NID, birth certificate, etc.)
    if (file.is_sensitive) {
      await this.deps.audit.record({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "file.sensitive_download",
        entityType: file.entity_type,
        entityId: file.id,
        metadata: {
          objectKey: file.object_key,
          module: file.module,
          originalName: file.original_name,
        },
      });
    }

    const isImage = file.mime_type.startsWith("image/");
    const downloadUrl = await this.deps.storage.getSignedDownloadUrl(
      file.object_key,
      {
        downloadName: file.original_name,
        forceDownload: !isImage,
        tenantId: input.tenantId,
      }
    );

    return { downloadUrl, file };
  }

  /**
   * Streams/reads file bytes from StoragePort after verifying tenant RLS and readiness.
   */
  async getAuthorizedFileBuffer(input: {
    tenantId: string;
    fileId: string;
    actorUserId: string;
  }): Promise<{ buffer: Buffer; file: FileMetadataRecord }> {
    const file = RlsTenantStore.runWithTenantContext(
      { tenantId: input.tenantId, actorUserId: input.actorUserId },
      () => this.deps.rlsStore.findById<FileMetadataRecord>("files", input.fileId)
    );

    if (!file || file.status !== "ready") {
      throw new Error("File not found or not ready for viewing");
    }

    const buffer = await this.deps.storage.getObjectBuffer(file.object_key, {
      tenantId: input.tenantId,
    });
    return { buffer, file };
  }
}
