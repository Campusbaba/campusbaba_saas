/**
 * Pure Domain: Tenant-Scoped Storage Key Builder & File Safety Policies
 * - Enforces format: tenants/{tenant_id}/{module}/{entity_id}/{uuid}-{sanitized-name}
 * - Blocks path traversal (.., \, null bytes, leading slashes)
 * - Verifies tenant prefix isolation
 * - Magic-byte MIME sniffer & EXIF APP1 stripper
 * - Cloudflare R2 Free Tier (10 GB / 1M Class A / 10M Class B) guardrail checks
 */

export const R2_FREE_TIER_LIMITS = {
  STORAGE_BYTES: 10 * 1024 * 1024 * 1024, // 10 GB-month
  CLASS_A_OPS_PER_MONTH: 1_000_000,
  CLASS_B_OPS_PER_MONTH: 10_000_000,
  WARN_THRESHOLD_PCT: 70,
  CRITICAL_THRESHOLD_PCT: 90,
} as const;

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".xlsx",
  ".csv",
]);

export class StorageKeyBuilder {
  static sanitizeSegment(segment: string, fieldName: string): string {
    if (!segment || typeof segment !== "string") {
      throw new Error(`${fieldName} is required`);
    }
    if (
      segment.includes("..") ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      throw new Error(`Invalid path traversal characters in ${fieldName}`);
    }
    const cleaned = segment.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleaned) {
      throw new Error(`${fieldName} contains no valid alphanumeric characters`);
    }
    return cleaned;
  }

  static sanitizeFilename(originalName: string): string {
    if (!originalName || typeof originalName !== "string") {
      throw new Error("Filename is required");
    }
    if (
      originalName.includes("..") ||
      originalName.includes("/") ||
      originalName.includes("\\") ||
      originalName.includes("\0")
    ) {
      throw new Error("Invalid path traversal in filename");
    }

    const trimmed = originalName.trim().toLowerCase();
    const dotIndex = trimmed.lastIndexOf(".");
    const ext = dotIndex > 0 ? trimmed.slice(dotIndex) : "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `File extension '${ext || "none"}' is not allowed. Permitted: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`
      );
    }

    const base = trimmed
      .slice(0, dotIndex)
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    return `${base || "file"}${ext}`;
  }

  static buildTenantKey(params: {
    tenantId: string;
    module: string;
    entityId: string;
    fileUuid: string;
    originalName: string;
  }): string {
    const tId = this.sanitizeSegment(params.tenantId, "tenantId");
    const mod = this.sanitizeSegment(params.module, "module");
    const eId = this.sanitizeSegment(params.entityId, "entityId");
    const uId = this.sanitizeSegment(params.fileUuid, "fileUuid");
    const safeName = this.sanitizeFilename(params.originalName);

    return `tenants/${tId}/${mod}/${eId}/${uId}-${safeName}`;
  }

  static tenantPrefix(tenantId: string): string {
    const tId = this.sanitizeSegment(tenantId, "tenantId");
    return `tenants/${tId}/`;
  }

  static assertKeyBelongsToTenant(key: string, tenantId: string): void {
    if (!key || typeof key !== "string") {
      throw new Error("Storage key is required");
    }
    if (key.includes("..") || key.includes("\\") || key.includes("\0") || key.startsWith("/")) {
      throw new Error("Path traversal detected in storage key");
    }
    const expectedPrefix = this.tenantPrefix(tenantId);
    if (!key.startsWith(expectedPrefix)) {
      throw new Error(
        `Cross-tenant storage access denied: key '${key}' does not belong to tenant '${tenantId}'`
      );
    }
  }
}

/**
 * Sniffs actual MIME type from buffer magic bytes.
 */
export function sniffMagicByteMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  // ZIP / XLSX: PK\x03\x04 (50 4B 03 04)
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  // Check if plain printable UTF-8/ASCII CSV
  const sample = buffer.subarray(0, Math.min(buffer.length, 256));
  let isPrintable = true;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
      isPrintable = false;
      break;
    }
  }
  if (isPrintable) {
    return "text/csv";
  }

  return null;
}

/**
 * Strips JPEG APP1 (EXIF / GPS) segments from JPEG image buffers for student/staff privacy.
 */
export function stripJpegExif(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }

  const chunks: Buffer[] = [buffer.subarray(0, 2)]; // SOI marker FF D8
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    const marker = buffer[offset + 1];
    // SOS (Start of Scan) or EOI -> copy rest of stream
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    // Skip APP1 (0xE1 - EXIF/XMP) and APP13 (0xED - IPTC)
    if (marker !== 0xe1 && marker !== 0xed) {
      chunks.push(buffer.subarray(offset, offset + 2 + segmentLength));
    }
    offset += 2 + segmentLength;
  }

  return Buffer.concat(chunks);
}

export function evaluateR2UsageGuardrail(params: {
  tenantUsedBytes: number;
  tenantQuotaMb: number;
  platformTotalBytes: number;
  uploadSizeBytes: number;
}): {
  allowed: boolean;
  reason?: string;
  platformAlertLevel: "normal" | "warning_70" | "critical_90";
} {
  const tenantQuotaBytes = params.tenantQuotaMb * 1024 * 1024;
  if (params.tenantUsedBytes + params.uploadSizeBytes > tenantQuotaBytes) {
    return {
      allowed: false,
      reason: `Tenant storage quota exceeded (${params.tenantQuotaMb} MB limit)`,
      platformAlertLevel: "normal",
    };
  }

  const newPlatformTotal = params.platformTotalBytes + params.uploadSizeBytes;
  const pct = (newPlatformTotal / R2_FREE_TIER_LIMITS.STORAGE_BYTES) * 100;

  const platformAlertLevel =
    pct >= R2_FREE_TIER_LIMITS.CRITICAL_THRESHOLD_PCT
      ? "critical_90"
      : pct >= R2_FREE_TIER_LIMITS.WARN_THRESHOLD_PCT
        ? "warning_70"
        : "normal";

  return {
    allowed: true,
    platformAlertLevel,
  };
}
