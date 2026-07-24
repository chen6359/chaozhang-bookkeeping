export type LedgerClassification = {
  type: "支出" | "收入" | "储蓄";
  category: string;
};

export type LedgerLike = {
  type: string;
  amount: number;
  category: string;
};

export type LedgerQuestionIntent =
  | "spending-summary"
  | "budget-balance"
  | "savings-progress"
  | null;

export function inferLedgerQuestionIntent(text: string): LedgerQuestionIntent {
  if (/花哪|最多/.test(text)) {
    return "spending-summary";
  }
  if (/还剩|预算/.test(text)) {
    return "budget-balance";
  }
  if (
    /目标/.test(text) ||
    (/储蓄/.test(text) && /多少|进度|完成|情况|怎么样|如何|[?？]/.test(text))
  ) {
    return "savings-progress";
  }
  return null;
}

export function inferLedgerClassification(text: string): LedgerClassification {
  if (/收入|工资|兼职|报销/.test(text)) {
    return { type: "收入", category: "收入" };
  }
  if (/存钱|储蓄|存入(?:国库|县库|府库|藩库|官库)/.test(text)) {
    return { type: "储蓄", category: "储蓄" };
  }
  if (/早餐|午餐|晚餐|夜宵|宵夜|饭|餐|奶茶|咖啡|外卖|水果|零食|饮料/.test(text)) {
    return { type: "支出", category: "餐饮" };
  }
  if (/房租|租房|住房|物业|水电/.test(text)) {
    return { type: "支出", category: "住房" };
  }
  if (/看病|医疗|医院|药|挂号/.test(text)) {
    return { type: "支出", category: "医疗" };
  }
  if (/买|购物|衣|日用/.test(text)) {
    return { type: "支出", category: "购物" };
  }
  if (/车|地铁|公交|交通|打车/.test(text)) {
    return { type: "支出", category: "交通" };
  }
  if (/电影|游戏|娱乐|唱歌|演出/.test(text)) {
    return { type: "支出", category: "娱乐" };
  }
  return { type: "支出", category: "其他" };
}

export function calculateUncategorizedExpenseTotal(
  ledger: LedgerLike[],
  knownCategories: readonly string[],
): number {
  return ledger.reduce((sum, item) => {
    if (item.type !== "支出" || knownCategories.includes(item.category)) {
      return sum;
    }
    return sum + item.amount;
  }, 0);
}
