import test from "node:test";
import assert from "node:assert/strict";
import {
  ledgerQueryCapabilities,
  queryLedger,
} from "../lib/ledger-query.ts";

const ledger = [
  {
    id: "today-lunch",
    direction: "支出",
    amount: 32,
    category: "餐饮",
    note: "午饭",
    date: "2026-08-06",
    currency: "CNY",
  },
  {
    id: "today-subway",
    direction: "支出",
    amount: 4,
    category: "交通",
    note: "地铁",
    date: "2026-08-06",
    currency: "CNY",
  },
  {
    id: "yesterday-coffee",
    direction: "支出",
    amount: 18,
    category: "餐饮",
    note: "咖啡",
    date: "2026-08-05",
    currency: "CNY",
  },
  {
    id: "week-delivery",
    direction: "支出",
    amount: 50,
    category: "餐饮",
    note: "美团外卖",
    date: "2026-08-04",
    currency: "CNY",
  },
  {
    id: "week-dinner",
    direction: "支出",
    amount: 120,
    category: "餐饮",
    note: "同学聚餐",
    date: "2026-08-03",
    currency: "CNY",
  },
  {
    id: "month-rent",
    direction: "支出",
    amount: 800,
    category: "住房",
    note: "房租",
    date: "2026-08-02",
    currency: "CNY",
  },
  {
    id: "cycle-game",
    direction: "支出",
    amount: 100,
    category: "娱乐",
    note: "游戏会员",
    date: "2026-07-25",
    currency: "CNY",
  },
  {
    id: "income",
    direction: "收入",
    amount: 3000,
    category: "收入",
    note: "工资到账",
    date: "2026-08-06",
    currency: "CNY",
  },
  {
    id: "krw-lunch",
    direction: "支出",
    amount: 12000,
    category: "餐饮",
    note: "점심",
    date: "2026-08-06",
    currency: "KRW",
  },
];

const baseInput = {
  ledger,
  currency: "CNY",
  today: "2026-08-06",
  cycleStartDate: "2026-07-20",
  cycleEndDate: "2026-08-19",
  safeToSpend: 500.5,
};

test("total-expense queries honor today, yesterday, week, month and cycle scopes", () => {
  const cases = [
    ["今天一共花了多少", "today", "2026-08-06", "2026-08-06", 36, 2],
    ["昨天总支出", "yesterday", "2026-08-05", "2026-08-05", 18, 1],
    ["本周总支出", "week", "2026-08-03", "2026-08-09", 224, 5],
    ["本月花了多少", "month", "2026-08-01", "2026-08-31", 1024, 6],
    ["本周期总支出", "cycle", "2026-07-20", "2026-08-19", 1124, 7],
  ];

  for (const [question, scopeId, startDate, endDate, amount, count] of cases) {
    const result = queryLedger({ ...baseInput, question });
    assert.equal(result.intent, "total-expense");
    assert.deepEqual(
      {
        id: result.scope.id,
        startDate: result.scope.startDate,
        endDate: result.scope.endDate,
      },
      { id: scopeId, startDate, endDate },
    );
    assert.equal(result.matchedAmount, amount);
    assert.equal(result.matchedCount, count);
    assert.equal(result.unsupported, null);
  }
});

test("recent-N-day total queries use natural days through today and never become note searches", () => {
  const aliases = [
    "前三天一共花了多少钱",
    "最近3天一共花了多少钱",
    "近三天消费多少",
    "过去三天一共花了多少钱",
  ];

  for (const question of aliases) {
    const result = queryLedger({ ...baseInput, question });
    assert.equal(result.intent, "total-expense", question);
    assert.deepEqual(
      {
        id: result.scope.id,
        label: result.scope.label,
        startDate: result.scope.startDate,
        endDate: result.scope.endDate,
      },
      {
        id: "recent-days",
        label: "最近3天",
        startDate: "2026-08-04",
        endDate: "2026-08-06",
      },
      question,
    );
    assert.equal(result.matchedAmount, 104, question);
    assert.equal(result.matchedCount, 4, question);
    assert.equal(result.unsupported, null, question);
  }
});

