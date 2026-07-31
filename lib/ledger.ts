export const expenseCategories = [
  "餐饮",
  "住房",
  "交通",
  "医疗",
  "购物",
  "娱乐",
  "学习",
  "人情",
  "其他",
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];
export type LedgerDirection = "支出" | "收入";

export type LedgerClassification = {
  direction: LedgerDirection;
  category: ExpenseCategory | "收入";
};

export type ParsedLedgerDraft = LedgerClassification & {
  amount: number;
  note: string;
};

export type LedgerLike = {
  direction?: string;
  type?: string;
  amount: number;
  category: string;
};

const categoryRules: Array<[ExpenseCategory, RegExp]> = [
  ["餐饮", /早餐|午餐|晚餐|夜宵|宵夜|吃饭|饭|餐|奶茶|咖啡|外卖|水果|零食|饮料|食堂/],
  ["住房", /房租|租房|住宿|住房|物业|水费|电费|燃气|宽带/],
  ["交通", /地铁|公交|打车|网约车|出租|共享单车|车票|机票|高铁|交通|加油/],
  ["医疗", /看病|医疗|医院|诊所|药|挂号|体检/],
  ["购物", /买衣|买鞋|日用|购物|快递|淘宝|京东|拼多多|超市/],
  ["娱乐", /电影|游戏|娱乐|唱歌|演出|会员|酒吧|旅行|旅游/],
  ["学习", /课程|培训|书|考试|报名费|打印|文具|学习/],
  ["人情", /红包|礼物|请客|份子|转给朋友|人情/],
];

const incomeRule = /工资|薪资|生活费|兼职|奖金|报销|收入|到账|退款|退回|返现/;

export function inferLedgerClassification(text: string): LedgerClassification {
  const normalized = text.trim();
  if (incomeRule.test(normalized)) {
    return { direction: "收入", category: "收入" };
  }
  const match = categoryRules.find(([, rule]) => rule.test(normalized));
  return {
    direction: "支出",
    category: match?.[0] ?? "其他",
  };
}

function normalizeNote(text: string, amountToken: string): string {
  const note = text
    .replace(amountToken, "")
    .replace(/[¥￥元块钱]/g, "")
    .replace(/^(今天|昨日|昨天|刚刚|刚才|我|花了|支付|支出|收入)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return note || "未命名账目";
}

function parseChunk(chunk: string): ParsedLedgerDraft[] {
  const trimmed = chunk.trim();
  if (!trimmed) return [];

  const numberMatches = [...trimmed.matchAll(/[-+]?\d+(?:\.\d{1,2})?/g)];
  if (numberMatches.length === 0) return [];

  if (numberMatches.length === 1) {
    const token = numberMatches[0][0];
    const amount = Math.abs(Number(token));
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const note = normalizeNote(trimmed, token);
    return [{ ...inferLedgerClassification(trimmed), amount, note }];
  }

  const drafts: ParsedLedgerDraft[] = [];
  numberMatches.forEach((match, index) => {
    const token = match[0];
    const currentIndex = match.index ?? 0;
    const previousEnd =
      index === 0
        ? 0
        : (numberMatches[index - 1].index ?? 0) +
          numberMatches[index - 1][0].length;
    const nextStart =
      index + 1 < numberMatches.length
        ? (numberMatches[index + 1].index ?? trimmed.length)
        : trimmed.length;
    const prefix = trimmed
      .slice(previousEnd, currentIndex)
      .replace(/^[\s、和及与还有再]/, "")
      .trim();
    const suffix = trimmed
      .slice(currentIndex + token.length, nextStart)
      .replace(/^[¥￥元块钱\s]+/, "")
      .trim();
    const phrase = `${prefix || suffix || "未命名账目"} ${token}`.trim();
    const amount = Math.abs(Number(token));
    if (Number.isFinite(amount) && amount > 0) {
      drafts.push({
        ...inferLedgerClassification(phrase),
        amount,
        note: normalizeNote(phrase, token),
      });
    }
  });
  return drafts;
}

/**
 * Deterministic local fallback for natural-language bookkeeping.
 * AI may later improve semantics, but confirmation always happens before these
 * drafts enter the ledger.
 */
export function parseLedgerText(text: string): ParsedLedgerDraft[] {
  const chunks = text
    .replace(/[。！？!?]/g, "\n")
    .split(/[\n,，;；]+/)
    .flatMap((chunk) => parseChunk(chunk));

  return chunks.slice(0, 20);
}

export function calculateExpenseByCategory(
  ledger: LedgerLike[],
): Record<ExpenseCategory, number> {
  const totals = Object.fromEntries(
    expenseCategories.map((category) => [category, 0]),
  ) as Record<ExpenseCategory, number>;

  for (const item of ledger) {
    const direction = item.direction ?? item.type;
    if (direction !== "支出") continue;
    const category = expenseCategories.includes(item.category as ExpenseCategory)
      ? (item.category as ExpenseCategory)
      : "其他";
    totals[category] += Math.abs(item.amount);
  }
  return totals;
}

export function calculateUncategorizedExpenseTotal(
  ledger: LedgerLike[],
  knownCategories: readonly string[],
): number {
  return ledger.reduce((sum, item) => {
    const direction = item.direction ?? item.type;
    if (direction !== "支出" || knownCategories.includes(item.category)) {
      return sum;
    }
    return sum + Math.abs(item.amount);
  }, 0);
}
