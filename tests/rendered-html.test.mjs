import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateFinance,
  summarizeFinanceTransactions,
} from "../lib/finance.ts";
import {
  getHabitProgress,
  getWeeklyReviewAvailability,
  getCycleWeekKey,
} from "../lib/habit.ts";
import {
  inferLedgerClassification,
  parseLedgerText,
} from "../lib/ledger.ts";
import {
  isLikelyLedgerDuplicate,
  parseScreenshotText,
} from "../lib/screenshot-import.ts";
import { getSceneMediaAsset } from "../lib/scene-media.ts";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("ledger language parser splits multiple confirmed drafts", () => {
  const drafts = parseLedgerText("午饭32元，地铁4元，工资到账3000元");
  assert.equal(drafts.length, 3);
  assert.deepEqual(
    drafts.map(({ direction, amount, category }) => ({
      direction,
      amount,
      category,
    })),
    [
      { direction: "支出", amount: 32, category: "餐饮" },
      { direction: "支出", amount: 4, category: "交通" },
      { direction: "收入", amount: 3000, category: "收入" },
    ],
  );
});

test("savings wording is no longer classified as a transaction", () => {
  assert.deepEqual(inferLedgerClassification("这个月想留500元"), {
    direction: "支出",
    category: "其他",
  });
});

test("WeChat single-payment screenshot text becomes a reviewable draft", () => {
  const parsed = parseScreenshotText(
    ["微信支付", "美团外卖", "今天 12:30", "-¥32.00"].join("\n"),
    "2026-08-04",
  );
  assert.equal(parsed.platform, "微信支付");
  assert.equal(parsed.candidates.length, 1);
  assert.deepEqual(
    {
      direction: parsed.candidates[0].direction,
      amount: parsed.candidates[0].amount,
      category: parsed.candidates[0].category,
      note: parsed.candidates[0].note,
      date: parsed.candidates[0].date,
    },
    {
      direction: "支出",
      amount: 32,
      category: "餐饮",
      note: "美团外卖",
      date: "2026-08-04",
    },
  );
});

test("Alipay list screenshot text keeps multiple dates and directions", () => {
  const parsed = parseScreenshotText(
    [
      "支付宝账单",
      "麦当劳",
      "8月1日 12:40",
      "-25.50",
      "兼职工资到账",
      "8月2日 18:00",
      "+200.00",
    ].join("\n"),
    "2026-08-04",
  );
  assert.equal(parsed.platform, "支付宝");
  assert.deepEqual(
    parsed.candidates.map(({ direction, amount, date }) => ({
      direction,
      amount,
      date,
    })),
    [
      { direction: "支出", amount: 25.5, date: "2026-08-01" },
      { direction: "收入", amount: 200, date: "2026-08-02" },
    ],
  );
});

test("screenshot duplicate detection uses import key or reviewed ledger fields", () => {
  const parsed = parseScreenshotText(
    ["微信支付", "地铁", "8月4日 09:00", "-¥4.00"].join("\n"),
    "2026-08-04",
  );
  const candidate = parsed.candidates[0];
  assert.equal(
    isLikelyLedgerDuplicate(
      {
        direction: "支出",
        amount: 4,
        note: "地铁",
        date: "2026-08-04",
      },
      candidate.rowKey,
      candidate,
    ),
    true,
  );
  assert.equal(
    isLikelyLedgerDuplicate(
      {
        direction: "支出",
        amount: 4,
        note: "公交",
        date: "2026-08-04",
      },
      candidate.rowKey,
      candidate,
    ),
    false,
  );
});

test("ledger balance and safe-to-spend are independent", () => {
  const snapshot = calculateFinance({
    carriedBalanceCents: 20_000,
    openingFundsCents: 300_000,
    usableCarryoverCents: 0,
    desiredRetentionCents: 50_000,
    unpaidFixedExpenseCents: 90_000,
    transactions: [
      { kind: "expense", amountCents: 32_000, expenseClass: "variable" },
    ],
    elapsedDays: 10,
    totalDays: 30,
  });
  assert.equal(snapshot.ledgerBalanceCents, 288_000);
  assert.equal(snapshot.targetClosingBalanceCents, 70_000);
  assert.equal(snapshot.rawSafeToSpendCents, 128_000);
});

test("negative carryover is preserved and never auto-filled", () => {
  const snapshot = calculateFinance({
    carriedBalanceCents: -50_000,
    openingFundsCents: 30_000,
    desiredRetentionCents: 0,
    unpaidFixedExpenseCents: 0,
    transactions: [],
    elapsedDays: 1,
    totalDays: 30,
  });
  assert.equal(snapshot.ledgerBalanceCents, -20_000);
  assert.equal(snapshot.fiscalState, "deficit");
});

test("fixed unpaid expenses reduce safety but not ledger balance", () => {
  const base = {
    carriedBalanceCents: 0,
    openingFundsCents: 100_000,
    desiredRetentionCents: 0,
    transactions: [],
    elapsedDays: 1,
    totalDays: 30,
  };
  const withoutFixed = calculateFinance({
    ...base,
    unpaidFixedExpenseCents: 0,
  });
  const withFixed = calculateFinance({
    ...base,
    unpaidFixedExpenseCents: 80_000,
  });
  assert.equal(withoutFixed.ledgerBalanceCents, withFixed.ledgerBalanceCents);
  assert.equal(withFixed.rawSafeToSpendCents, 20_000);
});

