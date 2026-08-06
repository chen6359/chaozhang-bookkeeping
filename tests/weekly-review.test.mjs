import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeWeeklyReview,
  createWeeklyReviewAction,
  evaluateWeeklyReviewAction,
  getNextWeeklyReviewWeekKey,
} from "../lib/weekly-review.ts";

const week = "week:2026-08-03";
const nextWeek = "week:2026-08-10";

const expense = ({
  amount,
  category,
  date = "2026-08-04",
  expenseClass = "variable",
  currency = "CNY",
}) => ({
  direction: "支出",
  amount,
  category,
  expenseClass,
  currency,
  date,
});

test("周议事在有效核对天数不足时明确返回数据不足", () => {
  const result = analyzeWeeklyReview({
    weekKey: week,
    currency: "CNY",
    validCheckInDays: 2,
    entries: [expense({ amount: 80, category: "餐饮" })],
  });

  assert.equal(result.status, "insufficient-data");
  assert.equal(result.reason, "not-enough-valid-days");
  assert.match(result.message, /至少需要 4 个有效核对日/u);
  assert.equal(result.summary.adjustableExpenseTotal, 80);
});

test("固定支出只进入事实汇总，不会被当成压缩建议", () => {
  const result = analyzeWeeklyReview({
    weekKey: week,
    currency: "CNY",
    validCheckInDays: 4,
    entries: [
      expense({
        amount: 1_800,
        category: "住房",
        expenseClass: "fixed",
      }),
    ],
  });

  assert.equal(result.status, "no-adjustable-issue");
  assert.equal(result.reason, "fixed-expenses-only");
  assert.equal(result.summary.fixedExpenseTotal, 1_800);
  assert.equal(result.summary.adjustableExpenseTotal, 0);
  assert.match(result.message, /不能直接把房租等必要款项作为压缩建议/u);
});

test("固定支出即使金额最高，也只从可调整支出中识别一个关注项", () => {
  const result = analyzeWeeklyReview({
    weekKey: week,
    currency: "CNY",
    validCheckInDays: 5,
    entries: [
      expense({
        amount: 2_000,
        category: "住房",
        expenseClass: "fixed",
      }),
      expense({ amount: 36, category: "餐饮" }),
      expense({ amount: 24, category: "餐饮" }),
      expense({ amount: 40, category: "娱乐" }),
    ],
  });

  assert.equal(result.status, "issue");
  assert.equal(result.issue.category, "餐饮");
  assert.equal(result.issue.reason, "largest-adjustable-category");
  assert.equal(result.issue.actual, 60);
  assert.equal(result.issue.entryCount, 2);
});

test("超过用户参考额的分类优先于金额更高但未超额的分类", () => {
  const result = analyzeWeeklyReview({
    weekKey: week,
    currency: "CNY",
    validCheckInDays: 4,
    entries: [
      expense({ amount: 120, category: "购物" }),
      expense({ amount: 65, category: "餐饮" }),
    ],
    categoryReferences: {
      购物: 150,
      餐饮: 50,
    },
  });

  assert.equal(result.status, "issue");
  assert.equal(result.issue.category, "餐饮");
  assert.equal(result.issue.reason, "reference-exceeded");
  assert.equal(result.issue.referenceTarget, 50);
  assert.equal(result.issue.actual, 65);
  assert.equal(result.issue.overBy, 15);
});

test("分析只读取目标周和目标币种，不进行跨币种合计", () => {
  const result = analyzeWeeklyReview({
    weekKey: week,
    currency: "KRW",
    validCheckInDays: 4,
    entries: [
      expense({ amount: 12_000, category: "餐饮", currency: "KRW" }),
      expense({ amount: 500, category: "购物", currency: "CNY" }),
      expense({
        amount: 30_000,
        category: "娱乐",
        currency: "KRW",
        date: "2026-08-11",
      }),
    ],
  });

  assert.equal(result.status, "issue");
  assert.equal(result.currency, "KRW");
  assert.equal(result.issue.category, "餐饮");
  assert.equal(result.summary.expenseTotal, 12_000);
});

test("没有支出但核对充分时返回无需调整，而不是伪造问题", () => {
  const result = analyzeWeeklyReview({
    weekKey: week,
    currency: "CNY",
    validCheckInDays: 4,
    entries: [],
  });

  assert.equal(result.status, "no-adjustable-issue");
  assert.equal(result.reason, "no-expense");
});

test("分类参考行动包含生效周、状态、目标和币种", () => {
  const action = createWeeklyReviewAction({
    kind: "category-reference",
    decidedWeek: week,
    currency: "CNY",
    category: "餐饮",
    targetAmount: 240,
  });

  assert.deepEqual(action, {
    kind: "category-reference",
    decidedWeek: week,
    effectiveWeek: nextWeek,
    status: "scheduled",
    currency: "CNY",
    target: {
      category: "餐饮",
      amount: 240,
      scope: "variable-expense",
    },
  });
});

