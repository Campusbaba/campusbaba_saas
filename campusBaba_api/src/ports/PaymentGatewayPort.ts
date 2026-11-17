export interface CreateCheckoutInput {
  tenantId: string;
  invoiceId: string;
  studentId: string;
  amountBdt: number;
  currency?: "BDT";
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  callbackUrl: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  gateway: string;
  sessionId: string;
  redirectUrl: string;
  expiresAt: Date;
}

export interface WebhookVerificationResult {
  valid: boolean;
  gateway: string;
  transactionId: string;
  invoiceId: string;
  amountBdt: number;
  status: "paid" | "failed" | "cancelled" | "pending_verification";
  senderPhone?: string;
  rawPayload?: Record<string, unknown>;
}

export interface PaymentGatewayPort {
  readonly gatewayCode: string;

  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  verifyWebhook(
    payload: Record<string, unknown>,
    signatureHeader?: string
  ): Promise<WebhookVerificationResult>;

  queryTransaction(transactionId: string): Promise<{
    transactionId: string;
    status: "paid" | "failed" | "pending_verification" | "not_found";
    amountBdt?: number;
  }>;

  refund(
    transactionId: string,
    amountBdt: number,
    reason: string
  ): Promise<{ refundId: string; status: "refunded" | "pending" }>;
}
