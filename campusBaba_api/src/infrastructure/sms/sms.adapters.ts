import crypto from "crypto";
import { SmsPort, SmsSendResult, SmsDeliveryReport } from "../../ports/SmsPort";
import {
  calculateSmsSegments,
  validateBtrcSenderId,
  isWithinBtrcPromotionalWindow,
} from "../../domain/sms/BtrcSmsPolicy";

export class BaseBtrcSmsAdapter implements SmsPort {
  readonly driverName: string;
  private readonly defaultSenderId: string;
  private creditsBalance: number;

  constructor(opts: {
    driverName: "console" | "bulksmsbd" | "alpha" | "ssl_wireless";
    defaultSenderId?: string;
    initialCredits?: number;
  }) {
    this.driverName = opts.driverName;
    this.defaultSenderId = opts.defaultSenderId || "CAMPUSBABA";
    this.creditsBalance = opts.initialCredits ?? 10000;
  }

  async send(
    to: string,
    text: string,
    opts?: {
      unicode?: boolean;
      senderId?: string;
      isPromotional?: boolean;
      tenantId?: string;
    }
  ): Promise<SmsSendResult> {
    if (!to || !/^\+?8801[3-9]\d{8}$/.test(to.replace(/[\s-]/g, ""))) {
      throw new Error(`Invalid Bangladesh mobile number: ${to}`);
    }
    if (!text || text.trim().length === 0) {
      throw new Error("SMS text cannot be empty");
    }

    const senderId = opts?.senderId || this.defaultSenderId;
    const isNumericSender = /^\+?\d+$/.test(senderId);
    const senderCheck = validateBtrcSenderId(
      senderId,
      isNumericSender ? "non_masking" : "masking"
    );
    if (!senderCheck.valid) {
      throw new Error(senderCheck.reason || "Invalid BTRC Sender ID");
    }

    if (opts?.isPromotional && !isWithinBtrcPromotionalWindow()) {
      throw new Error(
        "BTRC compliance: Promotional SMS can only be sent between 09:00 AM and 09:00 PM Asia/Dhaka time"
      );
    }

    const seg = calculateSmsSegments(text);
    this.creditsBalance = Math.max(0, this.creditsBalance - seg.segmentCount);

    const gatewayMessageId = `${this.driverName.toUpperCase()}-${crypto.randomUUID().slice(0, 12)}`;

    return {
      success: true,
      gatewayMessageId,
      gateway: this.driverName,
      encoding: seg.encoding,
      characterCount: seg.characterCount,
      segmentCount: seg.segmentCount,
      status: "sent",
    };
  }

  async getBalance(): Promise<{ credits: number; currency: string }> {
    return {
      credits: this.creditsBalance,
      currency: "BDT_CREDITS",
    };
  }

  parseDeliveryReport(payload: Record<string, unknown>): SmsDeliveryReport {
    const id = String(payload.messageId || payload.sms_id || payload.id || "");
    const rawStatus = String(payload.status || "delivered").toLowerCase();
    const status: SmsDeliveryReport["status"] =
      rawStatus.includes("deliv") || rawStatus === "success" || rawStatus === "200"
        ? "delivered"
        : rawStatus.includes("fail") || rawStatus.includes("err")
          ? "failed"
          : "queued";

    return {
      gatewayMessageId: id,
      status,
      deliveredAt: status === "delivered" ? new Date() : undefined,
      errorCode: status === "failed" ? String(payload.errorCode || "DELIVERY_FAILED") : undefined,
    };
  }
}

export class ConsoleSmsAdapter extends BaseBtrcSmsAdapter {
  constructor(defaultSenderId = "CAMPUSBABA") {
    super({ driverName: "console", defaultSenderId });
  }
}

export class BulkSmsBdAdapter extends BaseBtrcSmsAdapter {
  constructor(defaultSenderId = "CAMPUSBABA") {
    super({ driverName: "bulksmsbd", defaultSenderId });
  }
}

export class AlphaSmsAdapter extends BaseBtrcSmsAdapter {
  constructor(defaultSenderId = "CAMPUSBABA") {
    super({ driverName: "alpha", defaultSenderId });
  }
}

export class SslWirelessSmsAdapter extends BaseBtrcSmsAdapter {
  constructor(defaultSenderId = "CAMPUSBABA") {
    super({ driverName: "ssl_wireless", defaultSenderId });
  }
}
