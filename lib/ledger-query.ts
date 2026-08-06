import {
  formatCurrencyMoney,
  type CurrencyCode,
} from "./currency.ts";
import {
  getCycleWeekKey,
  getLocalDateKey,
  shiftLocalDateKey,
  type LocalDateKey,
} from "./habit.ts";
import {
  expenseCategories,
  type ExpenseCategory,
  type LedgerDirection,
} from "./ledger.ts";

export type LedgerQueryEntry = {
  id?: string;
  direction: LedgerDirection;
  amount: number;
  category: ExpenseCategory | "收入" | string;
  note: string;
  date: LocalDateKey;
  currency: CurrencyCode;
};

export type LedgerQueryScopeId =
  | "today"
  | "yesterday"
  | "recent-days"
  | "week"
  | "month"
  | "cycle";

export type LedgerQueryScope = {
  id: LedgerQueryScopeId;
  label: string;
  startDate: LocalDateKey;
  endDate: LocalDateKey;
};

export type LedgerQueryIntent =
  | "total-expense"
  | "category-expense"
  | "note-keyword"
  | "top-categories"
  | "largest-transactions"
  | "safe-to-spend"
  | "unsupported";

export type LedgerQueryEvidence =
  | {
      kind: "metric";
      label: string;
      amount: number;
    }
  | {
      kind: "category";
      label: string;
      category: string;
      amount: number;
      count: number;
    }
  | {
      kind: "transaction";
      label: string;
      amount: number;
      date: LocalDateKey;
      category: string;
      entryId?: string;
    };

export type LedgerQueryAction = {
  id: string;
  label: string;
  query: string;
};

export type LedgerQueryUnsupported = {
  reason: string;
  capabilities: readonly string[];
};

export type LedgerQueryResult = {
  intent: LedgerQueryIntent;
  title: string;
  summary: string;
  scope: LedgerQueryScope;
  currency: CurrencyCode;
  matchedAmount: number;
  matchedCount: number;
  evidence: LedgerQueryEvidence[];
  actions: LedgerQueryAction[];
  unsupported: LedgerQueryUnsupported | null;
};

export type LedgerQueryInput = {
  question: string;
  ledger: readonly LedgerQueryEntry[];
  currency: CurrencyCode;
  cycleStartDate: LocalDateKey;
  cycleEndDate: LocalDateKey;
  today?: LocalDateKey;
  safeToSpend?: number;
};

export const ledgerQueryCapabilities = [
  "查询今天、昨天、最近几天、本周、本月或本周期的总支出",
  "按支出分类或备注关键词查询",
  "查看钱主要花在哪三个分类",
  "查看金额最大的三笔支出",
  "查询调用方提供的安全可花金额",
] as const;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const recentDaysToken =
  /(?:前|最近|近|过去)(\d+|[一二两三四五六七八九十]+)天/;

const scopeTokens =
  /当前周期|本周期|本期|今天|今日|当天|昨天|昨日|本周|这周|本月|这个月|(?:前|最近|近|过去)(?:\d+|[一二两三四五六七八九十]+)天/g;

const queryFillerTokens =
  /请|帮我|麻烦|查一下|查询|查查|查|看看|看一下|统计|算一下|一共|总共|合计|总计|总支出|支出|消费|花了|花费|用了|金额|多少钱|多少|记录|账目|账单|明细|的|我/g;

const unsupportedTimeOrAnalysis =
  /前天|明天|上周|上个月|上月|下周|下个月|下月|去年|明年|未来|预测|趋势|同比|环比|对比|比较|为什么|原因|应该|建议|预算怎么|如何省|怎么省/;

const totalExpenseRule =
  /总支出|(?:一共|总共|合计|总计).*(?:花|支出|消费|用)|(?:花了|花费|用了|支出|消费).*(?:多少|多少钱)|^(?:今天|今日|昨天|昨日|本周|这周|本月|这个月|本周期|当前周期|本期)?支出$/;

const topCategoriesRule =
  /(?:钱|支出|消费).*(?:花哪|去哪|去向|主要)|花哪|主要花|最多.*(?:分类|类别|方向)|哪(?:个|类|方面).*(?:最多|最高)/;

const largestTransactionsRule =
  /(?:最大|最高|最贵|金额最高).*(?:三笔|3笔|几笔|支出|消费)|(?:三笔|3笔).*(?:最大|最高|最贵)/;

const safeToSpendRule =
  /安全可花|还能花|还可花|可花多少|可以花多少|能花多少|剩多少(?:能花|可花)?/;

const incomeRule = /收入|进账|到账|工资|生活费(?:有多少|是多少)|赚了多少/;

