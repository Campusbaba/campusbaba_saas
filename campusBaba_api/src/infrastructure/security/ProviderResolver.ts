import { SmsPort } from "../../ports/SmsPort";
import { PaymentGatewayPort } from "../../ports/PaymentGatewayPort";
import { EnvelopeCrypto, EncryptedEnvelope } from "./envelope-crypto";
import {
  BulkSmsBdAdapter,
  AlphaSmsAdapter,
  SslWirelessSmsAdapter,
  ConsoleSmsAdapter,
} from "../sms/sms.adapters";
import { BangladeshiPaymentGatewayAdapter } from "../payments/payment.adapters";

/**
 * Resolves the appropriate SMS or Payment Gateway Adapter for a specific tenant.
 * - If the tenant has configured and enabled encrypted credentials in `provider_credentials`,
 *   decrypts them on-demand using `EnvelopeCrypto` and returns a tenant-scoped adapter.
 * - Otherwise returns the platform default adapter.
 */
export class ProviderResolver {
  private readonly crypto: EnvelopeCrypto;
  private readonly defaultSms: SmsPort;
  private readonly defaultPaymentGateways: Map<string, PaymentGatewayPort>;
  private readonly tenantCredentialStore = new Map<
    string,
    { providerCode: string; envelope: EncryptedEnvelope }
  >();

  constructor(opts: {
    encryptionKey: string;
    defaultSms: SmsPort;
    defaultPaymentGateways: PaymentGatewayPort[];
  }) {
    this.crypto = new EnvelopeCrypto(opts.encryptionKey);
    this.defaultSms = opts.defaultSms;
    this.defaultPaymentGateways = new Map(
      opts.defaultPaymentGateways.map((g) => [g.gatewayCode, g])
    );
  }

  setTenantCredential(params: {
    tenantId: string;
    capability: "sms" | "payment";
    providerCode: string;
    secrets: Record<string, unknown>;
  }): EncryptedEnvelope {
    const envelope = this.crypto.encryptJson(params.secrets);
    const key = `${params.tenantId}:${params.capability}:${params.providerCode}`;
    this.tenantCredentialStore.set(key, {
      providerCode: params.providerCode,
      envelope,
    });
    return envelope;
  }

  resolveSms(tenantId?: string, preferredDriver?: string): SmsPort {
    if (tenantId && preferredDriver) {
      const entry = this.tenantCredentialStore.get(
        `${tenantId}:sms:${preferredDriver}`
      );
      if (entry) {
        const decrypted = this.crypto.decryptJson<{ senderId?: string }>(
          entry.envelope
        );
        const sender = decrypted.senderId || "CAMPUSBABA";
        if (preferredDriver === "bulksmsbd") return new BulkSmsBdAdapter(sender);
        if (preferredDriver === "alpha") return new AlphaSmsAdapter(sender);
        if (preferredDriver === "ssl_wireless") return new SslWirelessSmsAdapter(sender);
        return new ConsoleSmsAdapter(sender);
      }
    }
    return this.defaultSms;
  }

  resolvePaymentGateway(
    gatewayCode: "manual" | "sslcommerz" | "bkash" | "nagad" | "aamarpay",
    tenantId?: string
  ): PaymentGatewayPort {
    if (tenantId) {
      const entry = this.tenantCredentialStore.get(
        `${tenantId}:payment:${gatewayCode}`
      );
      if (entry) {
        const decrypted = this.crypto.decryptJson<{ signingSecret?: string }>(
          entry.envelope
        );
        return new BangladeshiPaymentGatewayAdapter({
          gatewayCode,
          signingSecret: decrypted.signingSecret || "tenant-secret",
        });
      }
    }

    const fallback = this.defaultPaymentGateways.get(gatewayCode);
    if (!fallback) {
      throw new Error(`Payment gateway '${gatewayCode}' is not enabled`);
    }
    return fallback;
  }
}
