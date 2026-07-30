"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateFinance,
  calculateRecoverySavings,
  type FiscalState,
} from "../lib/finance";
import {
  getDemoGuideStep,
  shouldCompleteDemoRecovery,
} from "../lib/guide";
import {
  calculateUncategorizedExpenseTotal,
  inferLedgerClassification,
  inferLedgerQuestionIntent,
} from "../lib/ledger";
import { getCourtAddress, getCourtVocabulary } from "../lib/court";
import {
  getCouncilAvailability,
  getCouncilCadenceLabel,
  getCouncilPeriodKey,
  type CouncilCadence,
} from "../lib/council";
import {
  MAX_NEXT_CYCLE_REFERENCE,
  parseNextCycleReferenceAmount,
} from "../lib/reference";
import { getNpcPortraitAsset } from "../lib/characters";
import { getSceneMediaAsset } from "../lib/scene-media";
import { SceneMedia } from "../components/SceneMedia";
import { CouncilNovelStage } from "../components/CouncilNovelStage";
import { RoomActivityLayer } from "../components/RoomActivityLayer";
import {
  getFiscalStateCopy,
  getNextRank,
  getRankConfig,
  getRankDisplayName,
  getRankIndex,
  getRankPortraitAsset,
  getRoomConfig,
  rankConfigs,
  type CharacterGender,
  type RankKey,
  type RoomKey,
} from "../lib/world";

type Mode = "real" | "demo";
type TabKey = "home" | "treasury" | "council" | "build";
type RecordPurpose = "general" | "demo-recovery";
type LedgerType = "支出" | "收入" | "储蓄";
type BudgetKey = "餐饮" | "住房" | "交通" | "医疗" | "购物" | "娱乐";
type Budget = {
  limit: number;
  used: number;
  bureau: string;
};

type NextCycleReference = {
  category: BudgetKey;
  amount: number;
  updatedAt: string;
  source: "risk" | "council";
};

type LedgerItem = {
  id: string;
  type: LedgerType;
  amount: number;
  category: string;
  note: string;
  date: string;
};

type Profile = {
  name: string;
  presentation: string;
  address: string;
  cycle: string;
  income: number;
  disposable: number;
  treasuryBase: number;
  savingsName: string;
  savingsTarget: number;
  savingsDeadline: string;
  rank: string;
  merit: number;
  scene: string;
  onboarded: boolean;
};

type PrototypeState = {
  profile: Profile;
  budgets: Record<BudgetKey, Budget>;
  ledger: LedgerItem[];
  riskTriggered: boolean;
  councilDone: boolean;
  councilDecision: string;
  councilLedgerCount: number;
  councilRound: number;
  councilCadence: CouncilCadence;
  lastCouncilCompletedAt: string;
  councilStep: number;
  demoRecoveryDone: boolean;
  nextCycleReferences: Partial<Record<BudgetKey, NextCycleReference>>;
};

type PendingEntry = {
  id?: string;
  type: LedgerType;
  amount: number;
  category: string;
  note: string;
  date: string;
};

type NpcMood =
  | "neutral"
  | "success"
  | "warning"
  | "alarm"
  | "council"
  | "recovery";

type FeedbackRole = {
  mark: string;
  kind: "comic" | "advisor" | "companion";
  name: string;
  tone: string;
  line: string;
  mood?: NpcMood;
};

type FeedbackState = {
  title: string;
  fact: string;
  cast: FeedbackRole[];
  buttonLabel?: string;
  nextTab?: TabKey;
};

type RecoveryEvent = {
  before: number;
  after: number;
  finalState: FiscalState;
};

const councilStageLabels = [
  "开议",
  "财政汇报",
  "异常",
  "三人谏言",
  "调阅支出",
  "调整草案",
  "政绩结算",
  "散会备忘",
] as const;

const realStorageKey = "chaozhang-real-v2";
const demoStorageKey = "chaozhang-demo-v3";

const budgetOrder: BudgetKey[] = ["餐饮", "住房", "交通", "医疗", "购物", "娱乐"];
const isBudgetKey = (category: string): category is BudgetKey =>
  budgetOrder.includes(category as BudgetKey);
const normalizeExpenseCategory = (category: string): BudgetKey | "其他" =>
  isBudgetKey(category) ? category : "其他";

const blankBudgets = (): Record<BudgetKey, Budget> => ({
  餐饮: { limit: 1200, used: 0, bureau: "膳食房" },
  住房: { limit: 3500, used: 0, bureau: "营造司" },
  交通: { limit: 600, used: 0, bureau: "车马司" },
  医疗: { limit: 500, used: 0, bureau: "县署医房" },
  购物: { limit: 1200, used: 0, bureau: "采买司" },
  娱乐: { limit: 1000, used: 0, bureau: "百戏坊" },
});

const createBlankRealState = (): PrototypeState => ({
  profile: {
    name: "未命名大人",
    presentation: "暂不设置",
    address: "大人",
    cycle: "自然月",
    income: 10000,
    disposable: 8000,
    treasuryBase: 2000,
    savingsName: "我的第一个目标",
    savingsTarget: 12000,
    savingsDeadline: "2027-06-30",
    rank: "从九品县令",
    merit: 0,
    scene: "初任县衙",
    onboarded: false,
  },
  budgets: blankBudgets(),
  ledger: [],
  riskTriggered: false,
  councilDone: false,
  councilDecision: "",
  councilLedgerCount: 0,
  councilRound: 0,
  councilCadence: "weekly",
  lastCouncilCompletedAt: "",
  councilStep: 0,
  demoRecoveryDone: false,
  nextCycleReferences: {},
});

const createDemoState = (): PrototypeState => ({
  profile: {
    name: "小林",
    presentation: "女性",
    address: "大人",
    cycle: "每月1日至月底",
    income: 2005,
    disposable: 2000,
    treasuryBase: 5,
    savingsName: "毕业旅行",
    savingsTarget: 1200,
    savingsDeadline: "2026-12-31",
    rank: "从九品县令",
    merit: 42,
    scene: "初任县衙",
    onboarded: true,
  },
  budgets: {
    餐饮: { limit: 900, used: 792, bureau: "膳食房" },
    住房: { limit: 800, used: 800, bureau: "营造司" },
    交通: { limit: 120, used: 120, bureau: "车马司" },
    医疗: { limit: 80, used: 80, bureau: "县署医房" },
    购物: { limit: 70, used: 70, bureau: "采买司" },
    娱乐: { limit: 30, used: 30, bureau: "百戏坊" },
  },
  ledger: [
    { id: "demo-1", type: "支出", amount: 68, category: "餐饮", note: "同学聚餐", date: "7月16日" },
    { id: "demo-2", type: "支出", amount: 800, category: "住房", note: "本月房租", date: "7月15日" },
    { id: "demo-3", type: "支出", amount: 70, category: "购物", note: "生活用品", date: "7月14日" },
    { id: "demo-4", type: "储蓄", amount: 100, category: "储蓄", note: "毕业旅行", date: "7月13日" },
  ],
  riskTriggered: false,
  councilDone: false,
  councilDecision: "",
  councilLedgerCount: 0,
  councilRound: 0,
  councilCadence: "weekly",
  lastCouncilCompletedAt: "",
  councilStep: 0,
  demoRecoveryDone: false,
  nextCycleReferences: {},
});

const hydratePrototypeState = (candidate: PrototypeState): PrototypeState => {
  const uncategorizedExpense = calculateUncategorizedExpenseTotal(
    candidate.ledger,
    budgetOrder,
  );
  const totalExpense =
    budgetOrder.reduce((sum, key) => sum + candidate.budgets[key].used, 0) +
    uncategorizedExpense;
  const { treasuryBalance } = calculateFinance(
    candidate.profile.treasuryBase,
    totalExpense,
    candidate.profile.disposable,
  );
  const legacyRecoveryCompleted =
    treasuryBalance >= 0 &&
    candidate.ledger.some(
      (item) =>
        item.type === "储蓄" &&
        (item.note.includes("修缮府邸") || item.note.includes("修缮县衙")),
    );
  const nextCycleReferences = Object.fromEntries(
    Object.entries(candidate.nextCycleReferences ?? {}).filter(
      ([category, reference]) =>
        budgetOrder.includes(category as BudgetKey) &&
        reference &&
        Number.isSafeInteger(reference.amount) &&
        reference.amount > 0 &&
        reference.amount <= MAX_NEXT_CYCLE_REFERENCE,
    ),
  ) as Partial<Record<BudgetKey, NextCycleReference>>;

  return {
    ...candidate,
    councilLedgerCount: candidate.councilLedgerCount ?? 0,
    councilRound: candidate.councilRound ?? (candidate.councilDone ? 1 : 0),
    councilCadence:
      candidate.councilCadence === "daily" ? "daily" : "weekly",
    lastCouncilCompletedAt:
      candidate.lastCouncilCompletedAt ??
      (candidate.councilDone ? new Date().toISOString() : ""),
    councilStep:
      candidate.councilDone
        ? 0
        : Math.max(0, Math.min(7, Number(candidate.councilStep) || 0)),
    demoRecoveryDone:
      candidate.demoRecoveryDone ?? legacyRecoveryCompleted,
    nextCycleReferences,
  };
};

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(amount);

const safePercent = (used: number, limit: number) =>
  Math.max(0, Math.min(100, Math.round((used / Math.max(limit, 1)) * 100)));

const todayLabel = () =>
  new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date());

const getCourtRoles = (rank: string, presentation: string) => {
  const partnerIsMale = presentation === "女性";
  const rankKey = getRankConfig(rank).key;
  if (rankKey === "emperor") {
    return {
      comic: "御前太监",
      advisor: "户部尚书",
      companion: partnerIsMale ? "皇夫" : "皇后",
      council: "御前议政",
    };
  }
  if (rankKey === "regent") {
    return {
      comic: "内侍总管",
      advisor: "首辅",
      companion: partnerIsMale ? "王夫" : "王妃",
      council: "政事堂议事",
    };
  }
  if (rankKey === "governor") {
    return {
      comic: "巡抚亲随",
      advisor: "布政使",
      companion: partnerIsMale ? "随行夫君" : "随行夫人",
      council: "督府议事",
    };
  }
  if (rankKey === "prefecture") {
    return {
      comic: "府衙管事",
      advisor: "通判",
      companion: partnerIsMale ? "随行夫君" : "随行夫人",
      council: "州府朝会",
    };
  }
  return {
    comic: "钱粮小吏",
    advisor: "师爷",
    companion: partnerIsMale ? "夫君" : "夫人",
    council: "县署朝会",
  };
};

const getCharacterGender = (presentation: string): CharacterGender =>
  presentation === "女性" ? "female" : "male";

const rankMeritThresholds: Record<RankKey, number> = {
  county: 0,
  prefecture: 50,
  governor: 160,
  regent: 320,
  emperor: 560,
};

const getRankForMerit = (
  merit: number,
  gender: CharacterGender,
): string => {
  const eligible = [...rankConfigs]
    .reverse()
    .find((config) => merit >= rankMeritThresholds[config.key]) ?? rankConfigs[0];
  return getRankDisplayName(eligible.key, gender);
};

function RankPortrait({
  rank,
  presentation,
  fiscalState = "stable",
  compact = false,
  label,
}: {
  rank: string;
  presentation: string;
  fiscalState?: FiscalState;
  compact?: boolean;
  label?: string;
}) {
  const gender = getCharacterGender(presentation);
  const portrait = getRankPortraitAsset(rank, gender, fiscalState);
  const displayName = getRankDisplayName(rank, gender);
  const accessibleLabel = label ?? `${displayName}人物立绘`;
  return (
    <span
      className={`rank-portrait ${compact ? "compact" : ""}`}
      data-fiscal-state={portrait.fiscalState}
      role="img"
      aria-label={accessibleLabel}
    >
      <img src={portrait.src} alt="" draggable={false} />
      <span className="sr-only">{accessibleLabel}</span>
    </span>
  );
}

function NpcPortrait({
  kind,
  name,
  rank = "从九品县令",
  presentation = "暂不设置",
  compact = false,
  mood = "neutral",
}: {
  kind: FeedbackRole["kind"];
  name: string;
  rank?: string;
  presentation?: string;
  compact?: boolean;
  mood?: NpcMood;
}) {
  const asset = getNpcPortraitAsset(
    kind,
    rank,
    presentation,
    mood,
  );
  return (
    <span
      className={`npc-portrait npc-${kind} npc-mood-${mood} ${compact ? "compact" : ""}`}
      data-mood={mood}
      data-asset-mood={asset.assetMood}
      data-rank={asset.rankKey}
      data-character-id={asset.characterId}
      data-character-family={asset.route}
      role="img"
      aria-label={`${name}（${asset.identity}）角色立绘`}
    >
      <img src={asset.src} alt="" draggable={false} />
      <span className="sr-only">{name}</span>
    </span>
  );
}

function PromotionEdict({
  rank,
  presentation,
}: {
  rank: string;
  presentation: string;
}) {
  const rankConfig = getRankConfig(rank);
  const rankName = getRankDisplayName(
    rankConfig.key,
    getCharacterGender(presentation),
  );
  const rooms = [
    ["大堂", rankConfig.rooms.hall.name],
    ["库房", rankConfig.rooms.treasury.name],
    ["议事", rankConfig.rooms.council.name],
    ["营造", rankConfig.rooms.works.name],
  ] as const;

  return (
    <article className="promotion-edict" data-testid="promotion-edict">
      <header className="promotion-edict-heading">
        <span className="edict-kicker">晋升诏书</span>
        <span className="edict-opening">制曰</span>
        <h2 className="edict-title" id="promotion-title">
          授{rankName}，移治{rankConfig.residenceName}
        </h2>
      </header>
      <p className="edict-copy">
        汝能核清钱粮、明定用度，又肯据实听议，政绩已足。今授
        <strong className="edict-rank">{rankName}</strong>
        ，自此入治
        <strong>{rankConfig.residenceName}</strong>
        ，掌其仓廪、议政与营造诸事。
      </p>
      <dl className="promotion-edict-rooms" aria-label="新官署四处空间">
        {rooms.map(([label, name]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{name}</dd>
          </div>
        ))}
      </dl>
      <footer className="promotion-edict-footer">
        <span>钦此</span>
        <span className="edict-seal" aria-label="朝账官印">
          朝账
          <br />
          之印
        </span>
      </footer>
    </article>
  );
}

