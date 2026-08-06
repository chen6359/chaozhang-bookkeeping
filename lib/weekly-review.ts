import type { CurrencyCode } from "./currency.ts";
import type {
  ExpenseCategory,
  LedgerDirection,
} from "./ledger.ts";

export type WeeklyReviewWeekKey = `week:${string}`;
export type WeeklyReviewActionStatus =
  | "scheduled"
  | "completed"
  | "cancelled";

export type WeeklyReviewEntry = {
  direction: LedgerDirection;
  amount: number;
  category: ExpenseCategory | "收入";
  expenseClass: "fixed" | "variable";
  currency: CurrencyCode;
  /** Local calendar date in YYYY-MM-DD format. */
  date: string;
};

export type WeeklyReviewDataSummary = {
  validCheckInDays: number;
  minimumValidDays: number;
  expenseEntryCount: number;
  fixedExpenseEntryCount: number;
  adjustableExpenseEntryCount: number;
  expenseTotal: number;
  fixedExpenseTotal: number;
  adjustableExpenseTotal: number;
};

export type WeeklyReviewIssue = {
  kind: "adjustable-category";
  reason: "reference-exceeded" | "largest-adjustable-category";
  category: ExpenseCategory;
  actual: number;
  entryCount: number;
  referenceTarget: number | null;
  overBy: number;
  currency: CurrencyCode;
  message: string;
};

export type WeeklyReviewAnalysis =
  | {
      status: "issue";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      issue: WeeklyReviewIssue;
      summary: WeeklyReviewDataSummary;
    }
  | {
      status: "insufficient-data";
      reason: "not-enough-valid-days";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      message: string;
      summary: WeeklyReviewDataSummary;
    }
  | {
      status: "no-adjustable-issue";
      reason: "no-expense" | "fixed-expenses-only";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      message: string;
      summary: WeeklyReviewDataSummary;
    };

export type AnalyzeWeeklyReviewInput = {
  weekKey: WeeklyReviewWeekKey;
  currency: CurrencyCode;
  validCheckInDays: number;
  entries: readonly WeeklyReviewEntry[];
  categoryReferences?: Partial<Record<ExpenseCategory, number>>;
  minimumValidDays?: number;
};

type WeeklyReviewActionBase = {
  decidedWeek: WeeklyReviewWeekKey;
  effectiveWeek: WeeklyReviewWeekKey;
  status: WeeklyReviewActionStatus;
  currency: CurrencyCode;
};

export type CategoryReferenceAction = WeeklyReviewActionBase & {
  kind: "category-reference";
  target: {
    category: ExpenseCategory;
    amount: number;
    scope: "variable-expense";
  };
};

export type ObserveAction = WeeklyReviewActionBase & {
  kind: "observe";
  target: null;
};

export type WeeklyReviewAction = CategoryReferenceAction | ObserveAction;

export type CreateWeeklyReviewActionInput =
  | {
      kind: "category-reference";
      decidedWeek: WeeklyReviewWeekKey;
      effectiveWeek?: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      category: ExpenseCategory;
      targetAmount: number;
    }
  | {
      kind: "observe";
      decidedWeek: WeeklyReviewWeekKey;
      effectiveWeek?: WeeklyReviewWeekKey;
      currency: CurrencyCode;
    };

export type WeeklyReviewActionEvaluation =
  | {
      outcome: "achieved" | "exceeded";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      category: ExpenseCategory;
      target: number;
      actual: number;
      /** Actual minus target. Positive means the reference was exceeded. */
      variance: number;
      remaining: number;
      exceededBy: number;
      action: CategoryReferenceAction;
    }
  | {
      outcome: "observed";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      action: ObserveAction;
    }
  | {
      outcome: "insufficient-data";
      reason: "not-enough-valid-days";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      message: string;
      action: WeeklyReviewAction;
    }
  | {
      outcome: "not-due";
      reason: "week-mismatch";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      message: string;
      action: WeeklyReviewAction;
    }
  | {
      outcome: "cancelled";
      weekKey: WeeklyReviewWeekKey;
      currency: CurrencyCode;
      action: WeeklyReviewAction;
    };

export type EvaluateWeeklyReviewActionInput = {
  action: WeeklyReviewAction;
  weekKey: WeeklyReviewWeekKey;
  validCheckInDays: number;
  entries: readonly WeeklyReviewEntry[];
  minimumValidDays?: number;
};

