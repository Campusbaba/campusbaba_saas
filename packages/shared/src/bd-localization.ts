/**
 * Bangladesh Localization Utilities:
 * - Bangla Numeral Conversion (০-৯)
 * - BDT Lakh/Crore Grouping (৳১,২৩,৪৫৬.০০ / ৳1,23,456.00)
 * - Amount in Words (English & Bangla Taka/Paisa)
 * - Bangla Calendar (বঙ্গাব্দ) Date Formatter
 * - Bangladesh Administrative Hierarchy (Division -> District -> Upazila)
 */

const EN_TO_BN_DIGITS: Record<string, string> = {
  "0": "০",
  "1": "১",
  "2": "২",
  "3": "৩",
  "4": "৪",
  "5": "৫",
  "6": "৬",
  "7": "৭",
  "8": "৮",
  "9": "৯",
};

const BN_TO_EN_DIGITS: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

export function toBanglaNumerals(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => EN_TO_BN_DIGITS[d] ?? d);
}

export function toEnglishNumerals(input: string): string {
  return String(input).replace(/[০-৯]/g, (d) => BN_TO_EN_DIGITS[d] ?? d);
}

/**
 * Formats a number using South Asian Lakh/Crore grouping (e.g. 12,34,567.89)
 */
export function formatBdtLakhCrore(
  amount: number,
  options: { locale?: "en" | "bn"; showSymbol?: boolean; decimals?: number } = {}
): string {
  const { locale = "en", showSymbol = true, decimals = 2 } = options;
  const isNegative = amount < 0;
  const absVal = Math.abs(Number(amount) || 0);
  const fixed = absVal.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");

  let formattedInt = intPart;
  if (intPart.length > 3) {
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    formattedInt = `${groupedRest},${lastThree}`;
  }

  const combined = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  const localizedDigits = locale === "bn" ? toBanglaNumerals(combined) : combined;
  const prefix = showSymbol ? "৳" : "";
  return `${isNegative ? "-" : ""}${prefix}${localizedDigits}`;
}

const EN_ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const EN_TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function twoDigitsToWordsEn(n: number): string {
  if (n === 0) return "";
  if (n < 20) return EN_ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return `${EN_TENS[ten]}${one > 0 ? " " + EN_ONES[one] : ""}`;
}

function intToBdtWordsEn(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];

  const crore = Math.floor(n / 10000000);
  let rem = n % 10000000;
  if (crore > 0) {
    parts.push(`${intToBdtWordsEn(crore)} Crore`);
  }

  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  if (lakh > 0) {
    parts.push(`${twoDigitsToWordsEn(lakh)} Lakh`);
  }

  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  if (thousand > 0) {
    parts.push(`${twoDigitsToWordsEn(thousand)} Thousand`);
  }

  const hundred = Math.floor(rem / 100);
  rem = rem % 100;
  if (hundred > 0) {
    parts.push(`${EN_ONES[hundred]} Hundred`);
  }

  if (rem > 0) {
    parts.push(twoDigitsToWordsEn(rem));
  }

  return parts.join(" ").trim();
}

export function amountInWordsBdt(amount: number, locale: "en" | "bn" = "en"): string {
  const safe = Math.max(0, Math.round(amount * 100) / 100);
  const taka = Math.floor(safe);
  const paisa = Math.round((safe - taka) * 100);

  if (locale === "bn") {
    const takaBn = toBanglaNumerals(taka);
    const paisaBn = paisa > 0 ? ` এবং ${toBanglaNumerals(paisa)} পয়সা` : "";
    return `${takaBn} টাকা${paisaBn} মাত্র`;
  }

  const takaWords = `${intToBdtWordsEn(taka)} Taka`;
  const paisaWords = paisa > 0 ? ` and ${twoDigitsToWordsEn(paisa)} Paisa` : "";
  return `${takaWords}${paisaWords} Only`;
}

/**
 * Formats a Gregorian Date into Revised Bangla Calendar (বঙ্গাব্দ) representation
 */