function ModeChooser({ onChoose }: { onChoose: (mode: Mode) => void }) {
  return (
    <main className="entry-screen">
      <section className="entry-card" aria-labelledby="entry-title">
        <div className="wire-badge">从九品县令开始</div>
        <p className="eyebrow">朝账 · 架空王朝记账</p>
        <h1 id="entry-title">从一座小县衙开始，治理你的真实收支</h1>
        <p className="entry-lead">
          直接建立自己的账本，或者先用一段虚构账目体验玩法。
        </p>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => onChoose("real")} data-testid="choose-real">
            <span className="mode-index">01</span>
            <strong>进入我的账本</strong>
            <span>使用自己输入的真实账目，按真实周期积累政绩。</span>
            <em>本地保存 · 不连接银行卡 · 不保管资金</em>
          </button>
          <button className="mode-card featured" onClick={() => onChoose("demo")} data-testid="choose-demo">
            <span className="mode-index">02</span>
            <strong>体验完整演示</strong>
            <span>使用虚构样例数据，几分钟体验亏空、朝会与修复。</span>
            <em>可随时重置 · 不会写入真实账本</em>
          </button>
        </div>
        <p className="boundary-note">
          朝账只记录你的收支计划，不连接银行卡，也不会保管或划转真实资金。
        </p>
      </section>
    </main>
  );
}

