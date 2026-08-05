export const currencyCodes = ["CNY", "KRW"] as const;

export type CurrencyCode = (typeof currencyCodes)[number];

type CurrencyMeta = {
  label: string;
  symbol: string;
  locale: string;
  fractionDigits: number;
  inputStep: string;
};

export const currencyMeta: Record<CurrencyCode, CurrencyMeta> = {
  CNY: {
    label: "人民币",
    symbol: "¥",
    locale: "zh-CN",
    fractionDigits: 2,
    inputStep: "0.01",
  },
  KRW: {
    label: "韩元",
    symbol: "₩",
    locale: "ko-KR",
    fractionDigits: 0,
    inputStep: "1",
  },
};

const formatters = Object.fromEntries(
  currencyCodes.map((currency) => {
    const meta = currencyMeta[currency];
    return [
      currency,
      new Intl.NumberFormat(meta.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: meta.fractionDigits,
      }),
    ];
  }),
) as Record<CurrencyCode, Intl.NumberFormat>;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    (currencyCodes as readonly string[]).includes(value)
  );
}

/**
 * Validates the precision supported by a currency without imposing business
 * rules such as positivity. Ledger entry flows should additionally require
 * the amount to be greater than zero.
 */
export function isValidCurrencyAmount(
  value: number,
  currency: CurrencyCode,
  options: { allowNegative?: boolean } = {},
): boolean {
  if (!Number.isFinite(value)) return false;
  if (!options.allowNegative && value < 0) return false;
  const factor = 10 ** currencyMeta[currency].fractionDigits;
  return Math.abs(value * factor - Math.round(value * factor)) < 1e-8;
}

export function formatCurrencyMoney(
  value: number,
  currency: CurrencyCode,
  withSign = false,
): string {
  const fractionDigits = currencyMeta[currency].fractionDigits;
  const zeroThreshold = 0.5 / 10 ** fractionDigits;
  const normalized =
    Number.isFinite(value) && Math.abs(value) >= zeroThreshold ? value : 0;
  const sign =
    normalized < 0 ? "−" : withSign && normalized > 0 ? "+" : "";
  return `${sign}${currencyMeta[currency].symbol}${formatters[currency].format(
    Math.abs(normalized),
  )}`;
}

export function getExplicitCurrencyCodes(text: string): CurrencyCode[] {
  const normalized = text.normalize("NFKC");
  const matches: CurrencyCode[] = [];
  if (
    /人民币|[¥￥]/.test(normalized) ||
    /\d[\d,]*(?:\.\d+)?\s*元(?:$|[^\p{L}])/u.test(
      normalized,
    )
  ) {
    matches.push("CNY");
  }
  if (
    /韩元|韩币|₩/.test(normalized) ||
    /\d[\d,]*(?:\.\d+)?\s*원(?:$|[^\p{L}])/u.test(
      normalized,
    )
  ) {
    matches.push("KRW");
  }
  return matches;
}

export function inferCurrencyCode(
  text: string,
  fallbackCurrency: CurrencyCode = "CNY",
): CurrencyCode {
  const matches = getExplicitCurrencyCodes(text);
  return matches.length === 1 ? matches[0] : fallbackCurrency;
}

export function resolveCurrencyAroundAmount(
  text: string,
  amountStart: number,
  amountEnd: number,
  fallbackCurrency: CurrencyCode = "CNY",
): {
  currency: CurrencyCode;
  explicit: boolean;
  ambiguous: boolean;
} {
  const before = text.slice(Math.max(0, amountStart - 16), amountStart);
  const token = text.slice(amountStart, amountEnd);
  const after = text.slice(amountEnd, Math.min(text.length, amountEnd + 16));

  const directBefore = before.match(
    /(人民币|韩元|韩币|[¥￥₩])\s*$/,
  )?.[1];
  const directAfter = after.match(
    /^\s*(人民币|韩元|韩币|元|원)/,
  )?.[1];
  const direct = directBefore ?? directAfter;
  if (direct) {
    return {
      currency: /韩元|韩币|₩|원/.test(direct) ? "KRW" : "CNY",
      explicit: true,
      ambiguous: false,
    };
  }

  const matches = getExplicitCurrencyCodes(`${before}${token}${after}`);
  if (matches.length === 1) {
    return {
      currency: matches[0],
      explicit: true,
      ambiguous: false,
    };
  }
  return {
    currency: fallbackCurrency,
    explicit: false,
    ambiguous: matches.length > 1,
  };
}