const BANGLA_MONTHS = [
  "বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন",
  "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র",
];

export function formatBanglaDate(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const gYear = d.getUTCFullYear();
  const gMonth = d.getUTCMonth() + 1; // 1..12
  const gDay = d.getUTCDate();

  // Pohela Boishakh is April 14 in Bangladesh revised calendar
  const isBeforeBoishakh = gMonth < 4 || (gMonth === 4 && gDay < 14);
  const bYear = isBeforeBoishakh ? gYear - 594 : gYear - 593;

  // Approximate month index relative to April 14
  const monthOffsets = [0, 31, 62, 93, 124, 155, 185, 215, 245, 275, 305, 335];
  const startOfBoishakh = Date.UTC(isBeforeBoishakh ? gYear - 1 : gYear, 3, 14);
  const currentUtc = Date.UTC(gYear, gMonth - 1, gDay);
  const diffDays = Math.max(0, Math.floor((currentUtc - startOfBoishakh) / 86400000));

  let bMonthIdx = 0;
  for (let i = monthOffsets.length - 1; i >= 0; i--) {
    if (diffDays >= monthOffsets[i]) {
      bMonthIdx = i;
      break;
    }
  }
  const bDay = diffDays - monthOffsets[bMonthIdx] + 1;
  return `${toBanglaNumerals(bDay)} ${BANGLA_MONTHS[bMonthIdx]}, ${toBanglaNumerals(bYear)} বঙ্গাব্দ`;
}

export interface BdDivisionSeed {
  code: string;
  name: string;
  nameBn: string;
  districts: {
    code: string;
    name: string;
    nameBn: string;
    upazilas: { name: string; nameBn: string }[];
  }[];
}

export const BD_GEO_HIERARCHY: BdDivisionSeed[] = [
  {
    code: "DHK",
    name: "Dhaka",
    nameBn: "ঢাকা",
    districts: [
      {
        code: "DHK-01",
        name: "Dhaka",
        nameBn: "ঢাকা",
        upazilas: [
          { name: "Dhanmondi", nameBn: "ধানমন্ডি" },
          { name: "Mirpur", nameBn: "মিরপুর" },
          { name: "Uttara", nameBn: "উত্তরা" },
          { name: "Savar", nameBn: "সাভার" },
        ],
      },
      {
        code: "DHK-02",
        name: "Gazipur",
        nameBn: "গাজীপুর",
        upazilas: [
          { name: "Gazipur Sadar", nameBn: "গাজীপুর সদর" },
          { name: "Tongi", nameBn: "টঙ্গী" },
        ],
      },
    ],
  },
  {
    code: "CTG",
    name: "Chattogram",
    nameBn: "চট্টগ্রাম",
    districts: [
      {
        code: "CTG-01",
        name: "Chattogram",
        nameBn: "চট্টগ্রাম",
        upazilas: [
          { name: "Kotwali", nameBn: "কোতোয়ালী" },
          { name: "Panchlaish", nameBn: "পাঁচলাইশ" },
          { name: "Hathazari", nameBn: "হাটহাজারী" },
        ],
      },
    ],
  },
  {
    code: "RAJ",
    name: "Rajshahi",
    nameBn: "রাজশাহী",
    districts: [
      {
        code: "RAJ-01",
        name: "Rajshahi",
        nameBn: "রাজশাহী",
        upazilas: [
          { name: "Boalia", nameBn: "বোয়ালিয়া" },
          { name: "Rajpara", nameBn: "রাজপাড়া" },
        ],
      },
    ],
  },
  {
    code: "SYL",
    name: "Sylhet",
    nameBn: "সিলেট",
    districts: [
      {
        code: "SYL-01",
        name: "Sylhet",
        nameBn: "সিলেট",
        upazilas: [
          { name: "Sylhet Sadar", nameBn: "সিলেট সদর" },
          { name: "Beanibazar", nameBn: "বিয়ানীবাজার" },
        ],
      },
    ],
  },
];
