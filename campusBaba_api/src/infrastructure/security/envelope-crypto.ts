import crypto from "crypto";

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * AES-256-GCM Envelope Encryption for Per-Tenant Provider Credentials
 * - Derives a 32-byte key from APP_ENCRYPTION_KEY
 * - Never logs plaintext secrets
 */
export class EnvelopeCrypto {
  private readonly keyBuffer: Buffer;

  constructor(rawKey: string) {
    if (!rawKey || rawKey.length < 16) {
      throw new Error("APP_ENCRYPTION_KEY must be at least 16 characters");
    }
    this.keyBuffer = crypto.createHash("sha256").update(rawKey).digest();
  }

  encryptJson(payload: Record<string, unknown>): EncryptedEnvelope {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.keyBuffer, iv);
    const plaintext = JSON.stringify(payload);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  decryptJson<T = Record<string, unknown>>(envelope: EncryptedEnvelope): T {
    const iv = Buffer.from(envelope.iv, "base64");
    const authTag = Buffer.from(envelope.authTag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8")) as T;
  }
}