test("观察行动没有金额目标，也不会伪造提醒功能", () => {
  const action = createWeeklyReviewAction({
    kind: "observe",
    decidedWeek: week,
    currency: "KRW",
  });

  assert.equal(action.kind, "observe");
  assert.equal(action.effectiveWeek, nextWeek);
  assert.equal(action.status, "scheduled");
  assert.equal(action.currency, "KRW");
  assert.equal(action.target, null);
  assert.equal("reminder" in action, false);
});

test("上一周分类参考额可与本周可调整实际支出比较并返回达成", () => {
  const action = createWeeklyReviewAction({
    kind: "category-reference",
    decidedWeek: week,
    currency: "CNY",
    category: "餐饮",
    targetAmount: 100,
  });
  const result = evaluateWeeklyReviewAction({
    action,
    weekKey: nextWeek,
    validCheckInDays: 5,
    entries: [
      expense({ amount: 42.5, category: "餐饮", date: "2026-08-11" }),
      expense({ amount: 37.5, category: "餐饮", date: "2026-08-12" }),
      expense({
        amount: 500,
        category: "餐饮",
        date: "2026-08-13",
        expenseClass: "fixed",
      }),
      expense({
        amount: 20_000,
        category: "餐饮",
        date: "2026-08-13",
        currency: "KRW",
      }),
    ],
  });

  assert.equal(result.outcome, "achieved");
  assert.equal(result.target, 100);
  assert.equal(result.actual, 80);
  assert.equal(result.variance, -20);
  assert.equal(result.remaining, 20);
  assert.equal(result.exceededBy, 0);
  assert.equal(result.action.status, "completed");
});

test("上一周分类参考额可与本周实际支出比较并返回超出", () => {
  const action = createWeeklyReviewAction({
    kind: "category-reference",
    decidedWeek: week,
    currency: "KRW",
    category: "餐饮",
    targetAmount: 60_000,
  });
  const result = evaluateWeeklyReviewAction({
    action,
    weekKey: nextWeek,
    validCheckInDays: 4,
    entries: [
      expense({
        amount: 35_000,
        category: "餐饮",
        date: "2026-08-10",
        currency: "KRW",
      }),
      expense({
        amount: 30_000,
        category: "餐饮",
        date: "2026-08-15",
        currency: "KRW",
      }),
    ],
  });

  assert.equal(result.outcome, "exceeded");
  assert.equal(result.actual, 65_000);
  assert.equal(result.target, 60_000);
  assert.equal(result.variance, 5_000);
  assert.equal(result.exceededBy, 5_000);
  assert.equal(result.remaining, 0);
});

test("行动结算在数据不足时不冒充达成或超出", () => {
  const action = createWeeklyReviewAction({
    kind: "category-reference",
    decidedWeek: week,
    currency: "CNY",
    category: "娱乐",
    targetAmount: 80,
  });
  const result = evaluateWeeklyReviewAction({
    action,
    weekKey: nextWeek,
    validCheckInDays: 2,
    entries: [
      expense({ amount: 60, category: "娱乐", date: "2026-08-11" }),
    ],
  });

  assert.equal(result.outcome, "insufficient-data");
  assert.equal(result.reason, "not-enough-valid-days");
  assert.equal(result.action.status, "scheduled");
});

test("不能拿错误周次的数据提前或延后结算行动", () => {
  const action = createWeeklyReviewAction({
    kind: "observe",
    decidedWeek: week,
    currency: "CNY",
  });
  const result = evaluateWeeklyReviewAction({
    action,
    weekKey: "week:2026-08-17",
    validCheckInDays: 4,
    entries: [],
  });

  assert.equal(result.outcome, "not-due");
  assert.equal(result.reason, "week-mismatch");
  assert.equal(result.action.status, "scheduled");
});

test("观察行动在有效周结束后完成，但不会产生虚构金额结果", () => {
  const action = createWeeklyReviewAction({
    kind: "observe",
    decidedWeek: week,
    currency: "CNY",
  });
  const result = evaluateWeeklyReviewAction({
    action,
    weekKey: nextWeek,
    validCheckInDays: 4,
    entries: [],
  });

  assert.equal(result.outcome, "observed");
  assert.equal(result.action.status, "completed");
  assert.equal("actual" in result, false);
});

test("周次工具按七天推进，金额精度遵守币种规则", () => {
  assert.equal(getNextWeeklyReviewWeekKey(week), nextWeek);
  assert.throws(
    () =>
      createWeeklyReviewAction({
        kind: "category-reference",
        decidedWeek: week,
        currency: "KRW",
        category: "餐饮",
        targetAmount: 12.5,
      }),
    /unsupported precision/u,
  );
});
