export interface SmsSendResult {
  success: boolean;
  gatewayMessageId: string;
  gateway: string;
  encoding: "GSM_7" | "UCS_2";
  characterCount: number;
  segmentCount: number;
  status: "sent" | "queued" | "failed";
}

export interface SmsDeliveryReport {
  gatewayMessageId: string;
  status: "delivered" | "failed" | "queued";
  deliveredAt?: Date;
  errorCode?: string;
}

export interface SmsPort {
  readonly driverName: string;

  send(
    to: string,
    text: string,
    opts?: {
      unicode?: boolean;
      senderId?: string;
      isPromotional?: boolean;
      tenantId?: string;
    }
  ): Promise<SmsSendResult>;

  getBalance(): Promise<{ credits: number; currency: string }>;

  parseDeliveryReport(payload: Record<string, unknown>): SmsDeliveryReport;
}
