/**
 * Pure Domain: BTRC SMS Segment Math & Compliance Policy
 */

const GSM7_REGEX =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\f^{}\\[~\]|€]*$/;

const EXTENDED_GSM7_CHARS = new Set(["\f", "^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

export interface SmsSegmentCalculation {
  encoding: "GSM_7" | "UCS_2";
  characterCount: number;
  segmentCount: number;
  remainingInCurrentSegment: number;
  maxPerSingleSegment: number;
  maxPerMultiSegment: number;
}

export function calculateSmsSegments(text: string): SmsSegmentCalculation {
  if (!text || text.length === 0) {
    return {
      encoding: "GSM_7",
      characterCount: 0,
      segmentCount: 0,
      remainingInCurrentSegment: 160,
      maxPerSingleSegment: 160,
      maxPerMultiSegment: 153,
    };
  }

  const isGsm7 = GSM7_REGEX.test(text);

  if (isGsm7) {
    let septetLength = 0;
    for (const ch of text) {
      septetLength += EXTENDED_GSM7_CHARS.has(ch) ? 2 : 1;
    }
    const segmentCount =
      septetLength <= 160 ? 1 : Math.ceil(septetLength / 153);
    const capacity = segmentCount === 1 ? 160 : segmentCount * 153;
    return {
      encoding: "GSM_7",
      characterCount: septetLength,
      segmentCount,
      remainingInCurrentSegment: capacity - septetLength,
      maxPerSingleSegment: 160,
      maxPerMultiSegment: 153,
    };
  }

  const charCount = text.length;
  const segmentCount = charCount <= 70 ? 1 : Math.ceil(charCount / 67);
  const capacity = segmentCount === 1 ? 70 : segmentCount * 67;

  return {
    encoding: "UCS_2",
    characterCount: charCount,
    segmentCount,
    remainingInCurrentSegment: capacity - charCount,
    maxPerSingleSegment: 70,
    maxPerMultiSegment: 67,
  };
}

const BTRC_BLOCKED_MASKING_IDS = new Set([
  "INFO",
  "OFFER",
  "ALERT",
  "GOVT",
  "BDGOVT",
  "ADMIN",
  "SMS",
  "TEST",
]);

export function validateBtrcSenderId(
  senderId: string,
  type: "masking" | "non_masking" = "masking"
): { valid: boolean; reason?: string } {
  const trimmed = senderId.trim();
  if (type === "non_masking") {
    if (!/^\+?8801[3-9]\d{8}$/.test(trimmed) && !/^\d{10,16}$/.test(trimmed)) {
      return {
        valid: false,
        reason: "Non-masking sender ID must be a valid numeric MSISDN / long code",
      };
    }
    return { valid: true };
  }

  if (trimmed.length < 3 || trimmed.length > 11) {
    return {
      valid: false,
      reason: "BTRC masking Sender ID must be between 3 and 11 characters",
    };
  }
  if (!/^[A-Za-z0-9 ]+$/.test(trimmed)) {
    return {
      valid: false,
      reason: "BTRC masking Sender ID can only contain alphanumeric characters and spaces",
    };
  }
  if (BTRC_BLOCKED_MASKING_IDS.has(trimmed.toUpperCase())) {
    return {
      valid: false,
      reason: `Generic Sender ID '${trimmed}' is prohibited by BTRC`,
    };
  }
  return { valid: true };
}

export function isWithinBtrcPromotionalWindow(utcDate: Date = new Date()): boolean {
  const dhakaHour = (utcDate.getUTCHours() + 6) % 24;
  return dhakaHour >= 9 && dhakaHour < 21;
}