function assertDateKey(value: LocalDateKey, field: string): void {
  if (!DATE_KEY_PATTERN.test(value)) {
    throw new RangeError(`${field} must be a YYYY-MM-DD date key`);
  }
  // Reuse the shared calendar validator so impossible dates fail as well.
  getLocalDateKey(value);
}

function monthEnd(dateKey: LocalDateKey): LocalDateKey {
  const [year, month] = dateKey.split("-").map(Number);
  const nextMonth =
    month === 12
      ? (`${year + 1}-01-01` as LocalDateKey)
      : (`${year}-${String(month + 1).padStart(2, "0")}-01` as LocalDateKey);
  return shiftLocalDateKey(nextMonth, -1);
}

function parseRecentDayCount(value: string): number | null {
  if (/^\d+$/.test(value)) {
    const count = Number(value);
    return Number.isInteger(count) && count >= 1 && count <= 365
      ? count
      : null;
  }

  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === "十") return 10;
  if (!value.includes("十")) return digits[value] ?? null;

  const [tensText, unitsText] = value.split("十");
  const tens = tensText ? digits[tensText] : 1;
  const units = unitsText ? digits[unitsText] : 0;
  if (tens === undefined || units === undefined) return null;
  const count = tens * 10 + units;
  return count >= 1 && count <= 365 ? count : null;
}

function resolveScope(
  question: string,
  today: LocalDateKey,
  cycleStartDate: LocalDateKey,
  cycleEndDate: LocalDateKey,
): LedgerQueryScope {
  const recentDaysMatch = question.match(recentDaysToken);
  const recentDayCount = recentDaysMatch
    ? parseRecentDayCount(recentDaysMatch[1])
    : null;
  if (recentDayCount !== null) {
    return {
      id: "recent-days",
      label: `最近${recentDayCount}天`,
      startDate: shiftLocalDateKey(today, -(recentDayCount - 1)),
      endDate: today,
    };
  }
  if (/本周期|当前周期|本期/.test(question)) {
    return {
      id: "cycle",
      label: "本周期",
      startDate: cycleStartDate,
      endDate: cycleEndDate,
    };
  }
  if (/今天|今日|当天/.test(question)) {
    return {
      id: "today",
      label: "今天",
      startDate: today,
      endDate: today,
    };
  }
  if (/昨天|昨日/.test(question)) {
    const yesterday = shiftLocalDateKey(today, -1);
    return {
      id: "yesterday",
      label: "昨天",
      startDate: yesterday,
      endDate: yesterday,
    };
  }
  if (/本周|这周/.test(question)) {
    const startDate = getCycleWeekKey(today).replace(
      "week:",
      "",
    ) as LocalDateKey;
    return {
      id: "week",
      label: "本周",
      startDate,
      endDate: shiftLocalDateKey(startDate, 6),
    };
  }
  if (/本月|这个月/.test(question)) {
    const startDate = `${today.slice(0, 7)}-01` as LocalDateKey;
    return {
      id: "month",
      label: "本月",
      startDate,
      endDate: monthEnd(startDate),
    };
  }
  return {
    id: "cycle",
    label: "本周期",
    startDate: cycleStartDate,
    endDate: cycleEndDate,
  };
}

function normalizeQuestion(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
}

function explicitCategory(
  question: string,
): ExpenseCategory | null {
  return (
    expenseCategories.find((category) => question.includes(category)) ?? null
  );
}

function extractNoteKeyword(question: string): string | null {
  const quoted = question.match(/[“"'「『](.+?)[”"'」』]/)?.[1]?.trim();
  if (quoted) return quoted;

  const explicitNote = question.match(
    /备注(?:里|中)?(?:包含|有|是|叫)?(.+?)(?:的)?(?:支出|消费|记录|账目|花了多少|多少钱|多少)?$/,
  )?.[1]?.trim();
  if (explicitNote) return explicitNote;

  const candidate = question
    .replace(scopeTokens, "")
    .replace(queryFillerTokens, "")
    .replace(/[，。！？、；：,.!?;:]/g, "")
    .trim();

  if (!candidate || candidate.length > 30) return null;
  return candidate;
}

function inScope(
  entry: LedgerQueryEntry,
  currency: CurrencyCode,
  scope: LedgerQueryScope,
): boolean {
  return (
    entry.direction === "支出" &&
    entry.currency === currency &&
    Number.isFinite(entry.amount) &&
    entry.amount > 0 &&
    DATE_KEY_PATTERN.test(entry.date) &&
    entry.date >= scope.startDate &&
    entry.date <= scope.endDate
  );
}

function sortLargest(
  entries: readonly LedgerQueryEntry[],
): LedgerQueryEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.amount - left.amount ||
      right.date.localeCompare(left.date) ||
      (left.id ?? left.note).localeCompare(right.id ?? right.note),
  );
}