export const DEFAULT_WEEKLY_REVIEW_MINIMUM_VALID_DAYS = 4;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const WEEK_KEY_PATTERN = /^week:(\d{4}-\d{2}-\d{2})$/u;
const CURRENCY_FRACTION_DIGITS: Record<CurrencyCode, number> = {
  CNY: 2,
  KRW: 0,
};

function assertCurrency(currency: string): asserts currency is CurrencyCode {
  if (currency !== "CNY" && currency !== "KRW") {
    throw new RangeError(`Unsupported currency: ${currency}`);
  }
}

function parseDateKey(value: string, fieldName: string): Date {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${fieldName} must be a real calendar date.`);
  }
  return date;
}

function parseWeekKey(value: WeeklyReviewWeekKey, fieldName: string): Date {
  const match = WEEK_KEY_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(`${fieldName} must use week:YYYY-MM-DD format.`);
  }
  return parseDateKey(match[1], fieldName);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getNextWeeklyReviewWeekKey(
  weekKey: WeeklyReviewWeekKey,
): WeeklyReviewWeekKey {
  const date = parseWeekKey(weekKey, "weekKey");
  date.setUTCDate(date.getUTCDate() + 7);
  return `week:${toDateKey(date)}`;
}

function normalizeMinimumValidDays(value: number | undefined): number {
  if (value === undefined) return DEFAULT_WEEKLY_REVIEW_MINIMUM_VALID_DAYS;
  if (!Number.isInteger(value) || value <= 0 || value > 7) {
    throw new RangeError("minimumValidDays must be an integer from 1 to 7.");
  }
  return value;
}

function normalizeValidCheckInDays(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 7) {
    throw new RangeError("validCheckInDays must be an integer from 0 to 7.");
  }
  return value;
}

function moneyFactor(currency: CurrencyCode): number {
  return 10 ** CURRENCY_FRACTION_DIGITS[currency];
}

function toMinorUnits(
  amount: number,
  currency: CurrencyCode,
  fieldName: string,
): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`${fieldName} must be a non-negative amount.`);
  }
  const factor = moneyFactor(currency);
  const units = Math.round(amount * factor);
  if (
    !Number.isSafeInteger(units) ||
    Math.abs(amount * factor - units) > 1e-8
  ) {
    throw new RangeError(
      `${fieldName} has unsupported precision for ${currency}.`,
    );
  }
  return units;
}

function fromMinorUnits(units: number, currency: CurrencyCode): number {
  return units / moneyFactor(currency);
}

function isEntryInWeek(
  entry: WeeklyReviewEntry,
  weekStart: Date,
): boolean {
  const entryDate = parseDateKey(entry.date, "entry.date");
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return entryDate >= weekStart && entryDate < weekEnd;
}

function getWeekExpenseEntries(
  entries: readonly WeeklyReviewEntry[],
  weekKey: WeeklyReviewWeekKey,
  currency: CurrencyCode,
): WeeklyReviewEntry[] {
  const weekStart = parseWeekKey(weekKey, "weekKey");
  return entries.filter((entry, index) => {
    assertCurrency(entry.currency);
    toMinorUnits(entry.amount, entry.currency, `entries[${index}].amount`);
    return (
      entry.direction === "支出" &&
      entry.currency === currency &&
      isEntryInWeek(entry, weekStart)
    );
  });
}

function sumEntries(
  entries: readonly WeeklyReviewEntry[],
  currency: CurrencyCode,
): number {
  const totalMinorUnits = entries.reduce(
    (sum, entry, index) =>
      sum +
      toMinorUnits(entry.amount, currency, `entries[${index}].amount`),
    0,
  );
  return fromMinorUnits(totalMinorUnits, currency);
}

function buildSummary(
  expenseEntries: readonly WeeklyReviewEntry[],
  validCheckInDays: number,
  minimumValidDays: number,
  currency: CurrencyCode,
): WeeklyReviewDataSummary {
  const fixedEntries = expenseEntries.filter(
    (entry) => entry.expenseClass === "fixed",
  );
  const adjustableEntries = expenseEntries.filter(
    (entry) => entry.expenseClass === "variable",
  );
  return {
    validCheckInDays,
    minimumValidDays,
    expenseEntryCount: expenseEntries.length,
    fixedExpenseEntryCount: fixedEntries.length,
    adjustableExpenseEntryCount: adjustableEntries.length,
    expenseTotal: sumEntries(expenseEntries, currency),
    fixedExpenseTotal: sumEntries(fixedEntries, currency),
    adjustableExpenseTotal: sumEntries(adjustableEntries, currency),
  };
}

type CategoryAggregate = {
  category: ExpenseCategory;
  actualMinorUnits: number;
  entryCount: number;
};

function aggregateAdjustableCategories(
  entries: readonly WeeklyReviewEntry[],
  currency: CurrencyCode,
): CategoryAggregate[] {
  const aggregates = new Map<ExpenseCategory, CategoryAggregate>();

  entries.forEach((entry, index) => {
    if (entry.expenseClass !== "variable" || entry.category === "收入") {
      return;
    }
    const current = aggregates.get(entry.category) ?? {
      category: entry.category,
      actualMinorUnits: 0,
      entryCount: 0,
    };
    current.actualMinorUnits += toMinorUnits(
      entry.amount,
      currency,
      `entries[${index}].amount`,
    );
    current.entryCount += 1;
    aggregates.set(entry.category, current);
  });

  return [...aggregates.values()];
}

export function analyzeWeeklyReview({
  weekKey,
  currency,
  validCheckInDays: rawValidCheckInDays,
  entries,
  categoryReferences = {},
  minimumValidDays: rawMinimumValidDays,
}: AnalyzeWeeklyReviewInput): WeeklyReviewAnalysis {
  assertCurrency(currency);
  parseWeekKey(weekKey, "weekKey");
  const validCheckInDays = normalizeValidCheckInDays(rawValidCheckInDays);
  const minimumValidDays = normalizeMinimumValidDays(rawMinimumValidDays);
  const expenseEntries = getWeekExpenseEntries(entries, weekKey, currency);
  const summary = buildSummary(
    expenseEntries,
    validCheckInDays,
    minimumValidDays,
    currency,
  );

  if (validCheckInDays < minimumValidDays) {
    return {
      status: "insufficient-data",
      reason: "not-enough-valid-days",
      weekKey,
      currency,
      message: `本周只有 ${validCheckInDays} 个有效核对日，至少需要 ${minimumValidDays} 个有效核对日后再判断。`,
      summary,
    };
  }

  if (expenseEntries.length === 0) {
    return {
      status: "no-adjustable-issue",
      reason: "no-expense",
      weekKey,
      currency,
      message: "本周没有已确认支出，不需要设置压缩目标。",
      summary,
    };
  }

  const adjustableEntries = expenseEntries.filter(
    (entry) => entry.expenseClass === "variable",
  );
  if (adjustableEntries.length === 0) {
    return {
      status: "no-adjustable-issue",
      reason: "fixed-expenses-only",
      weekKey,
      currency,
      message:
        "本周支出全部是固定支出，不能直接把房租等必要款项作为压缩建议。",
      summary,
    };
  }

  const aggregates = aggregateAdjustableCategories(
    adjustableEntries,
    currency,
  );
  const exceededReferences = aggregates
    .flatMap((aggregate) => {
      const reference = categoryReferences[aggregate.category];
      if (reference === undefined || reference === null) return [];
      const referenceMinorUnits = toMinorUnits(
        reference,
        currency,
        `categoryReferences.${aggregate.category}`,
      );
      if (referenceMinorUnits <= 0) return [];
      const overByMinorUnits =
        aggregate.actualMinorUnits - referenceMinorUnits;
      return overByMinorUnits > 0
        ? [{ aggregate, referenceMinorUnits, overByMinorUnits }]
        : [];
    })
    .sort(
      (a, b) =>
        b.overByMinorUnits - a.overByMinorUnits ||
        b.aggregate.actualMinorUnits - a.aggregate.actualMinorUnits ||
        a.aggregate.category.localeCompare(b.aggregate.category, "zh-CN"),
    );

  if (exceededReferences.length > 0) {
    const selected = exceededReferences[0];
    const actual = fromMinorUnits(
      selected.aggregate.actualMinorUnits,
      currency,
    );
    const referenceTarget = fromMinorUnits(
      selected.referenceMinorUnits,
      currency,
    );
    const overBy = fromMinorUnits(selected.overByMinorUnits, currency);
    return {
      status: "issue",
      weekKey,
      currency,
      issue: {
        kind: "adjustable-category",
        reason: "reference-exceeded",
        category: selected.aggregate.category,
        actual,
        entryCount: selected.aggregate.entryCount,
        referenceTarget,
        overBy,
        currency,
        message: `本周${selected.aggregate.category}可调整支出超过参考额，可作为下周唯一关注项。`,
      },
      summary,
    };
  }

  const selected = aggregates.sort(
    (a, b) =>
      b.actualMinorUnits - a.actualMinorUnits ||
      b.entryCount - a.entryCount ||
      a.category.localeCompare(b.category, "zh-CN"),
  )[0];
  const actual = fromMinorUnits(selected.actualMinorUnits, currency);
  return {
    status: "issue",
    weekKey,
    currency,
    issue: {
      kind: "adjustable-category",
      reason: "largest-adjustable-category",
      category: selected.category,
      actual,
      entryCount: selected.entryCount,
      referenceTarget: null,
      overBy: 0,
      currency,
      message: `本周可调整支出中，${selected.category}金额最高，可优先核对是否需要设定下周参考额。`,
    },
    summary,
  };
}

export function createWeeklyReviewAction(
  input: CreateWeeklyReviewActionInput,
): WeeklyReviewAction {
  assertCurrency(input.currency);
  parseWeekKey(input.decidedWeek, "decidedWeek");
  const effectiveWeek =
    input.effectiveWeek ?? getNextWeeklyReviewWeekKey(input.decidedWeek);
  parseWeekKey(effectiveWeek, "effectiveWeek");

  if (input.kind === "observe") {
    return {
      kind: "observe",
      decidedWeek: input.decidedWeek,
      effectiveWeek,
      status: "scheduled",
      currency: input.currency,
      target: null,
    };
  }

  const targetMinorUnits = toMinorUnits(
    input.targetAmount,
    input.currency,
    "targetAmount",
  );
  if (targetMinorUnits <= 0) {
    throw new RangeError("targetAmount must be greater than zero.");
  }

  return {
    kind: "category-reference",
    decidedWeek: input.decidedWeek,
    effectiveWeek,
    status: "scheduled",
    currency: input.currency,
    target: {
      category: input.category,
      amount: fromMinorUnits(targetMinorUnits, input.currency),
      scope: "variable-expense",
    },
  };
}

export function evaluateWeeklyReviewAction({
  action,
  weekKey,
  validCheckInDays: rawValidCheckInDays,
  entries,
  minimumValidDays: rawMinimumValidDays,
}: EvaluateWeeklyReviewActionInput): WeeklyReviewActionEvaluation {
  assertCurrency(action.currency);
  parseWeekKey(weekKey, "weekKey");
  const validCheckInDays = normalizeValidCheckInDays(rawValidCheckInDays);
  const minimumValidDays = normalizeMinimumValidDays(rawMinimumValidDays);

  if (action.status === "cancelled") {
    return {
      outcome: "cancelled",
      weekKey,
      currency: action.currency,
      action,
    };
  }

  if (weekKey !== action.effectiveWeek) {
    return {
      outcome: "not-due",
      reason: "week-mismatch",
      weekKey,
      currency: action.currency,
      message: `这项行动在 ${action.effectiveWeek} 生效，不能用 ${weekKey} 的账目结算。`,
      action,
    };
  }

  if (validCheckInDays < minimumValidDays) {
    return {
      outcome: "insufficient-data",
      reason: "not-enough-valid-days",
      weekKey,
      currency: action.currency,
      message: `本周只有 ${validCheckInDays} 个有效核对日，至少需要 ${minimumValidDays} 个才能判断行动结果。`,
      action,
    };
  }

  if (action.kind === "observe") {
    return {
      outcome: "observed",
      weekKey,
      currency: action.currency,
      action: { ...action, status: "completed" },
    };
  }

  const expenseEntries = getWeekExpenseEntries(
    entries,
    weekKey,
    action.currency,
  );
  const matchingEntries = expenseEntries.filter(
    (entry) =>
      entry.expenseClass === "variable" &&
      entry.category === action.target.category,
  );
  const actualMinorUnits = matchingEntries.reduce(
    (sum, entry, index) =>
      sum +
      toMinorUnits(
        entry.amount,
        action.currency,
        `matchingEntries[${index}].amount`,
      ),
    0,
  );
  const targetMinorUnits = toMinorUnits(
    action.target.amount,
    action.currency,
    "action.target.amount",
  );
  const varianceMinorUnits = actualMinorUnits - targetMinorUnits;
  const actual = fromMinorUnits(actualMinorUnits, action.currency);
  const target = fromMinorUnits(targetMinorUnits, action.currency);
  const variance = fromMinorUnits(varianceMinorUnits, action.currency);

  return {
    outcome: varianceMinorUnits <= 0 ? "achieved" : "exceeded",
    weekKey,
    currency: action.currency,
    category: action.target.category,
    target,
    actual,
    variance,
    remaining: fromMinorUnits(
      Math.max(0, -varianceMinorUnits),
      action.currency,
    ),
    exceededBy: fromMinorUnits(
      Math.max(0, varianceMinorUnits),
      action.currency,
    ),
    action: { ...action, status: "completed" },
  };
}