function Onboarding({
  onFinish,
  onExit,
}: {
  onFinish: (state: PrototypeState) => void;
  onExit: () => void;
}) {
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    name: "",
    presentation: "暂不设置",
    address: "大人",
    customAddress: "",
    cycle: "自然月",
    income: "10000",
    disposable: "8000",
    initialSavings: "2000",
    food: "1200",
    housing: "3500",
    transport: "600",
    medical: "500",
    shopping: "1200",
    entertainment: "1000",
    savingsName: "毕业旅行",
    savingsTarget: "12000",
    savingsDeadline: "2027-06-30",
    scene: "县学藏书阁",
  });

  const allocatedBudget = ["food", "housing", "transport", "medical", "shopping", "entertainment"].reduce(
    (sum, key) => sum + (Number(form[key as keyof typeof form]) || 0),
    0,
  );
  const income = Number(form.income) || 0;
  const disposable = Number(form.disposable) || 0;
  const initialSavings = Number(form.initialSavings) || 0;
  const allocatedIncome = disposable + initialSavings;

  const goNext = () => {
    setFormError("");
    if (step === 1) {
      if (income <= 0 || disposable < 0 || initialSavings < 0) {
        setFormError("收入必须大于0，消费池和初始县库不能为负数。");
        return;
      }
      if (allocatedIncome !== income) {
        setFormError("请把本周期收入完整分配到消费池和县库，两项合计需等于收入。");
        return;
      }
    }
    if (step === 2 && allocatedBudget !== disposable) {
      setFormError("六类消费预算合计需要等于消费池金额，请继续分配。");
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  };

  const finish = () => {
    setFormError("");
    if ((Number(form.savingsTarget) || 0) <= 0) {
      setFormError("请填写大于0的储蓄目标金额。");
      return;
    }
    const state = createBlankRealState();
    state.profile = {
      ...state.profile,
      name: form.name || "未命名大人",
      presentation: form.presentation,
      address:
        form.address === "自定义称呼"
          ? form.customAddress.trim() || "大人"
          : form.address || "大人",
      cycle: form.cycle,
      income,
      disposable: Number(form.disposable) || 0,
      treasuryBase: initialSavings,
      savingsName: form.savingsName || "我的储蓄目标",
      savingsTarget: Number(form.savingsTarget) || 0,
      savingsDeadline: form.savingsDeadline,
      scene: "初任县衙",
      onboarded: true,
    };
    state.budgets = {
      餐饮: { limit: Number(form.food) || 0, used: 0, bureau: "膳食房" },
      住房: { limit: Number(form.housing) || 0, used: 0, bureau: "营造司" },
      交通: { limit: Number(form.transport) || 0, used: 0, bureau: "车马司" },
      医疗: { limit: Number(form.medical) || 0, used: 0, bureau: "县署医房" },
      购物: { limit: Number(form.shopping) || 0, used: 0, bureau: "采买司" },
      娱乐: { limit: Number(form.entertainment) || 0, used: 0, bureau: "百戏坊" },
    };
    onFinish(state);
  };

  return (
    <main className="onboarding">
      <section className="wizard-card">
        <div className="wizard-topline">
          <button className="text-button" onClick={onExit}>← 返回模式选择</button>
          <span>设置进度 {step + 1}/4</span>
        </div>
        <div className="stepper" aria-label="首次设置进度">
          {[0, 1, 2, 3].map((value) => (
            <span key={value} className={value <= step ? "active" : ""} />
          ))}
        </div>

        {step === 0 && (
          <div className="wizard-content">
            <p className="eyebrow">第一步 · 创建身份</p>
            <h1>你以什么身份赴任？</h1>
            <p className="helper">先设置本账本使用的称呼和形象偏好。</p>
            <label>
              角色名
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="例如：林大人"
              />
            </label>
            <fieldset>
              <legend>形象表达</legend>
              <div className="choice-row">
                {["男性", "女性", "中性", "暂不设置"].map((value) => (
                  <label className="radio-card" key={value}>
                    <input
                      type="radio"
                      name="presentation"
                      value={value}
                      checked={form.presentation === value}
                      onChange={() => setForm({ ...form, presentation: value })}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              日常称呼
              <select
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              >
                <option>大人</option>
                <option>阁下</option>
                <option>自定义称呼</option>
              </select>
            </label>
            {form.address === "自定义称呼" && (
              <label>
                输入你的称呼
                <input
                  value={form.customAddress}
                  onChange={(event) =>
                    setForm({ ...form, customAddress: event.target.value })
                  }
                  placeholder="例如：殿下、主上、阿林"
                  autoFocus
                />
              </label>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="wizard-content">
            <p className="eyebrow">第二步 · 分配本周期收入</p>
            <h1>消费多少，留入县库多少？</h1>
            <p className="helper">这只是记账分配，不会从银行卡转入或保管真实资金。</p>
            <label>
              财政周期
              <select
                value={form.cycle}
                onChange={(event) => setForm({ ...form, cycle: event.target.value })}
              >
                <option>自然月</option>
                <option>生活费到账日至下次到账日</option>
                <option>发薪日至下次发薪日</option>
                <option>先从今天开始</option>
              </select>
            </label>
            <label>
              本周期收入 / 生活费
              <span className="input-with-prefix"><b>¥</b><input
                inputMode="decimal"
                value={form.income}
                onChange={(event) => setForm({ ...form, income: event.target.value })}
              /></span>
            </label>
            <div className="budget-input-grid">
              <label>
                消费池
                <span className="input-with-prefix"><b>¥</b><input
                  inputMode="decimal"
                  value={form.disposable}
                  onChange={(event) => setForm({ ...form, disposable: event.target.value })}
                /></span>
              </label>
              <label>
                初始进入县库
                <span className="input-with-prefix"><b>¥</b><input
                  inputMode="decimal"
                  value={form.initialSavings}
                  onChange={(event) => setForm({ ...form, initialSavings: event.target.value })}
                /></span>
              </label>
            </div>
            <div className="allocation-summary">
              <span>本周期收入</span><strong>{formatMoney(income)}</strong>
              <span>消费池＋县库</span><strong>{formatMoney(allocatedIncome)}</strong>
            </div>
            {allocatedIncome !== income && (
              <div className="warning-box" role="status">
                仍有 {formatMoney(income - allocatedIncome)} 未分配；两项合计需要与收入一致。
              </div>
            )}
            <div className="info-box">
              <strong>县库是虚拟账面</strong>
              <span>它可以跨月累积，也可以因消费池超支变成负数，但软件不会替你移动任何真实资金。</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-content">
            <p className="eyebrow">第三步 · 分配消费池</p>
            <h1>设置六类消费预算</h1>
            <p className="helper">单类超支只提醒，不自动挪用其他分类；总消费池超支才影响县库账面。</p>
            <div className="budget-input-grid">
              {[
                ["餐饮", "food"],
                ["住房", "housing"],
                ["交通", "transport"],
                ["医疗", "medical"],
                ["购物", "shopping"],
                ["娱乐", "entertainment"],
              ].map(([label, key]) => (
                <label key={key}>
                  {label}
                  <span className="input-with-prefix"><b>¥</b><input
                    inputMode="decimal"
                    value={form[key as keyof typeof form]}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  /></span>
                </label>
              ))}
            </div>
            <div className="allocation-summary">
              <span>消费池</span>
              <strong>{formatMoney(disposable)}</strong>
              <span>六类预算合计</span>
              <strong>{formatMoney(allocatedBudget)}</strong>
            </div>
            {allocatedBudget !== disposable && (
              <div className="warning-box" role="status">
                六类额度还差 {formatMoney(disposable - allocatedBudget)}，合计需要与消费池一致。
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-content">
            <p className="eyebrow">第四步 · 选择长期建设</p>
            <h1>想让哪座场景随着县库成长？</h1>
            <p className="helper">记录储蓄会修建场景；县库负数会让场景破损，未来补回后可以恢复。</p>
            <label>
              现实储蓄目标
              <input
                value={form.savingsName}
                onChange={(event) => setForm({ ...form, savingsName: event.target.value })}
              />
            </label>
            <div className="budget-input-grid">
              <label>
                目标金额
                <span className="input-with-prefix"><b>¥</b><input
                  inputMode="decimal"
                  value={form.savingsTarget}
                  onChange={(event) => setForm({ ...form, savingsTarget: event.target.value })}
                /></span>
              </label>
              <label>
                目标日期
                <input
                  type="date"
                  value={form.savingsDeadline}
                  onChange={(event) => setForm({ ...form, savingsDeadline: event.target.value })}
                />
              </label>
            </div>
            <fieldset className="build-choice">
              <legend>首个建设项目</legend>
              <div className="build-choice-card">
                <span className="build-choice-icon">书</span>
                <div>
                  <strong>县学藏书阁</strong>
                  <small>县库回升会添置书架、藏书与灯火；亏空时工程暂停。</small>
                </div>
                <span className="selected-check">已选择</span>
              </div>
            </fieldset>
            <div className="seal-preview">
              <span>授印预览</span>
              <strong>从九品县令</strong>
              <small>架空王朝设定 · 以治理行为晋升</small>
            </div>
          </div>
        )}

        <div className="wizard-actions">
          <button className="secondary-button" disabled={step === 0} onClick={() => { setFormError(""); setStep(step - 1); }}>
            上一步
          </button>
          {step < 3 ? (
            <button className="primary-button" onClick={goNext}>下一步</button>
          ) : (
            <button className="primary-button" onClick={finish} data-testid="finish-onboarding">
              领取官印，进入县衙
            </button>
          )}
        </div>
        {formError && <div className="error-box wizard-error" role="alert">{formError}</div>}
      </section>
    </main>
  );
}

function SceneWireframe({
  rank,
  presentation = "暂不设置",
  room = "hall",
  fiscalState,
  treasuryBalance,
  recovering = false,
  showBalance = true,
}: {
  rank: string;
  presentation?: string;
  room?: RoomKey;
  fiscalState: FiscalState;
  treasuryBalance: number;
  recovering?: boolean;
  showBalance?: boolean;
}) {
  const vocabulary = getCourtVocabulary(rank);
  const rankConfig = getRankConfig(rank);
  const roomConfig = getRoomConfig(rank, room);
  const sceneMedia = getSceneMediaAsset(rank, room, fiscalState);
  const stateCopy = getFiscalStateCopy(rank, fiscalState, room);
  const fiscalLabel =
    recovering
      ? `${roomConfig.name}修复中`
      : stateCopy.label;
  const sceneCopy =
    recovering
      ? `账面回升后，${roomConfig.name}正在补瓦、归还器物并恢复灯火`
      : stateCopy.description;
  return (
    <div
      className={`world-scene room-scene rank-theme-${rankConfig.theme} room-${room} ${fiscalState} ${recovering ? "recovering" : ""}`}
      data-room={room}
      data-rank={rankConfig.key}
      data-fiscal-state={fiscalState}
      data-transition={recovering ? "recovery" : undefined}
      aria-label={`${roomConfig.name}，${fiscalLabel}`}
    >
      <SceneMedia
        className="world-scene-art"
        media={sceneMedia}
        eagerPoster={room === "hall"}
      />
      <div className="world-scene-shade" aria-hidden="true" />
      <RoomActivityLayer
        room={room}
        fiscalState={fiscalState}
        rank={rank}
        presentation={presentation}
      />
      <div className="world-scene-topline">
        <span className="scene-rank">{rankConfig.residenceName} · {roomConfig.genericName}</span>
        <span className={`fiscal-state-label ${fiscalState}`}>{fiscalLabel}</span>
      </div>
      <div className="world-scene-caption">
        <div>
          <span>{getRankDisplayName(rank, getCharacterGender(presentation))}治所</span>
          <strong>{roomConfig.name}</strong>
          <small>{sceneCopy}</small>
        </div>
        {showBalance && (
          <div className="scene-treasury">
            <span>{vocabulary.treasury}账面</span>
            <strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function AppShell({
  mode,
  state,
  setState,
  onExitMode,
  onResetDemo,
}: {
  mode: Mode;
  state: PrototypeState;
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
  onExitMode: () => void;
  onResetDemo: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("home");
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordPurpose, setRecordPurpose] = useState<RecordPurpose>("general");
  const [recordInput, setRecordInput] = useState("");
  const [pending, setPending] = useState<PendingEntry | null>(null);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [parseError, setParseError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskDetail, setRiskDetail] = useState(false);
  const [isFinishingCouncil, setIsFinishingCouncil] = useState(false);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [rankAtlasOpen, setRankAtlasOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearBookOpen, setClearBookOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerItem | null>(null);
  const [recoveryEvent, setRecoveryEvent] = useState<RecoveryEvent | null>(null);
  const [previewRank, setPreviewRank] = useState<RankKey>(
    () => getRankConfig(state.profile.rank).key,
  );
  const [previewRoom, setPreviewRoom] = useState<RoomKey>("hall");
  const [previewFiscalState, setPreviewFiscalState] =
    useState<FiscalState>("stable");
  const [referenceEditor, setReferenceEditor] = useState<{
    category: BudgetKey;
    source: NextCycleReference["source"];
  } | null>(null);
  const [referenceAmountInput, setReferenceAmountInput] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [referenceNotice, setReferenceNotice] = useState("");
  const councilStep = Math.max(0, Math.min(7, Number(state.councilStep) || 0));
  const setCouncilStep = (step: number) => {
    const nextStep = Math.max(0, Math.min(7, step));
    setState((current) => ({ ...current, councilStep: nextStep }));
  };

  useEffect(() => {
    if (state.profile.onboarded) {
      const key = mode === "real" ? realStorageKey : demoStorageKey;
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // The prototype stays usable in-memory when browser storage is unavailable.
      }
    }
  }, [mode, state]);

  useEffect(() => {
    const key = mode === "real" ? realStorageKey : demoStorageKey;
    const syncLedgerAcrossTabs = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key) return;
      try {
        const nextState = event.newValue
          ? hydratePrototypeState(JSON.parse(event.newValue) as PrototypeState)
          : mode === "demo"
            ? createDemoState()
            : createBlankRealState();
        setState(nextState);
      } catch {
        // Ignore incomplete or manually corrupted browser storage entries.
      }
    };

    window.addEventListener("storage", syncLedgerAcrossTabs);
    return () => window.removeEventListener("storage", syncLedgerAcrossTabs);
  }, [mode, setState]);

  useEffect(() => {
    const closeTopDialog = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (referenceEditor) {
        setReferenceEditor(null);
        setReferenceError("");
      }
      else if (clearBookOpen) setClearBookOpen(false);
      else if (deleteTarget) setDeleteTarget(null);
      else if (settingsOpen) setSettingsOpen(false);
      else if (riskOpen) { setRiskOpen(false); setRiskDetail(false); }
      else if (feedback) setFeedback(null);
      else if (recordOpen) {
        setManualFormOpen(false);
        setRecordOpen(false);
      }
      else if (promotionOpen) setPromotionOpen(false);
      else if (rankAtlasOpen) setRankAtlasOpen(false);
    };
    window.addEventListener("keydown", closeTopDialog);
    return () => window.removeEventListener("keydown", closeTopDialog);
  }, [clearBookOpen, deleteTarget, feedback, promotionOpen, rankAtlasOpen, recordOpen, referenceEditor, riskOpen, settingsOpen]);

  useEffect(() => {
    if (!rankAtlasOpen) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById("rank-atlas-panel")
        ?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rankAtlasOpen]);

  useEffect(() => {
    if (!recoveryEvent || tab !== "home" || feedback) return;
    const timer = window.setTimeout(() => setRecoveryEvent(null), 3600);
    return () => window.clearTimeout(timer);
  }, [feedback, recoveryEvent, tab]);

  const categorizedExpenseTotal = useMemo(
    () => budgetOrder.reduce((sum, key) => sum + state.budgets[key].used, 0),
    [state.budgets],
  );
  const uncategorizedExpenseTotal = useMemo(
    () => calculateUncategorizedExpenseTotal(state.ledger, budgetOrder),
    [state.ledger],
  );
  const expenseTotal = categorizedExpenseTotal + uncategorizedExpenseTotal;

  const remaining = state.profile.disposable - expenseTotal;
  const { overspend, treasuryBalance, fiscalState } = calculateFinance(
    state.profile.treasuryBase,
    expenseTotal,
    state.profile.disposable,
  );
  const savingsPercent = safePercent(Math.max(0, treasuryBalance), state.profile.savingsTarget);
  const demoTriggerAdded = state.ledger.some((item) => item.note.includes("夜宵"));
  const leadingCategory = useMemo(
    () =>
      [
        ...budgetOrder.map((key) => ({
          key,
          bureau: state.budgets[key].bureau,
          used: state.budgets[key].used,
          limit: state.budgets[key].limit,
          percent: Math.max(
            0,
            Math.round((state.budgets[key].used / Math.max(state.budgets[key].limit, 1)) * 100),
          ),
        })),
        {
          key: "其他",
          bureau: "杂项署",
          used: uncategorizedExpenseTotal,
          limit: 0,
          percent: uncategorizedExpenseTotal > 0 ? 101 : 0,
        },
      ]
        .sort((a, b) => b.percent - a.percent)[0],
    [state.budgets, uncategorizedExpenseTotal],
  );
  const riskItems = useMemo(() => {
    const visible = state.ledger
      .filter((item) => item.type === "支出" && item.category === leadingCategory.key)
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({ label: item.note, amount: item.amount }));
    const visibleTotal = visible.reduce((sum, item) => sum + item.amount, 0);
    const hiddenTotal = Math.max(0, leadingCategory.used - visibleTotal);
    if (hiddenTotal > 0) {
      visible.push({ label: `其余${leadingCategory.key}记录合计`, amount: hiddenTotal });
    }
    return visible.sort((a, b) => b.amount - a.amount).slice(0, 3);
  }, [leadingCategory.key, leadingCategory.used, state.ledger]);
  const councilExpenseEntries = useMemo(
    () =>
      state.ledger
        .filter(
          (item) =>
            item.type === "支出" &&
            normalizeExpenseCategory(item.category) === leadingCategory.key,
        )
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    [leadingCategory.key, state.ledger],
  );
  const hasCategoryAlert = leadingCategory.percent >= 90;
  const hasRisk = overspend > 0 || hasCategoryAlert;
  const riskLevel: "near" | "overspent" | "deficit" =
    treasuryBalance < 0 ? "deficit" : overspend > 0 ? "overspent" : "near";
  const courtAddress = getCourtAddress(
    state.profile.rank,
    "advisor",
    state.profile.address,
  );
  const comicAddress = getCourtAddress(
    state.profile.rank,
    "comic",
    state.profile.address,
  );
  const courtRoles = getCourtRoles(
    state.profile.rank,
    state.profile.presentation,
  );
  const courtVocabulary = getCourtVocabulary(state.profile.rank);
  const characterGender = getCharacterGender(state.profile.presentation);
  const currentRankConfig = getRankConfig(state.profile.rank);
  const nextRankConfig = getNextRank(state.profile.rank);
  const nextRankThreshold = nextRankConfig
    ? rankMeritThresholds[nextRankConfig.key]
    : rankMeritThresholds.emperor;
  const currentRankName = getRankDisplayName(
    currentRankConfig.key,
    characterGender,
  );
  const currentRiskTitle =
    !hasRisk
      ? "本周期未见明显异常"
      : riskLevel === "deficit"
      ? `${courtVocabulary.treasury}告急，${courtVocabulary.residence}陈设待典`
      : riskLevel === "overspent"
        ? "本周期消费预算已经超支"
        : leadingCategory.key === "其他"
          ? "有一笔支出还未归类"
          : `${leadingCategory.bureau}用度告急`;
  const currentRiskFact =
    !hasRisk
      ? `本周期支出 ${formatMoney(expenseTotal)}，没有超过消费池；目前金额最高的分类是${leadingCategory.key}，使用进度为${leadingCategory.percent}%`
      : riskLevel === "deficit"
      ? `本周期支出 ${formatMoney(expenseTotal)}，超过消费池 ${formatMoney(overspend)}；${courtVocabulary.treasury}账面 ${formatMoney(treasuryBalance)}`
      : riskLevel === "overspent"
        ? `本周期支出 ${formatMoney(expenseTotal)}，超过消费池 ${formatMoney(overspend)}；${courtVocabulary.treasury}账面剩余 ${formatMoney(treasuryBalance)}`
        : leadingCategory.key === "其他"
          ? `待分类支出 ${formatMoney(leadingCategory.used)} 已计入本周期总支出；消费池仍余 ${formatMoney(remaining)}`
          : `${leadingCategory.key}已用 ${formatMoney(leadingCategory.used)} / ${formatMoney(leadingCategory.limit)}（${leadingCategory.percent}%）；消费池仍余 ${formatMoney(remaining)}`;
  const currentRiskMood: NpcMood =
    !hasRisk ? "neutral" : riskLevel === "deficit" ? "alarm" : "warning";
  const currentReference =
    isBudgetKey(leadingCategory.key)
      ? state.nextCycleReferences[leadingCategory.key]
      : undefined;
  const councilAvailability = getCouncilAvailability({
    cadence: state.councilCadence,
    lastCompletedAt: state.lastCouncilCompletedAt,
    ledgerCount: state.ledger.length,
    lastLedgerCount: state.councilLedgerCount,
  });
  const currentRiskCast: FeedbackRole[] =
    !hasRisk
      ? [
          {
            mark: "策",
            kind: "advisor",
            name: courtRoles.advisor,
            tone: "平稳呈报",
            mood: "neutral",
            line: `本周期没有明显超支。${leadingCategory.key}目前使用${leadingCategory.percent}%，可以照常记录，并留意金额最高的几笔。`,
          },
          {
            mark: "喜",
            kind: "comic",
            name: courtRoles.comic,
            tone: "报平安",
            mood: "success",
            line: `${comicAddress}，账房今日没有敲警钟！小的还是把最高的几笔账都备好了，随时可以查。`,
          },
          {
            mark: "安",
            kind: "companion",
            name: courtRoles.companion,
            tone: "陪你复盘",
            mood: "success",
            line: "没有异常也值得回看。知道钱花得稳，和知道哪里需要调整一样重要。",
          },
        ]
      : riskLevel === "near"
      ? [
          {
            mark: "急",
            kind: "comic",
            name: courtRoles.comic,
            tone: "急报",
            mood: currentRiskMood,
            line:
              leadingCategory.key === "其他"
                ? `${comicAddress}！账房里多出一笔还没归部的支出，小的先记进总账啦！`
                : `${comicAddress}！${leadingCategory.bureau}的牌子快见底啦，已经用到${leadingCategory.percent}%了！`,
          },
          {
            mark: "策",
            kind: "advisor",
            name: courtRoles.advisor,
            tone: "谏言",
            mood: currentRiskMood,
            line:
              leadingCategory.key === "其他"
                ? `待分类支出共${formatMoney(leadingCategory.used)}，已经计入总支出和${courtVocabulary.treasury}计算。建议先补充正确分类。`
                : `目前只是${leadingCategory.key}分类预警，总消费池仍余${formatMoney(remaining)}，${courtVocabulary.treasury}尚未动用。建议先查看这一类金额最高的三笔支出。`,
          },
        ]
      : [
          {
            mark: "急",
            kind: "comic",
            name: courtRoles.comic,
            tone: "急报",
            mood: currentRiskMood,
            line:
              riskLevel === "deficit"
                ? `${comicAddress}！不好啦！${courtVocabulary.treasury}已经见底，门房正抱着典当清册跑来请示——再这么花，${courtVocabulary.residence}的屏风真要抬出门啦！`
                : `${comicAddress}！本周期用度越过消费池，已经动到${courtVocabulary.treasury}${formatMoney(overspend)}啦！`,
          },
          {
            mark: "策",
            kind: "advisor",
            name: courtRoles.advisor,
            tone: "谏言",
            mood: currentRiskMood,
            line:
              riskLevel === "deficit"
                ? `本周期消费池超支${formatMoney(overspend)}，${courtVocabulary.treasury}账面为${formatMoney(treasuryBalance)}。先调出金额最高的三笔支出，确认是否有误记；若无误，再从最大一类开始收紧下周期额度。`
                : `消费池超支${formatMoney(overspend)}，${courtVocabulary.treasury}账面还剩${formatMoney(treasuryBalance)}。先查看本周期金额最高的三笔支出，再决定下周期从哪一项收紧。`,
          },
          {
            mark: "安",
            kind: "companion",
            name: courtRoles.companion,
            tone: "宽慰",
            mood: currentRiskMood,
            line:
              riskLevel === "deficit"
                ? `先别急着责怪自己。账已经把问题照出来，我们先看清最大的三笔，再一处一处把${courtVocabulary.residence}修回来。`
                : "现在发现正好。先看清是哪几笔把节奏带快了，下个周期再给这一处留出余地。",
          },
        ];
  const councilTrioCast: FeedbackRole[] =
    currentRiskCast.length === 3
      ? currentRiskCast
      : [
          ...currentRiskCast,
          {
            mark: "安",
            kind: "companion",
            name: courtRoles.companion,
            tone: "宽慰",
            mood: currentRiskMood,
            line: `现在看见这笔变化正好。先把${leadingCategory.key}的主要支出看清楚，再决定下周期是否调整，不必急着责备自己。`,
          },
        ];
  const newLedgerCount = Math.max(
    0,
    state.ledger.length - state.councilLedgerCount,
  );
  const newLedgerItems = state.ledger.slice(0, newLedgerCount);
  const bookkeepingScore = Math.min(25, newLedgerCount * 5);
  const budgetScore = state.councilDecision ? 20 : 0;
  const councilScore = 25;
  const savingsScore = newLedgerItems.some((item) => item.type === "储蓄") ? 10 : 0;
  const councilMeritTotal =
    bookkeepingScore + budgetScore + councilScore + savingsScore;
  const lastCouncilDate = new Date(state.lastCouncilCompletedAt);
  const meritAlreadyAwardedThisWeek =
    Boolean(state.lastCouncilCompletedAt) &&
    !Number.isNaN(lastCouncilDate.getTime()) &&
    getCouncilPeriodKey(lastCouncilDate, "weekly") ===
      getCouncilPeriodKey(new Date(), "weekly");
  const weeklyMerit = meritAlreadyAwardedThisWeek ? 0 : councilMeritTotal;

  const guideStep = getDemoGuideStep({
    triggerAdded: demoTriggerAdded,
    councilDecisionMade: Boolean(state.councilDecision),
    councilDone: state.councilDone,
    recoveryDone: state.demoRecoveryDone,
  });
  const recoverySavingsAmount = calculateRecoverySavings(treasuryBalance);
  const recoveryPreviewBalance =
    pending?.type === "储蓄"
      ? treasuryBalance + pending.amount
      : treasuryBalance;

  const tabItems: Array<{ key: TabKey; label: string; mark: string }> = [
    { key: "home", label: courtVocabulary.residence, mark: "邸" },
    { key: "treasury", label: courtVocabulary.treasury, mark: "库" },
    { key: "council", label: "议事", mark: "议" },
    { key: "build", label: "建设", mark: "建" },
  ];

  const goToTab = (nextTab: TabKey) => {
    setRankAtlasOpen(false);
    setTab(nextTab);
  };

  const openRecorder = (
    seed = "",
    initialPending: PendingEntry | null = null,
    purpose: RecordPurpose = "general",
  ) => {
    setIsConfirming(false);
    setRecordPurpose(purpose);
    setRecordInput(seed);
    setPending(initialPending);
    setManualFormOpen(Boolean(initialPending));
    setParseError("");
    setDuplicateWarning("");
    setAssistantAnswer("");
    setRecordOpen(true);
  };

  const openManualForm = () => {
    setManualFormOpen(true);
    setPending((current) => current ?? {
      type: "支出",
      amount: 0,
      category: "其他",
      note: recordInput.trim(),
      date: todayLabel(),
    });
  };

  const answerQuestion = (query: string) => {
    const intent = inferLedgerQuestionIntent(query);
    const sorted = [
      ...budgetOrder.map((key) => ({ key, used: state.budgets[key].used })),
      { key: "其他", used: uncategorizedExpenseTotal },
    ]
      .sort((a, b) => b.used - a.used);
    if (intent === "spending-summary") {
      setAssistantAnswer(
        `本周期共记录支出 ${formatMoney(expenseTotal)}，其中${sorted[0].key}最多，为 ${formatMoney(sorted[0].used)}。`,
      );
      return true;
    }
    if (intent === "budget-balance") {
      setAssistantAnswer(
        `消费池 ${formatMoney(state.profile.disposable)}，已用 ${formatMoney(expenseTotal)}，当前差额 ${formatMoney(remaining)}；${courtVocabulary.treasury}账面 ${formatMoney(treasuryBalance)}。`,
      );
      return true;
    }
    if (intent === "savings-progress") {
      setAssistantAnswer(
        `${state.profile.savingsName}目标为 ${formatMoney(state.profile.savingsTarget)}，当前${courtVocabulary.treasury}账面 ${formatMoney(treasuryBalance)}，按非负余额计算完成 ${savingsPercent}%。`,
      );
      return true;
    }
    return false;
  };

  const parseRecord = () => {
    setParseError("");
    setDuplicateWarning("");
    setAssistantAnswer("");
    const text = recordInput.trim();
    if (!text) {
      setParseError("请先输入一笔账，例如“午饭32元”。");
      return;
    }
    if (answerQuestion(text)) {
      setPending(null);
      setManualFormOpen(false);
      return;
    }
    if (
      !/\d/.test(text) &&
      /[？?]|怎么|如何|为什么|能不能|可以吗|建议|多少|哪里|哪了/.test(text)
    ) {
      setPending(null);
      setManualFormOpen(false);
      setParseError("账房目前能回答“这周钱花哪了”“预算还剩多少”“储蓄目标完成多少”。这句话暂时无法可靠回答，也不会误记成支出。");
      return;
    }
    const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
    if (!amountMatch) {
      setParseError("账房没认准金额，原内容已经保留。请在下面补全后继续。");
      openManualForm();
      return;
    }
    const amount = Number(amountMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      setParseError("金额必须大于0，账目尚未写入。");
      openManualForm();
      return;
    }
    const classification = inferLedgerClassification(text);
    const type: LedgerType = classification.type;
    const category = classification.category;
    const candidate: PendingEntry = {
      type,
      amount,
      category,
      note: text.replace(amountMatch[0], "").replace(/[元块]/g, "").trim() || category,
      date: todayLabel(),
    };
    const possibleDuplicate = state.ledger.some(
      (item) =>
        item.type === candidate.type &&
        item.amount === candidate.amount &&
        item.category === candidate.category &&
        item.note === candidate.note &&
        item.date === candidate.date,
    );
    if (possibleDuplicate) {
      setDuplicateWarning("发现同日、同金额、同分类、同备注的账目。请核对；若确实发生两次，仍可继续确认。");
    }
    setManualFormOpen(false);
    setPending(candidate);
  };

  const applyEntryEffect = (draft: PrototypeState, item: PendingEntry | LedgerItem, direction: 1 | -1) => {
    if (item.type === "支出" && budgetOrder.includes(item.category as BudgetKey)) {
      const key = item.category as BudgetKey;
      draft.budgets[key].used = Math.max(0, draft.budgets[key].used + item.amount * direction);
    }
    if (item.type === "储蓄") {
      draft.profile.treasuryBase += item.amount * direction;
    }
    if (item.type === "收入") {
      draft.profile.income = Math.max(0, draft.profile.income + item.amount * direction);
    }
  };

  const confirmEntry = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!pending || pending.amount <= 0 || isConfirming) return;
    event.currentTarget.disabled = true;
    setIsConfirming(true);
    setState((current) => {
      const next = structuredClone(current) as PrototypeState;
      if (pending.id) {
        const oldItem = next.ledger.find((item) => item.id === pending.id);
        if (oldItem) {
          applyEntryEffect(next, oldItem, -1);
          next.ledger = next.ledger.filter((item) => item.id !== pending.id);
        }
      }
      const newItem: LedgerItem = {
        ...pending,
        id: pending.id || `entry-${Date.now()}`,
      };
      next.ledger = [newItem, ...next.ledger];
      applyEntryEffect(next, newItem, 1);
      const nextExpenseTotal =
        budgetOrder.reduce((sum, key) => sum + next.budgets[key].used, 0) +
        calculateUncategorizedExpenseTotal(next.ledger, budgetOrder);
      const hasCriticalCategory = budgetOrder.some(
        (key) => (next.budgets[key].used / Math.max(next.budgets[key].limit, 1)) * 100 >= 90,
      );
      const hasUncategorizedExpense =
        calculateUncategorizedExpenseTotal(next.ledger, budgetOrder) > 0;
      next.riskTriggered =
        hasCriticalCategory || hasUncategorizedExpense || nextExpenseTotal > next.profile.disposable;
      const nextTreasuryBalance = calculateFinance(
        next.profile.treasuryBase,
        nextExpenseTotal,
        next.profile.disposable,
      ).treasuryBalance;
      if (
        mode === "demo" &&
        shouldCompleteDemoRecovery(guideStep, newItem, nextTreasuryBalance)
      ) {
        next.demoRecoveryDone = true;
      }
      return next;
    });

    const previousItem = pending.id ? state.ledger.find((item) => item.id === pending.id) : null;
    let projectedExpense = expenseTotal;
    if (previousItem?.type === "支出") {
      projectedExpense = Math.max(0, projectedExpense - previousItem.amount);
    }
    if (pending.type === "支出") {
      projectedExpense += pending.amount;
    }
    const projectedCategory = normalizeExpenseCategory(pending.category);
    let projectedCategoryUsed =
      pending.type === "支出"
        ? projectedCategory === "其他"
          ? uncategorizedExpenseTotal
          : state.budgets[projectedCategory].used
        : 0;
    if (
      previousItem?.type === "支出" &&
      normalizeExpenseCategory(previousItem.category) === projectedCategory
    ) {
      projectedCategoryUsed = Math.max(0, projectedCategoryUsed - previousItem.amount);
    }
    if (pending.type === "支出") {
      projectedCategoryUsed += pending.amount;
    }
    const projectedCategoryLimit =
      pending.type === "支出" && projectedCategory !== "其他"
        ? state.budgets[projectedCategory].limit
        : 0;
    const projectedPercent =
      projectedCategoryLimit > 0
        ? Math.round((projectedCategoryUsed / projectedCategoryLimit) * 100)
        : projectedCategoryUsed > 0
          ? 101
          : 0;
    const projectedTreasuryBase =
      state.profile.treasuryBase +
      (pending.type === "储蓄" ? pending.amount : 0) -
      (previousItem?.type === "储蓄" ? previousItem.amount : 0);
    const {
      overspend: projectedOverspend,
      treasuryBalance: projectedTreasury,
      fiscalState: projectedFiscalState,
    } = calculateFinance(projectedTreasuryBase, projectedExpense, state.profile.disposable);
    const categoryRisk = pending.type === "支出" && projectedPercent >= 90;
    const isRisk = categoryRisk || projectedOverspend > 0;
    const didRecover = treasuryBalance < 0 && projectedTreasury >= 0;

    if (didRecover) {
      setRecoveryEvent({
        before: treasuryBalance,
        after: projectedTreasury,
        finalState: projectedFiscalState,
      });
    }

    if (pending.type === "储蓄") {
      const recoveryCompleted =
        mode === "demo" &&
        shouldCompleteDemoRecovery(guideStep, pending, projectedTreasury);
      const savingsMood: NpcMood =
        didRecover || recoveryCompleted ? "recovery" : "success";
      setFeedback({
        title: didRecover
          ? `${courtVocabulary.treasury}回正，${courtVocabulary.residence}开始修复`
          : projectedTreasury < 0
            ? `${courtVocabulary.treasury}正在回升，尚未回正`
            : `储蓄已经记入${courtVocabulary.treasury}`,
        fact: didRecover
          ? `本次记入${courtVocabulary.treasury} ${formatMoney(pending.amount)}，账面由 ${formatMoney(treasuryBalance)} 变为 ${formatMoney(projectedTreasury)}`
          : `本次记入${courtVocabulary.treasury} ${formatMoney(pending.amount)}，${courtVocabulary.treasury}账面变为 ${formatMoney(projectedTreasury)}`,
        buttonLabel: didRecover || recoveryCompleted ? `查看修复后的${courtVocabulary.residence}` : undefined,
        nextTab: didRecover ? "home" : undefined,
        cast: [
          {
            mark: "吏",
            kind: "comic",
            name: courtRoles.comic,
            tone: "回报",
            mood: savingsMood,
            line: didRecover
              ? `${comicAddress}！${courtVocabulary.treasury}终于翻回正数，屋瓦补上了，廊下的灯也重新亮啦！当前账面为${formatMoney(projectedTreasury)}。`
              : projectedTreasury < 0
                ? `这笔储蓄已经记清，${courtVocabulary.treasury}回升到${formatMoney(projectedTreasury)}。再补${formatMoney(-projectedTreasury)}，就能让${courtVocabulary.residence}重新亮灯啦！`
                : `这笔储蓄已经写入${courtVocabulary.treasury}账簿，当前账面为${formatMoney(projectedTreasury)}。`,
          },
          {
            mark: "安",
            kind: "companion",
            name: courtRoles.companion,
            tone: "温言",
            mood: savingsMood,
            line: didRecover && projectedFiscalState === "strained"
              ? `这一笔让${courtVocabulary.residence}重新亮起来，但本周期消费池仍有超支。先守住这次回升，下周期再从最大的一项慢慢收紧。`
              : `不是数字悄悄涨了一格，而是${courtVocabulary.residence}真的多亮了一盏灯。照这个节奏继续就好。`,
          },
        ],
      });
    } else if (isRisk) {
      setFeedback(null);
      setRiskDetail(false);
      setRiskOpen(true);
    } else if (pending.type === "收入") {
      setFeedback({
        title: "新收入已经登记",
        fact: `新增收入 ${formatMoney(pending.amount)}，尚未自动分配`,
        cast: [
          { mark: "吏", kind: "comic", name: courtRoles.comic, tone: "报喜", mood: "success", line: `${comicAddress}，新进的钱已经记清，小的绝不擅自往任何库房里塞！` },
          { mark: "策", kind: "advisor", name: courtRoles.advisor, tone: "提醒", mood: "success", line: `这笔收入目前尚未分入消费池或${courtVocabulary.treasury}，请记得重新安排。` },
        ],
      });
    } else {
      setFeedback({
        title: "这笔账已经记好",
        fact: `${pending.note} ${formatMoney(pending.amount)} 已确认入账`,
        cast: [
          { mark: "吏", kind: "comic", name: courtRoles.comic, tone: "回报", mood: "success", line: `${comicAddress}，${pending.note}这笔已经归进${pending.category}，小的连一文都没抄错！` },
          { mark: "安", kind: "companion", name: courtRoles.companion, tone: "温言", mood: "success", line: `记账不是为了责备这一笔。消费池现在还剩${formatMoney(state.profile.disposable - projectedExpense)}，你只是比刚才更清楚下一步怎么花。` },
        ],
      });
    }
    setRecordOpen(false);
    setManualFormOpen(false);
    setPending(null);
    setRecordInput("");
  };

  const editItem = (item: LedgerItem) => {
    setRecordPurpose("general");
    setPending({ ...item });
    setRecordInput(`${item.note}${item.amount}元`);
    setParseError("");
    setDuplicateWarning("");
    setAssistantAnswer("");
    setIsConfirming(false);
    setRecordOpen(true);
  };

  const deleteItem = (item: LedgerItem) => {
    setDeleteTarget(item);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setState((current) => {
      const next = structuredClone(current) as PrototypeState;
      applyEntryEffect(next, deleteTarget, -1);
      next.ledger = next.ledger.filter((entry) => entry.id !== deleteTarget.id);
      const nextUncategorizedExpenseTotal =
        calculateUncategorizedExpenseTotal(next.ledger, budgetOrder);
      const nextExpenseTotal =
        budgetOrder.reduce((sum, key) => sum + next.budgets[key].used, 0) +
        nextUncategorizedExpenseTotal;
      next.riskTriggered =
        nextExpenseTotal > next.profile.disposable ||
        nextUncategorizedExpenseTotal > 0 ||
        budgetOrder.some((key) => (next.budgets[key].used / Math.max(next.budgets[key].limit, 1)) * 100 >= 90);
      return next;
    });
    setDeleteTarget(null);
  };

  const openReferenceEditor = (source: NextCycleReference["source"]) => {
    if (!isBudgetKey(leadingCategory.key)) {
      const firstUnclassified = state.ledger.find(
        (item) =>
          item.type === "支出" &&
          normalizeExpenseCategory(item.category) === "其他",
      );
      if (firstUnclassified) {
        setRiskOpen(false);
        setRiskDetail(false);
        setReferenceNotice("");
        setTab("treasury");
        editItem(firstUnclassified);
      } else {
        setReferenceNotice("当前没有可编辑的待分类支出。");
      }
      return;
    }

    const savedReference = state.nextCycleReferences[leadingCategory.key];
    setReferenceAmountInput(
      String(savedReference?.amount ?? state.budgets[leadingCategory.key].limit),
    );
    setReferenceError("");
    setReferenceNotice("");
    setReferenceEditor({ category: leadingCategory.key, source });
  };

  const saveNextCycleReference = () => {
    if (!referenceEditor) return;
    const amount = parseNextCycleReferenceAmount(referenceAmountInput);
    if (amount === null) {
      setReferenceError(`请输入1至${MAX_NEXT_CYCLE_REFERENCE.toLocaleString("zh-CN")}之间的整数金额。`);
      return;
    }

    const decision = `下周期${referenceEditor.category}参考额度暂定为 ${formatMoney(amount)}`;
    setState((current) => ({
      ...current,
      councilDecision: decision,
      nextCycleReferences: {
        ...current.nextCycleReferences,
        [referenceEditor.category]: {
          category: referenceEditor.category,
          amount,
          updatedAt: todayLabel(),
          source: referenceEditor.source,
        },
      },
    }));

    const source = referenceEditor.source;
    setReferenceEditor(null);
    setReferenceAmountInput("");
    setReferenceError("");
    if (source === "risk") {
      setRiskOpen(false);
      setRiskDetail(false);
      setTab("council");
    }
  };

  const deleteNextCycleReference = () => {
    if (!referenceEditor) return;
    const { category } = referenceEditor;
    setState((current) => {
      const nextCycleReferences = { ...current.nextCycleReferences };
      delete nextCycleReferences[category];
      return {
        ...current,
        councilDecision: current.councilDecision.startsWith(`下周期${category}参考额度`)
          ? ""
          : current.councilDecision,
        nextCycleReferences,
      };
    });
    setReferenceEditor(null);
    setReferenceAmountInput("");
    setReferenceError("");
  };

  const renderCurrentReferenceCard = (source: NextCycleReference["source"]) => {
    if (!currentReference || !isBudgetKey(leadingCategory.key)) return null;

    return (
      <div className="info-box" data-testid="next-cycle-reference-summary">
        <strong>下周期{leadingCategory.key}参考额草案：{formatMoney(currentReference.amount)}</strong>
        <span>
          本期额度 {formatMoney(state.budgets[leadingCategory.key].limit)}
          {" · "}本期已用 {formatMoney(state.budgets[leadingCategory.key].used)}
        </span>
        <small>仅保存为下周期草案，不改变本期额度、风险或{courtVocabulary.treasury}账面。</small>
        <button className="secondary-button" onClick={() => openReferenceEditor(source)}>
          编辑或删除草案
        </button>
      </div>
    );
  };

  const saveRiskDecision = (decision: string) => {
    setState((current) => ({
      ...current,
      councilDecision: decision,
    }));
    setRiskOpen(false);
    setRiskDetail(false);
    setReferenceNotice("");
    setTab("council");
  };

  const finishCouncil = () => {
    if (state.councilDone || isFinishingCouncil) return;
    setIsFinishingCouncil(true);
    const gender = getCharacterGender(state.profile.presentation);
    const nextMerit = Math.min(999, state.profile.merit + weeklyMerit);
    const nextRank = getRankForMerit(nextMerit, gender);
    const promoted = getRankIndex(nextRank) > getRankIndex(state.profile.rank);
    setState((current) => ({
      ...current,
      councilDone: true,
      councilDecision:
        current.councilDecision ||
        (mode === "demo"
          ? "下周期先查看三笔主要餐饮支出"
          : "本次奏报维持现状"),
      councilLedgerCount: current.ledger.length,
      councilRound: (current.councilRound ?? 0) + 1,
      lastCouncilCompletedAt: new Date().toISOString(),
      councilStep: 0,
      profile: {
        ...current.profile,
        rank: nextRank,
        merit: nextMerit,
        scene: getRoomConfig(nextRank, "hall").name,
      },
    }));
    if (promoted) {
      setPreviewRank(getRankConfig(nextRank).key);
      setPromotionOpen(true);
    }
  };

  const renderHome = () => {
    if (rankAtlasOpen) {
      return (
        <div className="page-stack rank-atlas-page" id="rank-atlas-panel">
          <section className="page-title rank-atlas-title">
            <div>
              <span className="eyebrow">人物、官阶与治所总览</span>
              <h1>人物与官署图鉴</h1>
            </div>
            <button
              className="outline-button"
              onClick={() => setRankAtlasOpen(false)}
              data-testid="close-rank-atlas"
            >
              返回{courtVocabulary.residence}
            </button>
          </section>
          {renderRankAtlas()}
        </div>
      );
    }

    return (
    <div className="page-stack">
      {mode === "demo" && (
        <section className="demo-guide" aria-label="新手引导">
          <div>
            <span className="wire-badge inverse">新手引导 {guideStep}/5</span>
            <h2>
              {guideStep === 1
                ? "先记一笔“夜宵118元”"
                : guideStep === 2
                  ? `${courtVocabulary.treasury}告急，请查看奏折`
                  : guideStep === 3
                    ? "进入县署朝会"
                    : guideStep === 4
                      ? `记录一笔${formatMoney(recoverySavingsAmount)}储蓄，让${courtVocabulary.treasury}回正`
                      : "你已完成一次完整治理"}
            </h2>
          </div>
          <button
            className="outline-button light"
            data-testid="guide-primary-action"
            onClick={() => {
              if (guideStep === 1) openRecorder("夜宵118元");
              else if (guideStep === 2) setRiskOpen(true);
              else if (guideStep === 3) setTab("council");
              else if (guideStep === 4) {
                openRecorder(
                  `为${state.profile.savingsName}储蓄${recoverySavingsAmount}元`,
                  {
                    type: "储蓄",
                    amount: recoverySavingsAmount,
                    category: "储蓄",
                    note: state.profile.savingsName,
                    date: todayLabel(),
                  },
                  "demo-recovery",
                );
              }
              else setTab("build");
            }}
          >
            {guideStep === 1
              ? "开始记账"
              : guideStep === 2
                ? "查看风险奏折"
                : guideStep === 3
                  ? "进入议事"
                  : guideStep === 4
                    ? `确认储蓄${formatMoney(recoverySavingsAmount)}`
                    : "查看建设进度"}
          </button>
        </section>
      )}

      <section className="hero-grid">
        <div className="scene-card">
          <SceneWireframe
            rank={state.profile.rank}
            presentation={state.profile.presentation}
            room="hall"
            fiscalState={fiscalState}
            treasuryBalance={treasuryBalance}
            recovering={Boolean(recoveryEvent)}
          />
        </div>
        <div className="status-column">
          <div className="rank-card rank-card-with-portrait">
            <RankPortrait
              rank={state.profile.rank}
              presentation={state.profile.presentation}
              fiscalState={fiscalState}
              label={`${state.profile.name}的${currentRankName}立绘`}
            />
            <div>
              <span className="eyebrow">当前官阶</span>
              <strong>{currentRankName}</strong>
              <p>{state.profile.name} · {state.profile.address}</p>
              <div className="progress-line">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      (state.profile.merit / Math.max(nextRankThreshold, 1)) * 100,
                    )}%`,
                  }}
                />
              </div>
              <small>
                {nextRankConfig
                  ? `政绩 ${state.profile.merit} / ${nextRankThreshold} · 下一阶 ${getRankDisplayName(nextRankConfig.key, characterGender)}`
                  : `政绩 ${state.profile.merit} · 已至最高官阶`}
              </small>
            </div>
          </div>
          <button
            className="rank-atlas-entry"
            onClick={() => setRankAtlasOpen(true)}
            aria-expanded={rankAtlasOpen}
            aria-controls="rank-atlas-panel"
            data-testid="open-rank-atlas"
          >
            <span>人物与官署图鉴</span>
            <b>查看五阶预览 →</b>
          </button>
          <div className="quick-facts">
            <div><span>消费池差额</span><strong className={remaining < 0 ? "negative-text" : ""}>{formatMoney(remaining)}</strong></div>
            <div><span>已记录支出</span><strong>{formatMoney(expenseTotal)}</strong></div>
            <div><span>{courtVocabulary.treasury}账面</span><strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong></div>
          </div>
          {recoveryEvent && (
            <div className="recovery-notice" role="status">
              <span>{courtVocabulary.residence}正在修复</span>
              <strong>{formatMoney(recoveryEvent.before)} → {formatMoney(recoveryEvent.after)}</strong>
              <small>{recoveryEvent.finalState === "strained" ? `${courtVocabulary.treasury}已回正，本周期消费预算仍有超支` : `${courtVocabulary.treasury}已回正，${courtVocabulary.residence}继续修缮`}</small>
            </div>
          )}
        </div>
      </section>

      {hasRisk ? (
        <section className="risk-banner" data-testid="risk-banner">
          <div className="avatar-stack" aria-label={`${currentRiskCast.length}位角色共同呈报`}>
            {currentRiskCast.map((role) => (
              <NpcPortrait
                compact
                key={role.name}
                kind={role.kind}
                name={role.name}
                mood={role.mood}
                rank={state.profile.rank}
                presentation={state.profile.presentation}
              />
            ))}
          </div>
          <div>
            <span className="eyebrow">{courtVocabulary.emergency} · 钱粮告警</span>
            <h2>{currentRiskTitle}</h2>
            <p>{currentRiskFact}</p>
          </div>
          <button className="primary-button" onClick={() => { setReferenceNotice(""); setRiskOpen(true); }} data-testid="open-risk">
            查看风险奏折
          </button>
        </section>
      ) : (
        <section className="role-message">
          <NpcPortrait
            compact
            kind="comic"
            name={courtRoles.comic}
            mood="neutral"
            rank={state.profile.rank}
            presentation={state.profile.presentation}
          />
          <div>
            <span className="eyebrow">{courtRoles.comic} · 候命</span>
            <h2>账簿已经铺好，等{courtAddress}落下第一笔</h2>
            <p>记下每一笔收支，分类预算和{courtVocabulary.residence}都会随之变化。</p>
          </div>
          <button className="outline-button" onClick={() => openRecorder()}>记一笔</button>
        </section>
      )}

      <section className="section-card">
        <div className="section-heading">
          <div><span className="eyebrow">消费池分类</span><h2>六类预算</h2></div>
          <button className="text-button" onClick={() => setTab("treasury")}>进入{courtVocabulary.treasury} →</button>
        </div>
        <div className="budget-grid">
          {budgetOrder.map((key) => {
            const budget = state.budgets[key];
            const rawPercent = Math.max(0, Math.round((budget.used / Math.max(budget.limit, 1)) * 100));
            return (
              <article className="budget-card" key={key}>
                <div><span>{key} · {budget.bureau}</span><strong>{rawPercent}%</strong></div>
                <div className="progress-line"><span className={rawPercent >= 90 ? "danger" : ""} style={{ width: `${Math.min(100, rawPercent)}%` }} /></div>
                <small>{formatMoney(budget.used)} / {formatMoney(budget.limit)}</small>
              </article>
            );
          })}
          {uncategorizedExpenseTotal > 0 && (
            <article className="budget-card unclassified">
              <div><span>其他 · 待分类</span><strong>待处理</strong></div>
              <div className="progress-line"><span className="danger" style={{ width: "100%" }} /></div>
              <small>{formatMoney(uncategorizedExpenseTotal)} · 已计入总支出</small>
            </article>
          )}
        </div>
      </section>
    </div>
    );
  };

  const renderTreasury = () => (
    <div className="page-stack">
      <section className="page-title">
        <div><span className="eyebrow">本周期钱粮</span><h1>{courtVocabulary.treasury}账簿</h1></div>
        <button className="primary-button" onClick={() => openRecorder()}>＋ 记一笔</button>
      </section>
      <section className="room-scene-shell" aria-label={`${courtVocabulary.treasury}场景`}>
        <SceneWireframe
          rank={state.profile.rank}
          presentation={state.profile.presentation}
          room="treasury"
          fiscalState={fiscalState}
          treasuryBalance={treasuryBalance}
          recovering={Boolean(recoveryEvent)}
        />
      </section>
      <section className="financial-summary">
        <div><span>本周期收入</span><strong>{formatMoney(state.profile.income)}</strong></div>
        <div><span>消费池</span><strong>{formatMoney(state.profile.disposable)}</strong></div>
        <div><span>已记录支出</span><strong>{formatMoney(expenseTotal)}</strong></div>
        <div><span>{courtVocabulary.treasury}账面</span><strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong></div>
      </section>
      <section className={`treasury-equation ${fiscalState}`}>
        <div>
          <span className="eyebrow">本周期{courtVocabulary.treasury}结算</span>
          <h2>
            {fiscalState === "deficit"
              ? "财政亏空：负数跨月保留"
              : fiscalState === "strained"
                ? `消费池超支：${courtVocabulary.treasury}账面仍为正`
                : "财政平稳：消费池尚未超支"}
          </h2>
        </div>
        <p>
          {courtVocabulary.treasury}账面 {formatMoney(state.profile.treasuryBase)}
          {overspend > 0 ? ` − 消费池超支 ${formatMoney(overspend)}` : " − 超支 ¥0"}
          {" = "}<strong>{formatMoney(treasuryBalance)}</strong>
        </p>
        <small>“{courtVocabulary.treasury}”只记录储蓄计划与超支变化，不会发生真实资金划转。</small>
      </section>
      <section className="section-card">
        <div className="section-heading">
          <div><span className="eyebrow">预算不是支出</span><h2>分类拨付</h2></div>
          <span className="status-pill">{state.profile.cycle}</span>
        </div>
        <div className="budget-list">
          {budgetOrder.map((key) => {
            const budget = state.budgets[key];
            const rawPercent = Math.max(0, Math.round((budget.used / Math.max(budget.limit, 1)) * 100));
            return (
              <div className="budget-row" key={key}>
                <div><strong>{key}</strong><span>{budget.bureau}</span></div>
                <div className="wide-progress"><span className={rawPercent >= 90 ? "danger" : ""} style={{ width: `${Math.min(100, rawPercent)}%` }} /></div>
                <div><strong className={budget.limit - budget.used < 0 ? "negative-text" : ""}>{formatMoney(budget.limit - budget.used)}</strong><span>{rawPercent > 100 ? "分类超支" : "剩余"} · {rawPercent}%</span></div>
              </div>
            );
          })}
          {uncategorizedExpenseTotal > 0 && (
            <div className="budget-row unclassified">
              <div><strong>其他</strong><span>待分类支出</span></div>
              <div className="wide-progress"><span className="danger" style={{ width: "100%" }} /></div>
              <div><strong>{formatMoney(uncategorizedExpenseTotal)}</strong><span>已计入总支出</span></div>
            </div>
          )}
        </div>
      </section>
      <section className="section-card">
        <div className="section-heading">
          <div><span className="eyebrow">本周期记录</span><h2>最近流水</h2></div>
          <button className="outline-button" onClick={() => openRecorder("这周钱花哪了")}>问账房</button>
        </div>
        {state.ledger.length === 0 ? (
          <div className="empty-state"><strong>还没有流水</strong><span>记录第一笔后，预算和世界状态会同步变化。</span></div>
        ) : (
          <div className="ledger-list">
            {state.ledger.map((item) => (
              <article className="ledger-row" key={item.id}>
                <span className="ledger-type">{item.type}</span>
                <div><strong>{item.note}</strong><span>{item.date} · {item.category}</span></div>
                <b>{item.type === "支出" ? "−" : "+"}{formatMoney(item.amount)}</b>
                <div className="row-actions">
                  <button onClick={() => editItem(item)}>编辑</button>
                  <button onClick={() => deleteItem(item)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderCouncil = () => {
    const hasEnoughData = mode === "demo" || state.ledger.length >= 1;
    const councilBackdrop = getSceneMediaAsset(
      state.profile.rank,
      "council",
      fiscalState,
    );
    const renderCouncilNovelStage = (
      cast: FeedbackRole[],
      title: string,
      activeActor: FeedbackRole["kind"] = cast[0]?.kind ?? "advisor",
      eyebrow = councilStageLabels[councilStep],
    ) => (
      <CouncilNovelStage
        backdrop={councilBackdrop}
        actors={cast.map((role) => ({
          id: role.kind,
          kind: role.kind,
          name: role.name,
          mood: role.mood ?? "council",
        }))}
        activeActor={activeActor}
        dialogue={cast.map((role) => ({
          actorId: role.kind,
          text: role.line,
          tone: role.tone,
        }))}
        progress={{
          current: councilStep + 1,
          total: councilStageLabels.length,
          label: "朝会议程",
        }}
        rank={state.profile.rank}
        presentation={state.profile.presentation}
        eyebrow={eyebrow}
        title={title}
      />
    );
    const councilScene = (
      <section className="room-scene-shell" aria-label={`${courtRoles.council}场景`}>
        <SceneWireframe
          rank={state.profile.rank}
          presentation={state.profile.presentation}
          room="council"
          fiscalState={fiscalState}
          treasuryBalance={treasuryBalance}
          recovering={Boolean(recoveryEvent)}
        />
      </section>
    );
    if (!hasEnoughData) {
      return (
        <div className="page-stack">
          <section className="page-title"><div><span className="eyebrow">有账目后即可开议</span><h1>{courtRoles.council}</h1></div></section>
          {councilScene}
          <section className="empty-state large">
            <strong>账簿还太薄，{courtRoles.advisor}暂时无本可奏</strong>
            <span>至少记录一笔账后，即可开启第一次朝会。</span>
            <button className="primary-button" onClick={() => openRecorder()}>先记一笔</button>
          </section>
        </div>
      );
    }
    if (state.councilDone) {
      return (
        <div className="page-stack">
          <section className="page-title">
            <div><span className="eyebrow">本次账情奏报已完成</span><h1>{courtRoles.council}</h1></div>
            <span className="status-pill">✓ 已完成</span>
          </section>
          {councilScene}
          <section className="council-stage">
            <div className="council-content">
              <CouncilNovelStage
                backdrop={councilBackdrop}
                actors={[
                  { id: "companion", kind: "companion", name: courtRoles.companion, mood: "success" },
                  { id: "advisor", kind: "advisor", name: courtRoles.advisor, mood: "success" },
                ]}
                activeActor="companion"
                dialogue={[
                  {
                    actorId: "companion",
                    tone: "散会备忘",
                    text: "账已经看明白了，接下来照常记录就好。下次议事再看看这份调整是否合适。",
                  },
                  {
                    actorId: "advisor",
                    tone: "留档",
                    text: `本次决议已经记入${courtRoles.council}备忘，当前账目不会被自动改写。`,
                  },
                ]}
                progress={{ current: 8, total: 8, label: "朝会议程" }}
                rank={state.profile.rank}
                presentation={state.profile.presentation}
                eyebrow="本周期议事已完成"
                title="散会备忘已经留档"
              />
              <div className="council-section-heading">
                <p className="eyebrow">最近一次议事备忘</p>
                <h2>{state.councilDecision || "本次未保留下周期行动草案"}</h2>
                <p>本次政绩已经入账，议事备忘会保留供你回看。</p>
              </div>
              <div className="report-grid">
                <div><span>累计政绩</span><strong>{state.profile.merit}</strong></div>
                <div><span>当前官阶</span><strong>{currentRankName}</strong></div>
                <div><span>{leadingCategory.key}进度</span><strong>{leadingCategory.percent}%</strong></div>
              </div>
              {renderCurrentReferenceCard("council")}
              <div className="button-row">
                {councilAvailability.canOpen ? (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setState((current) => ({
                        ...current,
                        councilDone: false,
                        councilDecision: "",
                        councilStep: 0,
                      }));
                      setIsFinishingCouncil(false);
                    }}
                  >
                    开启{councilAvailability.periodLabel}议事
                  </button>
                ) : councilAvailability.reason === "no-new-ledger" ? (
                  <button className="primary-button" onClick={() => openRecorder()}>
                    先记一笔新账
                  </button>
                ) : (
                  <div className="council-cooldown" role="status">
                    <strong>{getCouncilCadenceLabel(state.councilCadence)}</strong>
                    <span>{councilAvailability.message}</span>
                  </div>
                )}
                <button className="secondary-button" onClick={() => setTab("home")}>
                  返回{courtVocabulary.residence}
                </button>
              </div>
            </div>
          </section>
        </div>
      );
    }
    return (
      <div className="page-stack">
        <section className="page-title">
          <div><span className="eyebrow">本次账情奏报</span><h1>{courtRoles.council}</h1></div>
          <span className="status-pill">
            {mode === "demo"
              ? `体验奏报 · ${getCouncilCadenceLabel(state.councilCadence)}`
              : getCouncilCadenceLabel(state.councilCadence)}
          </span>
        </section>
        <section className="council-stage">
          <div className="council-steps" aria-label="朝会议程">
            {councilStageLabels.map((label, index) => (
              <span
                className={index === councilStep ? "active" : index < councilStep ? "done" : ""}
                aria-current={index === councilStep ? "step" : undefined}
                key={label}
              >
                {index + 1}. {label}
              </span>
            ))}
          </div>
          {councilStep === 0 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                [
                  {
                    mark: "急",
                    kind: "comic",
                    name: courtRoles.comic,
                    tone: "请示开议",
                    mood: "council",
                    line: `${comicAddress}，本周期${state.ledger.length}笔账已经封册。账房、师爷都候在堂下，是否现在升堂核账？`,
                  },
                  {
                    mark: "策",
                    kind: "advisor",
                    name: courtRoles.advisor,
                    tone: "候命",
                    mood: "neutral",
                    line: "账册与分类明细已经核对完毕，随时可以开始本次议事。",
                  },
                ],
                "账册已封，请示升堂",
                "comic",
                "开议",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">{courtRoles.advisor}主持</p>
                <h2>账册已备，请开启本次议事</h2>
                <p>{councilAvailability.periodLabel}只能完成一次；新增消费或储蓄不会提前重置。</p>
              </div>
              <button className="primary-button" onClick={() => setCouncilStep(1)} data-testid="start-council">
                升堂核账
              </button>
            </div>
          )}
          {councilStep === 1 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                [
                  {
                    mark: "策",
                    kind: "advisor",
                    name: courtRoles.advisor,
                    tone: "财政汇报",
                    mood: "council",
                    line: `本周期共记录支出${formatMoney(expenseTotal)}，消费池为${formatMoney(state.profile.disposable)}，${courtVocabulary.treasury}账面为${formatMoney(treasuryBalance)}。`,
                  },
                  {
                    mark: "急",
                    kind: "comic",
                    name: courtRoles.comic,
                    tone: "递送账册",
                    mood: "neutral",
                    line: `账房已经把${state.ledger.length}笔流水逐项夹好，金额和分类都能当堂调阅。`,
                  },
                ],
                "本周期财政汇报",
                "advisor",
                "财政汇报",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">{courtRoles.advisor}呈报 · 本次账情</p>
                <h2>本周期已记录支出 {formatMoney(expenseTotal)}</h2>
              </div>
              <div className="report-grid">
                <div><span>消费池</span><strong>{formatMoney(state.profile.disposable)}</strong></div>
                <div><span>总支出</span><strong>{formatMoney(expenseTotal)}</strong></div>
                <div><span>{courtVocabulary.treasury}账面</span><strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong></div>
              </div>
              <button className="primary-button" onClick={() => setCouncilStep(2)}>查看本期异常</button>
            </div>
          )}
          {councilStep === 2 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                currentRiskCast.slice(0, 2),
                hasRisk ? currentRiskTitle : "本周期账情平稳",
                currentRiskCast[0]?.kind ?? "comic",
                "异常核验",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">
                  {hasRisk ? "本周期最需要留意的一项" : "本周期账情平稳"}
                </p>
                <h2>{currentRiskTitle}</h2>
                <p>{currentRiskFact}</p>
              </div>
              <div className="report-grid">
                <div>
                  <span>{leadingCategory.key === "其他" ? "分类状态" : `${leadingCategory.key}额度`}</span>
                  <strong>
                    {leadingCategory.key === "其他"
                      ? "待补充"
                      : formatMoney(leadingCategory.limit)}
                  </strong>
                </div>
                <div><span>本期已用</span><strong>{formatMoney(leadingCategory.used)}</strong></div>
                <div><span>使用进度</span><strong>{leadingCategory.percent}%</strong></div>
              </div>
              <button className="primary-button" onClick={() => setCouncilStep(3)}>
                {hasRisk ? "召集三人谏言" : "听取三人复盘"}
              </button>
            </div>
          )}
          {councilStep === 3 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                councilTrioCast,
                "三人依次奏对",
                "comic",
                "急报 · 谏言 · 宽慰",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">急报 · 谏言 · 宽慰</p>
                <h2>三人已经把问题、数字和下一步说清</h2>
              </div>
              <button className="primary-button" onClick={() => setCouncilStep(4)}>调阅三笔主要支出</button>
            </div>
          )}
          {councilStep === 4 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                [
                  {
                    mark: "策",
                    kind: "advisor",
                    name: courtRoles.advisor,
                    tone: "调阅支出",
                    mood: "council",
                    line: `${leadingCategory.key}支出中，金额最高的三笔已经列在下方。若发现误记，可以直接修改或删除，账面会同步重算。`,
                  },
                  {
                    mark: "急",
                    kind: "comic",
                    name: courtRoles.comic,
                    tone: "递账",
                    mood: "neutral",
                    line: "三笔原始流水都在这里，改动前会再次请你确认，不会误删。",
                  },
                ],
                `${leadingCategory.key}三笔主要支出`,
                "advisor",
                "调阅真实流水",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">真实账目 · 可修改</p>
                <h2>{leadingCategory.key}三笔主要支出</h2>
              </div>
              <div className="council-expense-ledger" data-testid="council-expense-list">
                {riskItems.length > 0 ? (
                  riskItems.map((item) => {
                    const matchingEntry = councilExpenseEntries.find(
                      (entry) => entry.note === item.label && entry.amount === item.amount,
                    );
                    return (
                      <article key={`${item.label}-${item.amount}`}>
                        <div>
                          <strong>{item.label}</strong>
                          <span>{matchingEntry ? `${matchingEntry.date} · ${matchingEntry.category}` : `${leadingCategory.key}汇总`}</span>
                        </div>
                        <b>{formatMoney(item.amount)}</b>
                        {matchingEntry ? (
                          <div className="council-expense-actions">
                            <button className="outline-button" onClick={() => editItem(matchingEntry)}>
                              修改
                            </button>
                            <button
                              className="danger-outline-button"
                              onClick={() => deleteItem(matchingEntry)}
                              data-testid="delete-council-entry"
                            >
                              删除
                            </button>
                          </div>
                        ) : (
                          <span className="ledger-summary-label">账簿汇总</span>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <strong>当前没有可调阅的{leadingCategory.key}流水</strong>
                    <span>可以先回到账簿补记或修正分类。</span>
                  </div>
                )}
              </div>
              <button className="primary-button" onClick={() => setCouncilStep(5)}>生成调整草案</button>
            </div>
          )}
          {councilStep === 5 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                [
                  {
                    mark: "策",
                    kind: "advisor",
                    name: courtRoles.advisor,
                    tone: "拟定草案",
                    mood: "council",
                    line: `本期${leadingCategory.key}额度${formatMoney(leadingCategory.limit)}、实际使用${formatMoney(leadingCategory.used)}。草案只供下周期参考，不会改写本期账目。`,
                  },
                  {
                    mark: "安",
                    kind: "companion",
                    name: courtRoles.companion,
                    tone: "陪你决定",
                    mood: "council",
                    line: "可以先设置一个参考额度，也可以保持现状继续观察。你的选择之后仍能修改。",
                  },
                ],
                `拟定下周期${leadingCategory.key}草案`,
                "advisor",
                "调整草案",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">只影响下周期参考</p>
                <h2>为{leadingCategory.key}留下一个可执行的调整草案</h2>
              </div>
              <div className="decision-list">
                <button
                  className={state.councilDecision.startsWith(`下周期${leadingCategory.key}参考额度`) ? "selected" : ""}
                  onClick={() => {
                    openReferenceEditor("council");
                  }}
                  data-testid="open-council-reference-editor"
                >
                  <span>
                    {isBudgetKey(leadingCategory.key)
                      ? `${currentReference ? "编辑" : "设置"}下周期${leadingCategory.key}参考额度`
                      : "先补充待分类支出的分类"}
                  </span>
                  <b>{currentReference ? "已保存" : isBudgetKey(leadingCategory.key) ? "设置" : "补充分类"}</b>
                </button>
                {isBudgetKey(leadingCategory.key) && (
                  <button
                    className={state.councilDecision === `下周期${leadingCategory.key}先沿用本期额度 ${formatMoney(leadingCategory.limit)}` ? "selected" : ""}
                    onClick={() => {
                      setReferenceNotice("");
                      setState((current) => ({
                        ...current,
                        councilDecision: `下周期${leadingCategory.key}先沿用本期额度 ${formatMoney(leadingCategory.limit)}`,
                      }));
                    }}
                  >
                    <span>先沿用本期{leadingCategory.key}额度</span>
                    <b>{formatMoney(leadingCategory.limit)}</b>
                  </button>
                )}
                <button
                  className={state.councilDecision === "维持现状，继续观察" ? "selected" : ""}
                  onClick={() => {
                    setReferenceNotice("");
                    setState((current) => ({ ...current, councilDecision: "维持现状，继续观察" }));
                  }}
                >
                  <span>维持现状，继续观察</span>
                  <b>{state.councilDecision === "维持现状，继续观察" ? "已选择" : "选择"}</b>
                </button>
              </div>
              {referenceNotice && <div className="warning-box" role="status">{referenceNotice}</div>}
              {renderCurrentReferenceCard("council")}
              <button className="primary-button" disabled={!state.councilDecision} onClick={() => setCouncilStep(6)}>
                确认草案，进入结算
              </button>
            </div>
          )}
          {councilStep === 6 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                [
                  {
                    mark: "策",
                    kind: "advisor",
                    name: courtRoles.advisor,
                    tone: "结算",
                    mood: "success",
                    line: meritAlreadyAwardedThisWeek
                      ? `本次议事已经完成，但本周政绩已结算过。备忘仍会保留，不会重复加分。`
                      : `本周期新增${newLedgerCount}笔账，完成一次议事，本次可获得${weeklyMerit}点政绩。`,
                  },
                  {
                    mark: "喜",
                    kind: "comic",
                    name: courtRoles.comic,
                    tone: "报喜",
                    mood: "success",
                    line: `${comicAddress}，账也核了、主意也定了，这回的政绩小的已经算得明明白白！`,
                  },
                ],
                "本次政绩结算",
                "advisor",
                "政绩结算",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">本次最高80点</p>
                <h2>政绩结算</h2>
                {meritAlreadyAwardedThisWeek && (
                  <p>每日朝会可以继续复盘，但同一自然周只结算一次政绩，防止重复刷分。</p>
                )}
              </div>
              <div className="merit-breakdown">
                <div><span>账本秩序</span><strong>{bookkeepingScore} / 25</strong></div>
                <div><span>预算治理</span><strong>{budgetScore} / 20</strong></div>
                <div><span>完成议事</span><strong>{councilScore} / 25</strong></div>
                <div><span>储蓄习惯</span><strong>{savingsScore} / 10</strong></div>
              </div>
              <div className="total-merit">
                <span>{meritAlreadyAwardedThisWeek ? "本次入账政绩" : "本次政绩"}</span>
                <strong>{weeklyMerit} / 80</strong>
              </div>
              <button className="primary-button" onClick={() => setCouncilStep(7)}>
                生成散会备忘
              </button>
            </div>
          )}
          {councilStep === 7 && (
            <div className="council-content">
              {renderCouncilNovelStage(
                [
                  {
                    mark: "安",
                    kind: "companion",
                    name: courtRoles.companion,
                    tone: "散会",
                    mood: "success",
                    line: "账已经看明白了，接下来照常记录就好。下次议事再回来看看这份调整是否合适。",
                  },
                  {
                    mark: "策",
                    kind: "advisor",
                    name: courtRoles.advisor,
                    tone: "备忘",
                    mood: "success",
                    line: `本次决定为：“${state.councilDecision || "维持现状，继续观察"}”。散会后将写入账本备忘。`,
                  },
                ],
                "本次散会备忘",
                "companion",
                "散会备忘",
              )}
              <div className="council-section-heading">
                <p className="eyebrow">本次议事备忘</p>
                <h2>{state.councilDecision || "维持现状，继续观察"}</h2>
                <p>
                  完成后将锁定本周期朝会
                  {weeklyMerit > 0
                    ? `，并把${weeklyMerit}点政绩写入当前官阶。`
                    : "；本周政绩已结算，本次不会重复加分。"}
                </p>
              </div>
              <div className="report-grid">
                <div><span>本周期账目</span><strong>{state.ledger.length} 笔</strong></div>
                <div><span>本次政绩</span><strong>+{weeklyMerit}</strong></div>
                <div><span>朝会频率</span><strong>{getCouncilCadenceLabel(state.councilCadence)}</strong></div>
              </div>
              <button
                className="primary-button"
                disabled={isFinishingCouncil}
                onClick={() => {
                  finishCouncil();
                  goToTab("home");
                }}
                data-testid="finish-council"
              >
                {isFinishingCouncil
                  ? "正在结算…"
                  : `散会并返回${courtVocabulary.residence}`}
              </button>
            </div>
          )}
        </section>
        {state.councilDone && (
          <section className="section-card">
            <span className="eyebrow">最近一次议事备忘</span>
            <h2>{state.councilDecision}</h2>
            <p>这条议事备忘会保存在当前账本中，供你随时回看。</p>
          </section>
        )}
      </div>
    );
  };

  function renderRankAtlas() {
    const currentRankIndex = getRankIndex(state.profile.rank);
    const buildFiscalLabel =
      recoveryEvent
        ? `${courtVocabulary.residence}修复中`
        : fiscalState === "deficit"
          ? `${courtVocabulary.treasury}告急`
          : fiscalState === "strained"
            ? "消费预算超支"
            : "财政平稳";
    const previewRankConfig = getRankConfig(previewRank);
    const previewRoomConfig = getRoomConfig(previewRank, previewRoom);
    const roomLabels: Record<RoomKey, string> = {
      hall: "大堂",
      treasury: "库房",
      council: "议事厅",
      works: "营造院",
    };
    const fiscalLabels: Record<FiscalState, string> = {
      stable: "财政丰盈",
      strained: "预算超支",
      deficit: "库房亏空",
    };

    const openWorldPreview = (
      rank: RankKey,
      room: RoomKey = "hall",
      previewState: FiscalState = "stable",
    ) => {
      setPreviewRank(rank);
      setPreviewRoom(room);
      setPreviewFiscalState(previewState);
      window.requestAnimationFrame(() => {
        document
          .getElementById("world-preview")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    return (
      <>
        <section className="section-card rank-world-section">
          <div className="rank-world-heading">
            <div>
              <span className="eyebrow">五阶人物与官署共同成长</span>
              <h2>五阶仕途总览</h2>
            </div>
            <p>每阶都拥有独立人物服制与四个房间；财政变化会改变建筑破损、陈设、库存、施工和人气。</p>
          </div>
          <div className="rank-world-grid">
            {rankConfigs.map((stage, index) => {
              const relation =
                index === currentRankIndex ? "current" : index < currentRankIndex ? "past" : "future";
              const visualState = relation === "current" ? fiscalState : "stable";
              const sceneMedia = getSceneMediaAsset(stage.key, "hall", visualState);
              const status =
                relation === "current"
                  ? "当前官阶"
                  : relation === "past"
                    ? "历任官署"
                    : index === currentRankIndex + 1
                      ? `下一阶 · 政绩${rankMeritThresholds[stage.key]}开启`
                      : `预览 · 政绩${rankMeritThresholds[stage.key]}开启`;
              const rankName = getRankDisplayName(stage.key, characterGender);

              return (
                <article className={`rank-world-card ${relation}`} key={stage.key}>
                  <div className="rank-world-visual">
                    <RankPortrait
                      rank={stage.key}
                      presentation={state.profile.presentation}
                      fiscalState={visualState}
                      label={`${rankName}人物立绘`}
                    />
                    <div
                      className={`rank-world-scene has-scene-media rank-theme-${stage.theme} ${visualState}`}
                      role="img"
                      aria-label={`${stage.rooms.hall.name}，${relation === "current" ? buildFiscalLabel : status}`}
                    >
                      <SceneMedia
                        className="rank-world-scene-media"
                        media={sceneMedia}
                      />
                      <div className="rank-world-scene-labels">
                        <span>{status}</span>
                        <strong>{stage.rooms.hall.name}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="rank-world-copy">
                    <div>
                      <h3>{rankName}</h3>
                      <span className="rank-status">{status}</span>
                    </div>
                    <p>{stage.buildingScale}</p>
                    <small>{Object.values(stage.rooms).map((room) => room.name).join(" · ")}</small>
                    <button
                      className="outline-button rank-preview-button"
                      onClick={() => openWorldPreview(stage.key, "hall", visualState)}
                      data-testid={`preview-rank-${stage.key}`}
                    >
                      预览人物与四个房间
                    </button>
                    {relation === "current" && (
                      <nav className="rank-room-nav" aria-label={`${rankName}官署空间`}>
                        <button onClick={() => goToTab("home")}>进入大堂</button>
                        <button onClick={() => goToTab("treasury")}>查看库房</button>
                        <button onClick={() => goToTab("council")}>前往议事厅</button>
                        <button onClick={() => openWorldPreview(stage.key, "works", fiscalState)}>查看营造院</button>
                      </nav>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="section-card world-preview-section" id="world-preview">
          <div className="rank-world-heading">
            <div>
              <span className="eyebrow">官署志</span>
              <h2>阅览五阶治所</h2>
            </div>
            <p>任选官阶、空间与府库景况，看看不同仕途下的治所风貌。</p>
          </div>
          <div className="world-preview-controls" aria-label="场景预览控制">
            <fieldset>
              <legend>官阶</legend>
              <div className="control-chip-row">
                {rankConfigs.map((rank) => (
                  <button
                    className={previewRank === rank.key ? "active" : ""}
                    key={rank.key}
                    onClick={() => setPreviewRank(rank.key)}
                    data-testid={`world-rank-${rank.key}`}
                  >
                    {getRankDisplayName(rank.key, characterGender)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>房间</legend>
              <div className="control-chip-row">
                {(Object.keys(roomLabels) as RoomKey[]).map((room) => (
                  <button
                    className={previewRoom === room ? "active" : ""}
                    key={room}
                    onClick={() => setPreviewRoom(room)}
                    data-testid={`world-room-${room}`}
                  >
                    {roomLabels[room]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>财政状态</legend>
              <div className="control-chip-row">
                {(Object.keys(fiscalLabels) as FiscalState[]).map((value) => (
                  <button
                    className={previewFiscalState === value ? "active" : ""}
                    key={value}
                    onClick={() => setPreviewFiscalState(value)}
                    data-testid={`world-fiscal-${value}`}
                  >
                    {fiscalLabels[value]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="world-preview-stage">
            <div className="preview-character-card">
              <RankPortrait
                rank={previewRank}
                presentation={state.profile.presentation}
                fiscalState={previewFiscalState}
                label={`${getRankDisplayName(previewRank, characterGender)}完整人物立绘`}
              />
              <span className="eyebrow">仕途形象</span>
              <h3>{getRankDisplayName(previewRank, characterGender)}</h3>
              <p>{previewRankConfig.attire}</p>
              <small>{previewRankConfig.poses[previewFiscalState]}</small>
            </div>
            <div className="preview-scene-card">
              <SceneWireframe
                rank={previewRank}
                presentation={state.profile.presentation}
                room={previewRoom}
                fiscalState={previewFiscalState}
                treasuryBalance={treasuryBalance}
                showBalance={false}
              />
              <div className="preview-scene-note">
                <strong>{previewRoomConfig.name}</strong>
                <span>{previewRoomConfig.visualAnchor}</span>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  const renderBuild = () => {
    return (
      <div className="page-stack build-page">
        <section className="page-title">
          <div><span className="eyebrow">储蓄推动工程，超支改变施工状态</span><h1>建设与营造</h1></div>
          <button className="outline-button" onClick={() => openRecorder(`储蓄${Math.min(100, Math.max(1, state.profile.savingsTarget - Math.max(0, treasuryBalance)))}元`)}>
            记录一笔储蓄
          </button>
        </section>
        <section className="room-scene-shell" aria-label={`${currentRankConfig.rooms.works.name}当前场景`}>
          <SceneWireframe
            rank={state.profile.rank}
            presentation={state.profile.presentation}
            room="works"
            fiscalState={fiscalState}
            treasuryBalance={treasuryBalance}
            recovering={Boolean(recoveryEvent)}
          />
        </section>
        <section className={`construction-card ${fiscalState}`}>
          <div>
            <span className="eyebrow">{fiscalState === "deficit" ? `当前任务 · 修复${courtVocabulary.residence}` : "当前工程"}</span>
            <h2>{state.profile.savingsName}</h2>
            <p>
              {fiscalState === "deficit"
                ? `${courtVocabulary.treasury}为负时${courtVocabulary.residence}会进入破损状态；后续储蓄会先修复破损，再继续长期建设。`
                : "储蓄记录推动建设；消费池超支会改变材料、工人数量和施工进度。"}
            </p>
          </div>
          <div className="construction-progress">
            <strong>{savingsPercent}%</strong>
            <div className="progress-line"><span style={{ width: `${savingsPercent}%` }} /></div>
            <span>{courtVocabulary.treasury} {formatMoney(treasuryBalance)} / 目标 {formatMoney(state.profile.savingsTarget)}</span>
            <small>目标日期：{state.profile.savingsDeadline}</small>
          </div>
        </section>
      </div>
    );
  };

  return (
    <main className="prototype-app">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-seal">账</span>
          <div><strong>朝账</strong><small>让每一笔收支改变眼前的世界</small></div>
        </div>
        <div className="topbar-actions">
          <span className={`mode-pill ${mode}`}>{mode === "demo" ? "虚构演示数据" : "我的本地账本"}</span>
          <button className="icon-button" aria-label="打开设置" onClick={() => setSettingsOpen(true)}>•••</button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar" aria-label="主要导航">
          <div className="nav-profile">
            <RankPortrait
              compact
              rank={state.profile.rank}
              presentation={state.profile.presentation}
              fiscalState={fiscalState}
              label={`${state.profile.name}的${currentRankName}立绘`}
            />
            <div>
              <strong>{state.profile.name}</strong>
              <small>{currentRankName}</small>
            </div>
          </div>
          <nav>
            {tabItems.map((item) => (
              <button
                key={item.key}
                className={tab === item.key ? "active" : ""}
                onClick={() => goToTab(item.key)}
                data-testid={`nav-${item.key}`}
              >
                <span>{item.mark}</span>{item.label}
              </button>
            ))}
          </nav>
          <button className="primary-button full" onClick={() => openRecorder()}>＋ 记一笔</button>
          <div className="sidebar-note">
            <span>关于{courtVocabulary.treasury}</span>
            <p>只做账目记录，不连接银行卡。</p>
          </div>
        </aside>

        <section className={`main-content tab-${tab}`} id="main-content" tabIndex={-1}>
          {tab === "home" && renderHome()}
          {tab === "treasury" && renderTreasury()}
          {tab === "council" && renderCouncil()}
          {tab === "build" && renderBuild()}
          <div className={`page-foot-ornament page-foot-${tab}`} aria-hidden="true">
            <span />
            <strong>账</strong>
            <span />
          </div>
        </section>
      </div>

      <nav className="mobile-nav" aria-label="移动端主要导航">
        {tabItems.slice(0, 2).map((item) => (
          <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => goToTab(item.key)}>
            <span>{item.mark}</span>{item.label}
          </button>
        ))}
        <button className="mobile-add" aria-label="记账：新增一笔收支" onClick={() => openRecorder()}>
          <span className="mobile-add-icon" aria-hidden="true">＋</span>
          <small>记账</small>
        </button>
        {tabItems.slice(2).map((item) => (
          <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => goToTab(item.key)}>
            <span>{item.mark}</span>{item.label}
          </button>
        ))}
      </nav>

      {recordOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {recordPurpose === "demo-recovery"
                    ? `确认入账后，${courtVocabulary.residence}将根据${courtVocabulary.treasury}变化修复`
                    : "账房先生成候选，你确认后入账"}
                </span>
                <h2 id="record-title">
                  {recordPurpose === "demo-recovery"
                    ? "确认这笔修复储蓄"
                    : pending?.id
                      ? "编辑账目"
                      : "聊天式记账"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭记账窗口"
                onClick={() => {
                  setManualFormOpen(false);
                  setRecordOpen(false);
                }}
              >
                ×
              </button>
            </div>
            {recordPurpose === "general" && (
              <>
                <label>
                  对账房说
                  <textarea
                    value={recordInput}
                    onChange={(event) => {
                      setRecordInput(event.target.value);
                      setParseError("");
                      setAssistantAnswer("");
                    }}
                    placeholder="例如：午饭32元；或问“这周钱花哪了”"
                    rows={3}
                    autoFocus
                  />
                </label>
                <div className="quick-chips">
                  {["午饭32元", "夜宵118元", "储蓄100元", "这周钱花哪了"].map((value) => (
                    <button key={value} onClick={() => setRecordInput(value)}>{value}</button>
                  ))}
                </div>
                <div className="recorder-actions">
                  <button className="primary-button" onClick={parseRecord}>让账房识别</button>
                  <button className="secondary-button" onClick={openManualForm}>改用手动填写</button>
                </div>
                <small className="recognition-note">账房只在本机识别这段文字，不会上传你的账目内容。</small>
                {parseError && <div className="error-box" role="alert">{parseError}</div>}
                {duplicateWarning && <div className="warning-box" role="status">{duplicateWarning}</div>}
                {assistantAnswer && (
                  <div className="answer-box">
                    <span>账房答复</span>
                    <p>{assistantAnswer}</p>
                    <small>回答依据当前账簿记录。</small>
                  </div>
                )}
              </>
            )}
            {pending && (
              <div className={`confirm-card ${manualFormOpen ? "manual" : ""}`} data-testid="confirm-card">
                <span className="eyebrow">{manualFormOpen ? "手动填写 · 确认后入账" : "待确认 · 尚未入账"}</span>
                {pending.type === "储蓄" && (
                  <div className="repair-preview" data-testid="repair-preview">
                    <span>入账后的{courtVocabulary.treasury}变化</span>
                    <strong>
                      {formatMoney(treasuryBalance)} → {formatMoney(recoveryPreviewBalance)}
                    </strong>
                    <p>
                      {recoveryPreviewBalance >= 0
                        ? `${courtVocabulary.treasury}将回正，${courtVocabulary.residence}开始修复；若消费池仍超支，建设继续暂停。`
                        : `${courtVocabulary.treasury}仍未回正，还差${formatMoney(-recoveryPreviewBalance)}。`}
                    </p>
                  </div>
                )}
                <div className="confirm-grid">
                  <label>类型<select value={pending.type} onChange={(event) => setPending({ ...pending, type: event.target.value as LedgerType })}><option>支出</option><option>收入</option><option>储蓄</option></select></label>
                  <label>金额<input type="number" value={pending.amount} onChange={(event) => setPending({ ...pending, amount: Number(event.target.value) })} /></label>
                  <label>分类<select value={pending.category} onChange={(event) => setPending({ ...pending, category: event.target.value })}><option>餐饮</option><option>住房</option><option>交通</option><option>医疗</option><option>购物</option><option>娱乐</option><option>储蓄</option><option>收入</option><option>其他</option></select></label>
                  <label>时间<input value={pending.date} onChange={(event) => setPending({ ...pending, date: event.target.value })} /></label>
                </div>
                <label>备注<input value={pending.note} onChange={(event) => setPending({ ...pending, note: event.target.value })} /></label>
                <button
                  className="primary-button full"
                  disabled={isConfirming || pending.amount <= 0}
                  onClick={confirmEntry}
                  data-testid="confirm-entry"
                >
                  {isConfirming
                    ? "正在入账…"
                    : recordPurpose === "demo-recovery"
                      ? `确认记入${courtVocabulary.treasury}`
                      : pending.id
                        ? "保存修改"
                        : "确认入账"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {feedback && (
        <div className="modal-backdrop" role="presentation">
          <section
            className={`modal feedback-modal cast-${feedback.cast.length}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            data-testid="feedback-cast"
          >
            <span className="eyebrow">{feedback.title}</span>
            <h2 id="feedback-title">{feedback.fact}</h2>
            <p className="feedback-truth">数据来自你的账簿记录。</p>
            <div className="feedback-cast">
              {feedback.cast.map((role) => (
                <article
                  className={`feedback-role-card feedback-role-${role.kind}`}
                  data-role-kind={role.kind}
                  data-role-name={role.name}
                  key={`${role.kind}-${role.name}-${role.tone}`}
                >
                  <div className="feedback-role-identity">
                    <NpcPortrait
                      kind={role.kind}
                      name={role.name}
                      mood={role.mood}
                      rank={state.profile.rank}
                      presentation={state.profile.presentation}
                    />
                    <span className="npc-name">{role.name}</span>
                  </div>
                  <div className="feedback-role-dialogue">
                    <p>“{role.line}”</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => {
                  if (feedback.nextTab) setTab(feedback.nextTab);
                  setFeedback(null);
                }}
              >
                {feedback.buttonLabel ?? "记好了"}
              </button>
            </div>
          </section>
        </div>
      )}

      {riskOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className={`modal risk-modal cast-${currentRiskCast.length}`} role="dialog" aria-modal="true" aria-labelledby="risk-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{courtVocabulary.emergency} · 钱粮告警</span>
                <h2 id="risk-title">{currentRiskTitle}</h2>
              </div>
              <button className="icon-button" aria-label="关闭风险奏折" onClick={() => { setReferenceNotice(""); setRiskOpen(false); }}>×</button>
            </div>
            <div className="risk-facts">
              <div><span>总支出 / 消费池</span><strong>{formatMoney(expenseTotal)} / {formatMoney(state.profile.disposable)}</strong></div>
              <div><span>消费池超支</span><strong>{formatMoney(overspend)}</strong></div>
              <div><span>{courtVocabulary.treasury}账面</span><strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong></div>
            </div>
            <p className="risk-summary">{currentRiskFact}</p>
            <div className="feedback-cast risk-cast" data-testid="risk-cast">
              {currentRiskCast.map((role) => (
                <article
                  className={`risk-role-card risk-role-${role.kind}`}
                  data-testid="risk-role-card"
                  data-role-kind={role.kind}
                  data-role-name={role.name}
                  key={`${role.kind}-${role.name}-${role.tone}`}
                >
                  <div className="risk-role-identity">
                    <NpcPortrait
                      kind={role.kind}
                      name={role.name}
                      mood={role.mood}
                      rank={state.profile.rank}
                      presentation={state.profile.presentation}
                    />
                    <span className="npc-name">{role.name}</span>
                  </div>
                  <div className="risk-role-dialogue">
                    <p>“{role.line}”</p>
                  </div>
                </article>
              ))}
            </div>
            {renderCurrentReferenceCard("risk")}
            {referenceNotice && <div className="warning-box" role="status">{referenceNotice}</div>}
            {!riskDetail ? (
              <div className="decision-list">
                <button onClick={() => setRiskDetail(true)}><span>调阅{leadingCategory.key}三笔主要支出</span><b>查看</b></button>
                <button onClick={() => openReferenceEditor("risk")} data-testid="open-risk-reference-editor">
                  <span>
                    {isBudgetKey(leadingCategory.key)
                      ? `${currentReference ? "编辑" : "设置"}下周期${leadingCategory.key}参考额度`
                      : "先补充待分类支出的分类"}
                  </span>
                  <b>{currentReference ? "已保存" : isBudgetKey(leadingCategory.key) ? "设置" : "补充分类"}</b>
                </button>
                <button onClick={() => saveRiskDecision("维持现状，继续观察")}><span>暂不处理</span><b>选择</b></button>
              </div>
            ) : (
              <div className="risk-detail-list">
                {riskItems.map((item) => (
                  <div key={`${item.label}-${item.amount}`}>
                    <span>{item.label}</span><strong>{formatMoney(item.amount)}</strong>
                  </div>
                ))}
                <button className="primary-button full" onClick={() => saveRiskDecision(`先查看三笔主要${leadingCategory.key}支出`)}>
                  保存为议事备忘
                </button>
              </div>
            )}
            <small className="modal-footnote">“{courtVocabulary.treasury}”只记录账面变化，不会发生真实扣款或资金划转。</small>
          </section>
        </div>
      )}

      {referenceEditor && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-editor-title"
            data-testid="next-cycle-reference-editor"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">下周期草案 · 不改变本期</span>
                <h2 id="reference-editor-title">设置{referenceEditor.category}参考额度</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭参考额度设置"
                onClick={() => {
                  setReferenceEditor(null);
                  setReferenceError("");
                }}
              >
                ×
              </button>
            </div>
            <div className="info-box">
              <span>
                本期额度 {formatMoney(state.budgets[referenceEditor.category].limit)}
                {" · "}本期已用 {formatMoney(state.budgets[referenceEditor.category].used)}
              </span>
              <small>保存后只形成下周期参考草案，不会重新计算本期风险或{courtVocabulary.treasury}账面。</small>
            </div>
            <label>
              下周期参考额度
              <span className="input-with-prefix">
                <b>¥</b>
                <input
                  value={referenceAmountInput}
                  inputMode="numeric"
                  autoFocus
                  aria-invalid={Boolean(referenceError)}
                  onChange={(event) => {
                    setReferenceAmountInput(event.target.value);
                    setReferenceError("");
                  }}
                  data-testid="next-cycle-reference-amount"
                />
              </span>
            </label>
            {referenceError && <div className="error-box" role="alert">{referenceError}</div>}
            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => {
                  setReferenceEditor(null);
                  setReferenceError("");
                }}
              >
                取消
              </button>
              {state.nextCycleReferences[referenceEditor.category] && (
                <button className="danger-button" onClick={deleteNextCycleReference} data-testid="delete-next-cycle-reference">
                  删除草案
                </button>
              )}
              <button className="primary-button" onClick={saveNextCycleReference} data-testid="save-next-cycle-reference">
                保存草案
              </button>
            </div>
          </section>
        </div>
      )}

      {promotionOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal compact promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
            <PromotionEdict
              rank={state.profile.rank}
              presentation={state.profile.presentation}
            />
            <button className="primary-button full" onClick={() => { setPromotionOpen(false); setTab("home"); }}>
              领旨，前往{currentRankConfig.residenceName}
            </button>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading">
              <div><span className="eyebrow">账本设置</span><h2 id="settings-title">设置与模式</h2></div>
              <button className="icon-button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="settings-list">
              <section className="settings-control" aria-labelledby="council-cadence-title">
                <div>
                  <strong id="council-cadence-title">朝会频率</strong>
                  <small>完成后按所选周期锁定，新增储蓄不会重复解锁。</small>
                </div>
                <div className="settings-segment" role="group" aria-label="选择朝会频率">
                  {(["daily", "weekly"] as CouncilCadence[]).map((cadence) => (
                    <button
                      key={cadence}
                      className={state.councilCadence === cadence ? "selected" : ""}
                      aria-pressed={state.councilCadence === cadence}
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          councilCadence: cadence,
                        }))
                      }
                      data-testid={`council-cadence-${cadence}`}
                    >
                      {getCouncilCadenceLabel(cadence)}
                    </button>
                  ))}
                </div>
              </section>
              <button onClick={() => { setSettingsOpen(false); onExitMode(); }}>切换账本</button>
              {mode === "demo" && (
                <button
                  onClick={() => {
                    onResetDemo();
                    setPreviewRank("county");
                    setPreviewRoom("hall");
                    setPreviewFiscalState("stable");
                    setRankAtlasOpen(false);
                    setIsFinishingCouncil(false);
                    setSettingsOpen(false);
                    setTab("home");
                  }}
                >
                  重新开始体验
                </button>
              )}
              {mode === "real" && (
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setClearBookOpen(true);
                  }}
                >
                  清空我的账本
                </button>
              )}
            </div>
            <p className="boundary-note">数据仅保存在此浏览器。清除浏览器数据或更换设备后将无法恢复。</p>
          </section>
        </div>
      )}

      {clearBookOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-book-title"
            data-testid="clear-book-confirmation"
          >
            <span className="eyebrow">危险操作 · 清空后不可恢复</span>
            <h2 id="clear-book-title">确认清空整个本地账本？</h2>
            <p>这会删除本机浏览器里的身份、预算、流水、议事记录、官阶和建设进度，不会影响演示账本。</p>
            <div className="button-row">
              <button
                className="secondary-button"
                autoFocus
                onClick={() => setClearBookOpen(false)}
              >
                取消
              </button>
              <button
                className="danger-button"
                data-testid="confirm-clear-book"
                onClick={() => {
                  window.localStorage.removeItem(realStorageKey);
                  setClearBookOpen(false);
                  onExitMode();
                }}
              >
                确认清空
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <span className="eyebrow">删除账目 · 删除后不可恢复</span>
            <h2 id="delete-title">确认删除“{deleteTarget.note}”？</h2>
            <p>
              删除后，这笔账会从{deleteTarget.category}预算和总支出中移除，相关提醒也会更新。
            </p>
            <div className="button-row">
              <button className="secondary-button" autoFocus onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="danger-button" onClick={confirmDelete}>确认删除</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [state, setState] = useState<PrototypeState>(createDemoState());

  const chooseMode = (selected: Mode) => {
    if (selected === "demo") {
      try {
        const saved = window.localStorage.getItem(demoStorageKey);
        setState(
          saved
            ? hydratePrototypeState(JSON.parse(saved) as PrototypeState)
            : createDemoState(),
        );
      } catch {
        setState(createDemoState());
      }
    } else {
      try {
        const saved = window.localStorage.getItem(realStorageKey);
        setState(
          saved
            ? hydratePrototypeState(JSON.parse(saved) as PrototypeState)
            : createBlankRealState(),
        );
      } catch {
        setState(createBlankRealState());
      }
    }
    setMode(selected);
  };

  if (!mode) {
    return <ModeChooser onChoose={chooseMode} />;
  }

  if (mode === "real" && !state.profile.onboarded) {
    return (
      <Onboarding
        onExit={() => setMode(null)}
        onFinish={(nextState) => {
          setState(nextState);
          window.localStorage.setItem(realStorageKey, JSON.stringify(nextState));
        }}
      />
    );
  }

  return (
    <AppShell
      mode={mode}
      state={state}
      setState={setState}
      onExitMode={() => setMode(null)}
      onResetDemo={() => {
        const reset = createDemoState();
        window.localStorage.setItem(demoStorageKey, JSON.stringify(reset));
        setState(reset);
      }}
    />
  );
}