function transactionEvidence(
  entries: readonly LedgerQueryEntry[],
  limit = 5,
): LedgerQueryEvidence[] {
  return sortLargest(entries)
    .slice(0, limit)
    .map((entry) => ({
      kind: "transaction" as const,
      label: entry.note,
      amount: entry.amount,
      date: entry.date,
      category: entry.category,
      entryId: entry.id,
    }));
}

function categoryEvidence(
  entries: readonly LedgerQueryEntry[],
  limit = 3,
): LedgerQueryEvidence[] {
  const totals = new Map<string, { amount: number; count: number }>();
  entries.forEach((entry) => {
    const category =
      entry.category === "收入" || !entry.category ? "其他" : entry.category;
    const current = totals.get(category) ?? { amount: 0, count: 0 };
    current.amount += entry.amount;
    current.count += 1;
    totals.set(category, current);
  });

  return [...totals.entries()]
    .sort(
      ([leftCategory, left], [rightCategory, right]) =>
        right.amount - left.amount ||
        leftCategory.localeCompare(rightCategory, "zh-CN"),
    )
    .slice(0, limit)
    .map(([category, value]) => ({
      kind: "category" as const,
      label: category,
      category,
      amount: value.amount,
      count: value.count,
    }));
}

function sum(entries: readonly LedgerQueryEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

function defaultActions(scope: LedgerQueryScope): LedgerQueryAction[] {
  return [
    {
      id: "top-categories",
      label: "看看钱花哪了",
      query: `${scope.label}的钱花哪了`,
    },
    {
      id: "largest-transactions",
      label: "查看最大三笔",
      query: `${scope.label}金额最大的三笔`,
    },
  ];
}

function supportedResult(
  base: Omit<LedgerQueryResult, "unsupported">,
): LedgerQueryResult {
  return { ...base, unsupported: null };
}

function unsupportedResult(
  scope: LedgerQueryScope,
  currency: CurrencyCode,
  reason: string,
): LedgerQueryResult {
  return {
    intent: "unsupported",
    title: "这个问题暂时还不会回答",
    summary: `${reason}。你可以查询总支出、分类或备注支出、前三个支出去向、最大三笔，以及安全可花金额。`,
    scope,
    currency,
    matchedAmount: 0,
    matchedCount: 0,
    evidence: [],
    actions: [
      {
        id: "try-week-total",
        label: "查询本周总支出",
        query: "本周总支出",
      },
      {
        id: "try-top-categories",
        label: "查询钱花哪了",
        query: "本周期的钱花哪了",
      },
      {
        id: "try-safe-to-spend",
        label: "查询还能花多少",
        query: "我还能花多少",
      },
    ],
    unsupported: {
      reason,
      capabilities: ledgerQueryCapabilities,
    },
  };
}

/**
 * Deterministic ledger query engine.
 *
 * Natural language is mapped to a small, explicit set of supported intents.
 * Every amount is calculated from caller-provided ledger data. AI is not used
 * and this function never mutates or posts ledger entries.
 */
export function queryLedger(input: LedgerQueryInput): LedgerQueryResult {
  const question = normalizeQuestion(input.question);
  if (!question) {
    throw new TypeError("question must not be empty");
  }

  const today = input.today ?? getLocalDateKey();
  assertDateKey(today, "today");
  assertDateKey(input.cycleStartDate, "cycleStartDate");
  assertDateKey(input.cycleEndDate, "cycleEndDate");
  if (input.cycleEndDate < input.cycleStartDate) {
    throw new RangeError("cycleEndDate must not be before cycleStartDate");
  }

  const scope = resolveScope(
    question,
    today,
    input.cycleStartDate,
    input.cycleEndDate,
  );

  if (unsupportedTimeOrAnalysis.test(question)) {
    return unsupportedResult(
      scope,
      input.currency,
      "目前只支持已发生支出的固定时间范围查询，不做预测、原因分析或跨周期比较",
    );
  }

  const expenses = input.ledger.filter((entry) =>
    inScope(entry, input.currency, scope),
  );
  const expenseTotal = sum(expenses);

  if (safeToSpendRule.test(question)) {
    if (
      input.safeToSpend === undefined ||
      !Number.isFinite(input.safeToSpend)
    ) {
      return unsupportedResult(
        scope,
        input.currency,
        "调用方尚未提供安全可花金额",
      );
    }
    return supportedResult({
      intent: "safe-to-spend",
      title: "安全可花",
      summary: `按当前账本计算，安全可花 ${formatCurrencyMoney(
        input.safeToSpend,
        input.currency,
      )}。`,
      scope,
      currency: input.currency,
      matchedAmount: input.safeToSpend,
      matchedCount: 0,
      evidence: [
        {
          kind: "metric",
          label: "安全可花",
          amount: input.safeToSpend,
        },
      ],
      actions: [
        {
          id: "cycle-total",
          label: "查看本周期总支出",
          query: "本周期总支出",
        },
      ],
    });
  }

  if (incomeRule.test(question)) {
    return unsupportedResult(
      scope,
      input.currency,
      "当前查询范围只包括支出，不查询收入",
    );
  }

  if (largestTransactionsRule.test(question)) {
    const largest = sortLargest(expenses).slice(0, 3);
    const largestTotal = sum(largest);
    const share =
      expenseTotal > 0 ? Math.round((largestTotal / expenseTotal) * 100) : 0;
    return supportedResult({
      intent: "largest-transactions",
      title: `${scope.label}金额最大的三笔支出`,
      summary: largest.length
        ? `最大的 ${largest.length} 笔合计 ${formatCurrencyMoney(
            largestTotal,
            input.currency,
          )}，占${scope.label}总支出的 ${share}%。`
        : `${scope.label}还没有支出记录。`,
      scope,
      currency: input.currency,
      matchedAmount: largestTotal,
      matchedCount: largest.length,
      evidence: transactionEvidence(largest, 3),
      actions: defaultActions(scope).slice(0, 1),
    });
  }

  if (topCategoriesRule.test(question)) {
    const evidence = categoryEvidence(expenses, 3);
    const description = evidence
      .map((item) =>
        item.kind === "category"
          ? `${item.category} ${formatCurrencyMoney(
              item.amount,
              input.currency,
            )}`
          : "",
      )
      .filter(Boolean)
      .join("、");
    return supportedResult({
      intent: "top-categories",
      title: `${scope.label}的钱花哪了`,
      summary: evidence.length
        ? `${scope.label}支出主要在：${description}。`
        : `${scope.label}还没有支出记录。`,
      scope,
      currency: input.currency,
      matchedAmount: expenseTotal,
      matchedCount: expenses.length,
      evidence,
      actions: evidence.length
        ? [
            {
              id: "view-leading-category",
              label: `查看${evidence[0].label}明细`,
              query: `${scope.label}${evidence[0].label}花了多少`,
            },
            defaultActions(scope)[1],
          ]
        : defaultActions(scope),
    });
  }

  const category = explicitCategory(question);
  if (category) {
    const matches = expenses.filter((entry) => entry.category === category);
    const total = sum(matches);
    return supportedResult({
      intent: "category-expense",
      title: `${scope.label}${category}支出`,
      summary: matches.length
        ? `${scope.label}${category}共 ${matches.length} 笔，合计 ${formatCurrencyMoney(
            total,
            input.currency,
          )}。`
        : `${scope.label}没有${category}支出记录。`,
      scope,
      currency: input.currency,
      matchedAmount: total,
      matchedCount: matches.length,
      evidence: transactionEvidence(matches),
      actions: defaultActions(scope),
    });
  }

  const noteKeyword = extractNoteKeyword(question);
  if (
    noteKeyword &&
    /查|找|记录|账|花|支出|消费|多少|金额/.test(question)
  ) {
    const normalizedKeyword = normalizeSearchText(noteKeyword);
    const matches = expenses.filter((entry) =>
      normalizeSearchText(entry.note).includes(normalizedKeyword),
    );
    const total = sum(matches);
    return supportedResult({
      intent: "note-keyword",
      title: `${scope.label}“${noteKeyword}”支出`,
      summary: matches.length
        ? `${scope.label}备注包含“${noteKeyword}”的支出共 ${matches.length} 笔，合计 ${formatCurrencyMoney(
            total,
            input.currency,
          )}。`
        : `${scope.label}没有找到备注包含“${noteKeyword}”的支出。`,
      scope,
      currency: input.currency,
      matchedAmount: total,
      matchedCount: matches.length,
      evidence: transactionEvidence(matches),
      actions: defaultActions(scope),
    });
  }

  if (totalExpenseRule.test(question)) {
    return supportedResult({
      intent: "total-expense",
      title: `${scope.label}总支出`,
      summary: expenses.length
        ? `${scope.label}共记录 ${expenses.length} 笔支出，合计 ${formatCurrencyMoney(
            expenseTotal,
            input.currency,
          )}。`
        : `${scope.label}还没有支出记录。`,
      scope,
      currency: input.currency,
      matchedAmount: expenseTotal,
      matchedCount: expenses.length,
      evidence: categoryEvidence(expenses),
      actions: defaultActions(scope),
    });
  }

  return unsupportedResult(
    scope,
    input.currency,
    "没有识别出可执行的支出查询",
  );
}
