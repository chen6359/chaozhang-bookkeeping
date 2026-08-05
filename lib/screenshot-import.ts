import {
  inferLedgerClassification,
  type ExpenseCategory,
  type LedgerDirection,
} from "./ledger.ts";
import {
  resolveCurrencyAroundAmount,
  type CurrencyCode,
} from "./currency.ts";
import type { LocalDateKey } from "./habit.ts";

export type ScreenshotPlatform = "微信支付" | "支付宝" | "其他账单";

export type ScreenshotIssueCode =
  | "note-needs-review"
  | "date-needs-review"
  | "transfer-needs-review"
  | "currency-needs-review";

export type ScreenshotCandidate = {
  direction: LedgerDirection;
  amount: number;
  currency: CurrencyCode;
  category: ExpenseCategory | "收入";
  note: string;
  date: LocalDateKey;
  rawLine: string;
  rowKey: string;
  issueCodes: ScreenshotIssueCode[];
};

const paymentMetadataRule =
  /交易单号|商户单号|订单号|账单分类|支付方式|付款方式|当前状态|交易状态|对方账号|收款方|服务费|优惠|余额|剩余|共\d+笔|合计|小计|本月支出|本月收入|账单已生成/;
const amountLabelRule = /支付金额|付款金额|交易金额|实付|收款金额|退款金额|金额/;
const platformOnlyRule = /^(微信支付|微信账单|支付宝|支付宝账单|账单详情|交易详情)$/;
const dateOnlyRule =
  /^(?:\d{4}[年./-])?\d{1,2}[月./-]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;