test("recent-N-day queries still filter by currency and expense direction", () => {
  const result = queryLedger({
    ...baseInput,
    currency: "KRW",
    question: "最近3天一共花了多少钱",
  });
  assert.equal(result.intent, "total-expense");
  assert.equal(result.matchedAmount, 12000);
  assert.equal(result.matchedCount, 1);
  assert.match(result.summary, /₩12,000/);
});

test("category query calculates only the requested category in scope", () => {
  const result = queryLedger({
    ...baseInput,
    question: "本周餐饮花了多少",
  });
  assert.equal(result.intent, "category-expense");
  assert.equal(result.matchedAmount, 220);
  assert.equal(result.matchedCount, 4);
  assert.deepEqual(
    result.evidence.map((item) => item.label),
    ["同学聚餐", "美团外卖", "午饭", "咖啡"],
  );
});

test("note keyword query searches notes instead of broad category totals", () => {
  const result = queryLedger({
    ...baseInput,
    question: "本月美团花了多少",
  });
  assert.equal(result.intent, "note-keyword");
  assert.equal(result.matchedAmount, 50);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.evidence[0].label, "美团外卖");
});

test("top-categories returns three calculated category aggregates", () => {
  const result = queryLedger({
    ...baseInput,
    question: "本周期的钱花哪了",
  });
  assert.equal(result.intent, "top-categories");
  assert.equal(result.matchedAmount, 1124);
  assert.deepEqual(
    result.evidence.map(({ label, amount, count }) => ({
      label,
      amount,
      count,
    })),
    [
      { label: "住房", amount: 800, count: 1 },
      { label: "餐饮", amount: 220, count: 4 },
      { label: "娱乐", amount: 100, count: 1 },
    ],
  );
});

test("largest-transactions returns the three actual largest expenses", () => {
  const result = queryLedger({
    ...baseInput,
    question: "本周金额最大的三笔",
  });
  assert.equal(result.intent, "largest-transactions");
  assert.equal(result.matchedAmount, 202);
  assert.equal(result.matchedCount, 3);
  assert.deepEqual(
    result.evidence.map(({ label, amount }) => ({ label, amount })),
    [
      { label: "同学聚餐", amount: 120 },
      { label: "美团外卖", amount: 50 },
      { label: "午饭", amount: 32 },
    ],
  );
});

test("safe-to-spend passes through the caller-provided deterministic value", () => {
  const result = queryLedger({
    ...baseInput,
    question: "我还能花多少",
  });
  assert.equal(result.intent, "safe-to-spend");
  assert.equal(result.matchedAmount, 500.5);
  assert.equal(result.evidence[0].amount, 500.5);
  assert.match(result.summary, /¥500\.5/);
});

test("currency filter prevents CNY and KRW amounts from being mixed", () => {
  const result = queryLedger({
    ...baseInput,
    currency: "KRW",
    question: "今天总支出",
  });
  assert.equal(result.matchedAmount, 12000);
  assert.equal(result.matchedCount, 1);
  assert.match(result.summary, /₩12,000/);
});

test("unsupported intent returns an explicit capability range", () => {
  const result = queryLedger({
    ...baseInput,
    question: "帮我预测下个月会花多少",
  });
  assert.equal(result.intent, "unsupported");
  assert.equal(result.matchedAmount, 0);
  assert.ok(result.unsupported);
  assert.match(result.unsupported.reason, /不做预测/);
  assert.deepEqual(
    result.unsupported.capabilities,
    ledgerQueryCapabilities,
  );
  assert.ok(result.actions.length >= 3);
});

test("empty questions and invalid cycle ranges fail loudly", () => {
  assert.throws(
    () => queryLedger({ ...baseInput, question: "  " }),
    /question must not be empty/,
  );
  assert.throws(
    () =>
      queryLedger({
        ...baseInput,
        question: "本周期总支出",
        cycleStartDate: "2026-08-20",
        cycleEndDate: "2026-08-19",
      }),
    /cycleEndDate must not be before cycleStartDate/,
  );
});