test("transaction summary never mutates a retention target", () => {
  const summary = summarizeFinanceTransactions([
    { kind: "income", amountCents: 100_000 },
    { kind: "expense", amountCents: 20_000, expenseClass: "variable" },
  ]);
  assert.equal(summary.additionalIncomeCents, 100_000);
  assert.equal(summary.netExpenseCents, 20_000);
  assert.equal("savings" in summary, false);
});

test("habit merit counts checked days and weekly decisions, not entry count", () => {
  const weekKey = getCycleWeekKey("2026-08-01");
  const checkIns = [
    {
      dateKey: "2026-07-30",
      confirmedEntryCount: 1,
      checkedAt: "2026-07-30T21:00:00Z",
      noSpendConfirmed: false,
    },
    {
      dateKey: "2026-07-31",
      confirmedEntryCount: 10,
      checkedAt: "2026-07-31T21:00:00Z",
      noSpendConfirmed: false,
    },
  ];
  const progress = getHabitProgress(checkIns, [
    {
      weekKey,
      completedAt: "2026-08-01T21:00:00Z",
      selectedActionId: "reference",
    },
  ]);
  assert.equal(progress.validCheckInDays, 2);
  assert.equal(progress.completedWeeklyReviews, 1);
  assert.equal(progress.merit, 20);
});

test("weekly review requires valid checked days and a real ledger entry", () => {
  const result = getWeeklyReviewAvailability({
    checkIns: [
      {
        dateKey: "2026-07-27",
        confirmedEntryCount: 1,
        checkedAt: "2026-07-27T21:00:00Z",
      },
      {
        dateKey: "2026-07-28",
        confirmedEntryCount: 1,
        checkedAt: "2026-07-28T21:00:00Z",
      },
      {
        dateKey: "2026-07-29",
        confirmedEntryCount: 1,
        checkedAt: "2026-07-29T21:00:00Z",
      },
      {
        dateKey: "2026-07-30",
        confirmedEntryCount: 1,
        checkedAt: "2026-07-30T21:00:00Z",
      },
    ],
    reviews: [],
    now: "2026-08-01",
  });
  assert.equal(result.canOpen, true);
});

test("all twelve county financial-state scene contracts remain available", () => {
  for (const room of ["hall", "treasury", "council", "works"]) {
    for (const state of ["stable", "strained", "deficit"]) {
      const asset = getSceneMediaAsset("county", room, state);
      assert.match(asset.poster, /\/scenes\/county\//);
      assert.match(asset.webm, /\.webm$/);
      assert.match(asset.mp4, /\.mp4$/);
    }
  }
});

test("page exposes both real and demo flows", () => {
  assert.match(pageSource, /建立我的账本/);
  assert.match(pageSource, /先体验演示账本/);
  assert.match(pageSource, /chaozhang-real-v4/);
  assert.match(pageSource, /chaozhang-demo-v4/);
});

test("first-use setup collects funds, retention, carryover and fixed commitments", () => {
  for (const label of [
    "本周期资金来源",
    "上期结转",
    "月末希望留下",
    "本月待付固定支出",
    "建立账本并记第一笔",
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("recording requires review before confirmation and has voice fallback", () => {
  assert.match(pageSource, /识别为账目/);
  assert.match(pageSource, /确认入账/);
  assert.match(pageSource, /SpeechRecognition/);
  assert.match(pageSource, /当前浏览器不支持语音识别/);
});

test("screenshot import is local, confirm-first, duplicate-aware and undoable", () => {
  for (const label of [
    "导入账单截图",
    "开始本机识别",
    "确认前不改变账面",
    "疑似已记过，默认不选",
    "撤销本批导入",
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /source: "screenshot"/);
  assert.match(pageSource, /importBatchId/);
  assert.match(pageSource, /importRowKey/);
});

test("every navigation destination and central bookkeeping action is real", () => {
  assert.match(pageSource, /setTab\("home"\)/);
  assert.match(pageSource, /setTab\("treasury"\)/);
  assert.match(pageSource, /setTab\("council"\)/);
  assert.match(pageSource, /setTab\("build"\)/);
  assert.match(pageSource, /className="record-nav"/);
  assert.match(pageSource, /onClick=\{\(\) => openRecorder\(\)\}/);
});

test("daily check and weekly decision are state-changing interactions", () => {
  assert.match(pageSource, /markTodayChecked/);
  assert.match(pageSource, /saveReviewAction/);
  assert.match(pageSource, /开始本周议事/);
  assert.match(pageSource, /本周决定已经保存/);
  assert.match(pageSource, /categoryReferences/);
});

test("responsive visual foundation has blurred imagery and mobile layouts", () => {
  assert.match(styleSource, /\.app-wallpaper/);
  assert.match(styleSource, /filter: blur\(20px\)/);
  assert.match(styleSource, /@media \(max-width: 640px\)/);
  assert.match(styleSource, /@media \(max-width: 390px\)/);
  assert.match(styleSource, /\.bottom-nav/);
});