const amountPattern =
  /(?<sign>[+-])?\s*(?<currency>[¥￥₩])?\s*(?<amount>(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(?<unit>人民币|韩元|韩币|元|원)?/g;

function normalizeLine(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[|｜]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeyPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function detectScreenshotPlatform(text: string): ScreenshotPlatform {
  if (/支付宝|Alipay/i.test(text)) return "支付宝";
  if (/微信支付|微信账单|零钱|WeChat Pay/i.test(text)) return "微信支付";
  return "其他账单";
}

function toLocalDateKey(
  year: number,
  month: number,
  day: number,
): LocalDateKey | null {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-") as LocalDateKey;
}

export function extractScreenshotDate(
  text: string,
  fallbackDate: LocalDateKey,
): { date: LocalDateKey; inferred: boolean } {
  const normalized = normalizeLine(text);
  const fallbackYear = Number(fallbackDate.slice(0, 4));
  const explicit = normalized.match(
    /(?:(\d{4})[年./-])?(\d{1,2})[月./-](\d{1,2})(?:日)?/,
  );
  if (explicit) {
    const parsed = toLocalDateKey(
      Number(explicit[1] || fallbackYear),
      Number(explicit[2]),
      Number(explicit[3]),
    );
    if (parsed) return { date: parsed, inferred: false };
  }
  if (/昨天/.test(normalized)) {
    const date = new Date(`${fallbackDate}T12:00:00`);
    date.setDate(date.getDate() - 1);
    return {
      date: [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-") as LocalDateKey,
      inferred: false,
    };
  }
  if (/今天/.test(normalized)) {
    return { date: fallbackDate, inferred: false };
  }
  return { date: fallbackDate, inferred: true };
}

function isMeaningfulNoteLine(line: string): boolean {
  if (!line || platformOnlyRule.test(line) || dateOnlyRule.test(line)) return false;
  if (/^(今天|昨天|昨日)\s*\d{0,2}:?\d{0,2}/.test(line)) return false;
  if (paymentMetadataRule.test(line) || amountLabelRule.test(line)) return false;
  if (
    /^(?:人民币|韩元|韩币)?\s*[+-]?[¥￥₩]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:人民币|韩元|韩币|元|원)?$/.test(
      line,
    )
  ) {
    return false;
  }
  return /[\p{L}]/u.test(line);
}

function findNearbyNote(lines: string[], lineIndex: number): string {
  for (let offset = 0; offset <= 3; offset += 1) {
    const candidate =
      offset === 0 ? lines[lineIndex] : lines[Math.max(0, lineIndex - offset)];
    if (isMeaningfulNoteLine(candidate)) return candidate;
  }
  return "";
}

function findNearbyDateText(lines: string[], lineIndex: number): string {
  return lines
    .slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 2))
    .join(" ");
}

function isPlausibleAmountMatch(
  fullLine: string,
  token: string,
  match: RegExpExecArray,
): boolean {
  const groups = match.groups ?? {};
  const currencyResult = resolveCurrencyAroundAmount(
    fullLine,
    match.index,
    match.index + token.length,
  );
  const hasExplicitSignal = Boolean(
    groups.sign ||
      groups.currency ||
      groups.unit ||
      currencyResult.explicit ||
      token.includes("."),
  );
  const hasAmountContext = amountLabelRule.test(fullLine);
  if (!hasExplicitSignal && !hasAmountContext) return false;
  if (
    paymentMetadataRule.test(fullLine) &&
    !amountLabelRule.test(fullLine) &&
    !/退款|收入|支出|消费|付款|收款/.test(fullLine)
  ) {
    return false;
  }
  return true;
}

function cleanNote(line: string, token: string): string {
  return normalizeLine(
    line
      .replace(token, " ")
      .replace(amountLabelRule, " ")
      .replace(/支付成功|交易成功|付款成功|收款成功|已完成/g, " ")
      .replace(/人民币|韩元|韩币|[¥￥₩]/g, " ")
      .replace(/[：:·]/g, " "),
  );
}

export function createScreenshotRowKey(
  platform: ScreenshotPlatform,
  candidate: Pick<
    ScreenshotCandidate,
    "date" | "direction" | "amount" | "currency" | "note"
  >,
): string {
  return [
    platform,
    candidate.date,
    candidate.direction,
    candidate.currency,
    Math.round(candidate.amount * 100),
    normalizeKeyPart(candidate.note),
  ].join("|");
}

export function parseScreenshotText(
  rawText: string,
  fallbackDate: LocalDateKey,
  fallbackCurrency: CurrencyCode = "CNY",
): {
  platform: ScreenshotPlatform;
  candidates: ScreenshotCandidate[];
  normalizedText: string;
} {
  const normalizedText = rawText
    .normalize("NFKC")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n");
  const platform = detectScreenshotPlatform(normalizedText);
  const lines = normalizedText
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
  const candidates: ScreenshotCandidate[] = [];
  const seen = new Set<string>();

  lines.forEach((line, lineIndex) => {
    if (
      dateOnlyRule.test(line) ||
      /本月支出|本月收入|合计|小计|账户余额|可用余额/.test(line)
    ) {
      return;
    }
    amountPattern.lastIndex = 0;
    let match = amountPattern.exec(line);
    while (match) {
      const token = match[0];
      if (isPlausibleAmountMatch(line, token, match)) {
        const currencyResult = resolveCurrencyAroundAmount(
          line,
          match.index,
          match.index + token.length,
          fallbackCurrency,
        );
        const amount = Number((match.groups?.amount ?? "").replace(/,/g, ""));
        const maximumAmount =
          currencyResult.currency === "KRW" ? 10_000_000_000 : 10_000_000;
        if (Number.isFinite(amount) && amount > 0 && amount < maximumAmount) {
          const nearby = findNearbyNote(lines, lineIndex);
          const noteFromLine = cleanNote(line, token);
          const note =
            (isMeaningfulNoteLine(noteFromLine) ? noteFromLine : nearby) ||
            "待确认账目";
          const context = lines
            .slice(Math.max(0, lineIndex - 2), lineIndex + 1)
            .join(" ");
          const direction: LedgerDirection =
            match.groups?.sign === "+" ||
            /退款|退回|收入|到账|收款|转入/.test(context)
              ? "收入"
              : "支出";
          const classification =
            direction === "收入"
              ? ({ direction, category: "收入" } as const)
              : inferLedgerClassification(note);
          const dateResult = extractScreenshotDate(
            findNearbyDateText(lines, lineIndex),
            fallbackDate,
          );
          const issueCodes: ScreenshotIssueCode[] = [];
          if (note === "待确认账目") issueCodes.push("note-needs-review");
          if (dateResult.inferred) issueCodes.push("date-needs-review");
          if (!currencyResult.explicit || currencyResult.ambiguous) {
            issueCodes.push("currency-needs-review");
          }
          if (/转账|转入|转出|收款/.test(context)) {
            issueCodes.push("transfer-needs-review");
          }
          const base = {
            direction,
            amount,
            currency: currencyResult.currency,
            category:
              direction === "收入" ? ("收入" as const) : classification.category,
            note,
            date: dateResult.date,
            rawLine: line,
            issueCodes,
          };
          const rowKey = createScreenshotRowKey(platform, base);
          if (!seen.has(rowKey)) {
            seen.add(rowKey);
            candidates.push({ ...base, rowKey });
          }
        }
      }
      match = amountPattern.exec(line);
    }
  });

  return {
    platform,
    candidates: candidates.slice(0, 30),
    normalizedText,
  };
}

export function isLikelyLedgerDuplicate(
  existing: {
    direction: LedgerDirection;
    amount: number;
    currency?: CurrencyCode;
    note: string;
    date: LocalDateKey;
    importRowKey?: string;
  },
  rowKey: string,
  candidate: Pick<
    ScreenshotCandidate,
    "date" | "direction" | "amount" | "currency" | "note"
  >,
): boolean {
  if (existing.importRowKey && existing.importRowKey === rowKey) return true;
  return (
    existing.date === candidate.date &&
    existing.direction === candidate.direction &&
    (existing.currency ?? "CNY") === candidate.currency &&
    Math.round(existing.amount * 100) === Math.round(candidate.amount * 100) &&
    normalizeKeyPart(existing.note) === normalizeKeyPart(candidate.note)
  );
}
