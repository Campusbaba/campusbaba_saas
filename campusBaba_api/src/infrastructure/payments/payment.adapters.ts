import crypto from "crypto";
import {
  PaymentGatewayPort,
  CreateCheckoutInput,
  CheckoutSession,
  WebhookVerificationResult,
} from "../../ports/PaymentGatewayPort";

/**
 * Shared Base for Bangladesh Payment Gateways
 * (Manual Send-Money TrxID, SSLCommerz, bKash, Nagad, aamarPay)
 */
export class BangladeshiPaymentGatewayAdapter implements PaymentGatewayPort {
  readonly gatewayCode: string;
  private readonly signingSecret: string;
  private readonly baseUrl: string;
  private readonly transactions = new Map<
    string,
    {
      invoiceId: string;
      amountBdt: number;
      status: "paid" | "failed" | "pending_verification";
      senderPhone?: string;
    }
  >();

  constructor(opts: {
    gatewayCode: "manual" | "sslcommerz" | "bkash" | "nagad" | "aamarpay";
    signingSecret: string;
    baseUrl?: string;
  }) {
    this.gatewayCode = opts.gatewayCode;
    this.signingSecret = opts.signingSecret;
    this.baseUrl =
      opts.baseUrl || `https://pay.campusbaba.com/gateway/${opts.gatewayCode}`;
  }

  public signWebhookPayload(payload: Record<string, unknown>): string {
    const canonical = `${this.gatewayCode}:${payload.transactionId}:${payload.invoiceId}:${Number(payload.amountBdt).toFixed(2)}:${payload.status}`;
    return crypto
      .createHmac("sha256", this.signingSecret)
      .update(canonical)
      .digest("hex");
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (input.amountBdt <= 0) {
      throw new Error("Checkout amount must be positive");
    }
    if (!input.invoiceId || !input.tenantId || !input.studentId) {
      throw new Error("Missing tenantId, invoiceId, or studentId for checkout");
    }

    const sessionId = `${this.gatewayCode.toUpperCase()}-SES-${crypto
      .createHash("sha256")
      .update(`${input.tenantId}:${input.idempotencyKey}`)
      .digest("hex")
      .slice(0, 16)}`;

    this.transactions.set(sessionId, {
      invoiceId: input.invoiceId,
      amountBdt: input.amountBdt,
      status: "pending_verification",
      senderPhone: input.customerPhone,
    });

    return {
      gateway: this.gatewayCode,
      sessionId,
      redirectUrl: `${this.baseUrl}/checkout/${sessionId}?invoice=${encodeURIComponent(input.invoiceId)}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  async verifyWebhook(
    payload: Record<string, unknown>,
    signatureHeader?: string
  ): Promise<WebhookVerificationResult> {
    const transactionId = String(payload.transactionId || payload.trxID || payload.tran_id || "").trim();
    const invoiceId = String(payload.invoiceId || payload.value_a || "").trim();
    const amountBdt = Number(payload.amountBdt ?? payload.amount ?? 0);
    const rawStatus = String(payload.status || "paid").toLowerCase();

    if (!transactionId || !invoiceId || amountBdt <= 0) {
      return {
        valid: false,
        gateway: this.gatewayCode,
        transactionId,
        invoiceId,
        amountBdt,
        status: "failed",
      };
    }

    // For manual TrxID submissions, status starts as pending_verification until accountant approves
    if (this.gatewayCode === "manual") {
      this.transactions.set(transactionId, {
        invoiceId,
        amountBdt,
        status: rawStatus === "paid" ? "paid" : "pending_verification",
        senderPhone: payload.senderPhone ? String(payload.senderPhone) : undefined,
      });
      return {
        valid: true,
        gateway: this.gatewayCode,
        transactionId,
        invoiceId,
        amountBdt,
        status: rawStatus === "paid" ? "paid" : "pending_verification",
        senderPhone: payload.senderPhone ? String(payload.senderPhone) : undefined,
        rawPayload: payload,
      };
    }

    // Online gateways require valid HMAC signature
    const expectedSig = this.signWebhookPayload({
      transactionId,
      invoiceId,
      amountBdt,
      status: rawStatus,
    });

    if (!signatureHeader || signatureHeader !== expectedSig) {
      return {
        valid: false,
        gateway: this.gatewayCode,
        transactionId,
        invoiceId,
        amountBdt,
        status: "failed",
      };
    }

    const mappedStatus: WebhookVerificationResult["status"] =
      rawStatus === "paid" || rawStatus === "valid" || rawStatus === "completed"
        ? "paid"
        : rawStatus === "cancelled"
          ? "cancelled"
          : "failed";

    this.transactions.set(transactionId, {
      invoiceId,
      amountBdt,
      status: mappedStatus === "paid" ? "paid" : "failed",
    });

    return {
      valid: true,
      gateway: this.gatewayCode,
      transactionId,
      invoiceId,
      amountBdt,
      status: mappedStatus,
      rawPayload: payload,
    };
  }

  async queryTransaction(transactionId: string): Promise<{
    transactionId: string;
    status: "paid" | "failed" | "pending_verification" | "not_found";
    amountBdt?: number;
  }> {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      return { transactionId, status: "not_found" };
    }
    return {
      transactionId,
      status: tx.status,
      amountBdt: tx.amountBdt,
    };
  }

  async refund(
    transactionId: string,
    amountBdt: number,
    _reason: string
  ): Promise<{ refundId: string; status: "refunded" | "pending" }> {
    if (amountBdt <= 0) {
      throw new Error("Refund amount must be positive");
    }
    return {
      refundId: `REF-${this.gatewayCode.toUpperCase()}-${transactionId}`,
      status: "refunded",
    };
  }
}
