"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { getCourtVocabulary } from "../lib/court";
import {
  MAX_NEXT_CYCLE_REFERENCE,
  parseNextCycleReferenceAmount,
} from "../lib/reference";

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

const getCourtRoles = (rank: string) => {
  if (rank === "巡抚") {
    return {
      comic: "行辕总管",
      advisor: "督府参议",
      companion: "随行知己",
      council: "督府议事",
    };
  }
  if (rank === "知府") {
    return {
      comic: "府衙掌事",
      advisor: "州府长史",
      companion: "随行知己",
      council: "州府朝会",
    };
  }
  return {
    comic: "钱粮小吏",
    advisor: "县丞",
    companion: "掌灯知己",
    council: "县署朝会",
  };
};

type RankTheme = "county" | "prefecture" | "governor";

const getRankTheme = (rank: string): RankTheme =>
  rank === "巡抚" ? "governor" : rank === "知府" ? "prefecture" : "county";

const getRankScene = (rank: string) =>
  rank === "巡抚" ? "督府议政厅" : rank === "知府" ? "州府大堂" : "初任县衙";

function NpcPortrait({
  kind,
  name,
  compact = false,
  mood = "neutral",
}: {
  kind: FeedbackRole["kind"];
  name: string;
  compact?: boolean;
  mood?: NpcMood;
}) {
  return (
    <span
      className={`npc-portrait npc-${kind} npc-mood-${mood} ${compact ? "compact" : ""}`}
      data-mood={mood}
      role="img"
      aria-label={`${name}角色立绘`}
    >
      {/* Standalone local character canvases need direct object-fit control in every modal shape. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/npc/${kind}-${mood}.png`}
        alt=""
        aria-hidden="true"
      />
    </span>
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
      address: form.address || "大人",
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
  fiscalState,
  treasuryBalance,
  recovering = false,
}: {
  rank: string;
  fiscalState: FiscalState;
  treasuryBalance: number;
  recovering?: boolean;
}) {
  const vocabulary = getCourtVocabulary(rank);
  const rankTheme = getRankTheme(rank);
  const displayScene = getRankScene(rank);
  const fiscalLabel =
    recovering
      ? `${vocabulary.residence}修复中`
      : fiscalState === "deficit"
        ? `${vocabulary.treasury}告急`
        : fiscalState === "strained"
          ? "消费预算超支"
          : "财政平稳";
  const sceneCopy =
    recovering
      ? "工匠正在补瓦修窗，灯火与花木逐步恢复"
      : fiscalState === "deficit"
        ? `${vocabulary.treasury}账面为负，陈设典卖、庭院荒废`
        : fiscalState === "strained"
          ? `本周期消费预算已超支，扩建停工、部分陈设收起`
          : "灯火齐明、花木繁盛，官署与营造项目照常推进";
  return (
    <div
      className={`world-scene rank-theme-${rankTheme} ${fiscalState} ${recovering ? "recovering" : ""}`}
      data-fiscal-state={fiscalState}
      data-transition={recovering ? "recovery" : undefined}
      aria-label={`${displayScene}，${fiscalLabel}`}
    >
      <div className="world-scene-art" aria-hidden="true" />
      <div className="world-scene-shade" aria-hidden="true" />
      <div className="world-scene-topline">
        <span className="scene-rank">{rank}</span>
        <span className={`fiscal-state-label ${fiscalState}`}>{fiscalLabel}</span>
      </div>
      <div className="world-scene-caption">
        <div>
          <span>当前{vocabulary.residence}</span>
          <strong>{displayScene}</strong>
          <small>{sceneCopy}</small>
        </div>
        <div className="scene-treasury">
          <span>{vocabulary.treasury}账面</span>
          <strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong>
        </div>
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
  const [councilStep, setCouncilStep] = useState(0);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerItem | null>(null);
  const [recoveryEvent, setRecoveryEvent] = useState<RecoveryEvent | null>(null);
  const [referenceEditor, setReferenceEditor] = useState<{
    category: BudgetKey;
    source: NextCycleReference["source"];
  } | null>(null);
  const [referenceAmountInput, setReferenceAmountInput] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [referenceNotice, setReferenceNotice] = useState("");
  const confirmLock = useRef(false);

  useEffect(() => {
    if (state.profile.onboarded) {
      const key = mode === "real" ? realStorageKey : demoStorageKey;
      window.localStorage.setItem(key, JSON.stringify(state));
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
      else if (deleteTarget) setDeleteTarget(null);
      else if (settingsOpen) setSettingsOpen(false);
      else if (riskOpen) { setRiskOpen(false); setRiskDetail(false); }
      else if (feedback) setFeedback(null);
      else if (recordOpen) {
        confirmLock.current = false;
        setManualFormOpen(false);
        setRecordOpen(false);
      }
      else if (promotionOpen) setPromotionOpen(false);
    };
    window.addEventListener("keydown", closeTopDialog);
    return () => window.removeEventListener("keydown", closeTopDialog);
  }, [deleteTarget, feedback, promotionOpen, recordOpen, referenceEditor, riskOpen, settingsOpen]);

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
  const hasCategoryAlert = leadingCategory.percent >= 90;
  const hasRisk = overspend > 0 || (state.riskTriggered && hasCategoryAlert);
  const riskLevel: "near" | "overspent" | "deficit" =
    treasuryBalance < 0 ? "deficit" : overspend > 0 ? "overspent" : "near";
  const courtAddress = state.profile.address || "大人";
  const courtRoles = getCourtRoles(state.profile.rank);
  const courtVocabulary = getCourtVocabulary(state.profile.rank);
  const currentRiskTitle =
    riskLevel === "deficit"
      ? `${courtVocabulary.treasury}告急，${courtVocabulary.residence}陈设待典`
      : riskLevel === "overspent"
        ? "本周期消费预算已经超支"
        : leadingCategory.key === "其他"
          ? "有一笔支出还未归类"
          : `${leadingCategory.bureau}用度告急`;
  const currentRiskFact =
    riskLevel === "deficit"
      ? `本周期支出 ${formatMoney(expenseTotal)}，超过消费池 ${formatMoney(overspend)}；${courtVocabulary.treasury}账面 ${formatMoney(treasuryBalance)}`
      : riskLevel === "overspent"
        ? `本周期支出 ${formatMoney(expenseTotal)}，超过消费池 ${formatMoney(overspend)}；${courtVocabulary.treasury}账面剩余 ${formatMoney(treasuryBalance)}`
        : leadingCategory.key === "其他"
          ? `待分类支出 ${formatMoney(leadingCategory.used)} 已计入本周期总支出；消费池仍余 ${formatMoney(remaining)}`
          : `${leadingCategory.key}已用 ${formatMoney(leadingCategory.used)} / ${formatMoney(leadingCategory.limit)}（${leadingCategory.percent}%）；消费池仍余 ${formatMoney(remaining)}`;
  const currentRiskMood: NpcMood =
    riskLevel === "deficit" ? "alarm" : "warning";
  const currentReference =
    isBudgetKey(leadingCategory.key)
      ? state.nextCycleReferences[leadingCategory.key]
      : undefined;
  const currentRiskCast: FeedbackRole[] =
    riskLevel === "near"
      ? [
          {
            mark: "急",
            kind: "comic",
            name: courtRoles.comic,
            tone: "急报",
            mood: currentRiskMood,
            line:
              leadingCategory.key === "其他"
                ? `${courtAddress}！账房里多出一笔还没归部的支出，小的先记进总账啦！`
                : `${courtAddress}！${leadingCategory.bureau}的牌子快见底啦，已经用到${leadingCategory.percent}%了！`,
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
                ? `${courtAddress}！不好啦！${courtVocabulary.treasury}已经见底，门房正抱着典当清册跑来请示——再这么花，${courtVocabulary.residence}的屏风真要抬出门啦！`
                : `${courtAddress}！本周期用度越过消费池，已经动到${courtVocabulary.treasury}${formatMoney(overspend)}啦！`,
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
  const bookkeepingScore = Math.min(
    25,
    state.ledger.filter((item) => item.type === "支出").length * 5,
  );
  const budgetScore = treasuryBalance < 0 ? 5 : overspend > 0 ? 12 : 20;
  const councilScore = 25;
  const savingsScore = state.ledger.some((item) => item.type === "储蓄") ? 10 : 0;
  const weeklyMerit = bookkeepingScore + budgetScore + councilScore + savingsScore;

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

  const confirmEntry = () => {
    if (!pending || pending.amount <= 0 || confirmLock.current) return;
    confirmLock.current = true;
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
              ? `${courtAddress}！${courtVocabulary.treasury}终于翻回正数，屋瓦补上了，廊下的灯也重新亮啦！当前账面为${formatMoney(projectedTreasury)}。`
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
          { mark: "吏", kind: "comic", name: courtRoles.comic, tone: "报喜", mood: "success", line: "大人，新进的钱已经记清，小的绝不擅自往任何库房里塞！" },
          { mark: "策", kind: "advisor", name: courtRoles.advisor, tone: "提醒", mood: "success", line: `这笔收入目前尚未分入消费池或${courtVocabulary.treasury}，请记得重新安排。` },
        ],
      });
    } else {
      setFeedback({
        title: "这笔账已经记好",
        fact: `${pending.note} ${formatMoney(pending.amount)} 已确认入账`,
        cast: [
          { mark: "吏", kind: "comic", name: courtRoles.comic, tone: "回报", mood: "success", line: `${courtAddress}，${pending.note}这笔已经归进${pending.category}，小的连一文都没抄错！` },
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
      setReferenceNotice("请先在最近流水中为待分类支出补充分类，归类后才能设置对应分类的下周期参考额。");
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
    if (state.councilDone) return;
    if (mode === "demo") {
      setState((current) => ({
        ...current,
        councilDone: true,
        councilDecision: current.councilDecision || "下周期先查看三笔主要餐饮支出",
        profile: {
          ...current.profile,
          rank: "知府",
          merit: weeklyMerit,
          scene: "州府大堂",
        },
      }));
      setPromotionOpen(true);
    } else {
      setState((current) => ({
        ...current,
        councilDone: true,
        councilDecision: current.councilDecision || "本次奏报维持现状",
        profile: { ...current.profile, merit: Math.min(160, current.profile.merit + weeklyMerit) },
      }));
    }
    setCouncilStep(0);
  };

  const renderHome = () => (
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
            fiscalState={fiscalState}
            treasuryBalance={treasuryBalance}
            recovering={Boolean(recoveryEvent)}
          />
        </div>
        <div className="status-column">
          <div className="rank-card">
            <span className="eyebrow">当前官阶</span>
            <strong>{state.profile.rank}</strong>
            <p>{state.profile.name} · {state.profile.address}</p>
            <div className="progress-line"><span style={{ width: `${Math.min(100, (state.profile.merit / (state.profile.rank === "从九品县令" ? 50 : 160)) * 100)}%` }} /></div>
            <small>政绩 {state.profile.merit} / {state.profile.rank === "从九品县令" ? 50 : 160}</small>
          </div>
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
              <NpcPortrait compact key={role.name} kind={role.kind} name={role.name} mood={role.mood} />
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
          <NpcPortrait compact kind="comic" name={courtRoles.comic} mood="neutral" />
          <div>
            <span className="eyebrow">{courtRoles.comic} · 候命</span>
            <h2>账簿已经铺好，等大人落下第一笔</h2>
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

  const renderTreasury = () => (
    <div className="page-stack">
      <section className="page-title">
        <div><span className="eyebrow">本周期钱粮</span><h1>{courtVocabulary.treasury}账簿</h1></div>
        <button className="primary-button" onClick={() => openRecorder()}>＋ 记一笔</button>
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
    if (!hasEnoughData) {
      return (
        <div className="page-stack">
          <section className="page-title"><div><span className="eyebrow">有账目后即可开议</span><h1>{courtRoles.council}</h1></div></section>
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
          <section className="council-stage">
            <div className="council-content">
              <NpcPortrait compact kind="advisor" name={courtRoles.advisor} mood="success" />
              <p className="eyebrow">最近一次议事备忘</p>
              <h2>{state.councilDecision || "本次未保留下周期行动草案"}</h2>
              <p>本次政绩已经入账，议事备忘会保留供你回看。</p>
              <div className="report-grid">
                <div><span>累计政绩</span><strong>{state.profile.merit}</strong></div>
                <div><span>当前官阶</span><strong>{state.profile.rank}</strong></div>
                <div><span>{leadingCategory.key}进度</span><strong>{leadingCategory.percent}%</strong></div>
              </div>
              {renderCurrentReferenceCard("council")}
              <button className="primary-button" onClick={() => setTab("home")}>返回{courtVocabulary.residence}</button>
            </div>
          </section>
        </div>
      );
    }
    return (
      <div className="page-stack">
        <section className="page-title">
          <div><span className="eyebrow">本次账情奏报</span><h1>{courtRoles.council}</h1></div>
          <span className="status-pill">{mode === "demo" ? "体验奏报 · 可立即开议" : "随时可以开议"}</span>
        </section>
        <section className="council-stage">
          <div className="council-steps">
            {["开议", "财政汇报", "核心议题", "政绩结算"].map((label, index) => (
              <span className={index <= councilStep ? "active" : ""} key={label}>{index + 1}. {label}</span>
            ))}
          </div>
          {councilStep === 0 && (
            <div className="council-content">
              <NpcPortrait compact kind="advisor" name={courtRoles.advisor} mood="council" />
              <p className="eyebrow">{courtRoles.advisor}主持</p>
              <h2>当前账本已经核清，请大人自主开议</h2>
              <p>何时开议都不会扣分；完成后，本次政绩只结算一次。</p>
              <button className="primary-button" onClick={() => setCouncilStep(1)} data-testid="start-council">
                开启本次朝会
              </button>
            </div>
          )}
          {councilStep === 1 && (
            <div className="council-content">
              <NpcPortrait compact kind="advisor" name={courtRoles.advisor} mood="council" />
              <p className="eyebrow">{courtRoles.advisor}呈报 · 本次账情</p>
              <h2>本周期已记录支出 {formatMoney(expenseTotal)}</h2>
              <div className="report-grid">
                <div><span>消费池</span><strong>{formatMoney(state.profile.disposable)}</strong></div>
                <div><span>总支出</span><strong>{formatMoney(expenseTotal)}</strong></div>
                <div><span>{courtVocabulary.treasury}账面</span><strong className={treasuryBalance < 0 ? "negative-text" : ""}>{formatMoney(treasuryBalance)}</strong></div>
              </div>
              <p className="quote-line">{courtRoles.advisor}：“{leadingCategory.key}预算已使用{leadingCategory.percent}%；消费池差额为{formatMoney(remaining)}。建议先从金额最高的几笔查起。”</p>
              <button className="primary-button" onClick={() => setCouncilStep(2)}>查看核心议题</button>
            </div>
          )}
          {councilStep === 2 && (
            <div className="council-content">
              <NpcPortrait compact kind="companion" name={courtRoles.companion} mood="council" />
              <p className="eyebrow">只处理一个最重要的问题</p>
              <h2>下周期想怎样处理{leadingCategory.key}节奏？</h2>
              <p>你的选择会写入本次议事备忘，供下次奏报回看。</p>
              <div className="decision-list">
                <button
                  className={state.councilDecision === `先查看三笔主要${leadingCategory.key}支出` ? "selected" : ""}
                  onClick={() => {
                    setReferenceNotice("");
                    setState((current) => ({
                      ...current,
                      councilDecision: `先查看三笔主要${leadingCategory.key}支出`,
                    }));
                  }}
                >
                  <span>先查看三笔主要{leadingCategory.key}支出</span>
                  <b>{state.councilDecision === `先查看三笔主要${leadingCategory.key}支出` ? "已选择" : "选择"}</b>
                </button>
                <button
                  className={state.councilDecision.startsWith(`下周期${leadingCategory.key}参考额度`) ? "selected" : ""}
                  onClick={() => openReferenceEditor("council")}
                  data-testid="open-council-reference-editor"
                >
                  <span>
                    {isBudgetKey(leadingCategory.key)
                      ? `${currentReference ? "编辑" : "设置"}下周期${leadingCategory.key}参考额度`
                      : "先补充待分类支出的分类"}
                  </span>
                  <b>{currentReference ? "已保存" : isBudgetKey(leadingCategory.key) ? "设置" : "补充分类"}</b>
                </button>
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
              <button className="primary-button" disabled={!state.councilDecision} onClick={() => setCouncilStep(3)}>
                确认本次议事
              </button>
            </div>
          )}
          {councilStep === 3 && (
            <div className="council-content">
              <NpcPortrait compact kind="comic" name={courtRoles.comic} mood="success" />
              <p className="eyebrow">本次最高80点</p>
              <h2>政绩结算</h2>
              <div className="merit-breakdown">
                <div><span>账本秩序</span><strong>{bookkeepingScore} / 25</strong></div>
                <div><span>预算治理</span><strong>{budgetScore} / 20</strong></div>
                <div><span>完成议事</span><strong>{councilScore} / 25</strong></div>
                <div><span>储蓄习惯</span><strong>{savingsScore} / 10</strong></div>
              </div>
              <div className="total-merit"><span>本次政绩</span><strong>{weeklyMerit} / 80</strong></div>
              <button className="primary-button" onClick={finishCouncil} data-testid="finish-council">
                结算并查看晋升
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

  const renderBuild = () => {
    const currentRankIndex =
      state.profile.rank === "巡抚" ? 2 : state.profile.rank === "知府" ? 1 : 0;
    const buildFiscalLabel =
      recoveryEvent
        ? `${courtVocabulary.residence}修复中`
        : fiscalState === "deficit"
          ? `${courtVocabulary.treasury}告急`
          : fiscalState === "strained"
            ? "消费预算超支"
            : "财政平稳";
    const rankStages: Array<{
      rank: string;
      scene: string;
      theme: RankTheme;
      description: string;
      spaces: string;
    }> = [
      {
        rank: "从九品县令",
        scene: "初任县衙",
        theme: "county",
        description: "紧凑的一进县衙，正堂、县库和营造后院都从这里起步。",
        spaces: "县衙大堂 · 县库 · 县署议事厅 · 营造后院",
      },
      {
        rank: "知府",
        scene: "州府大堂",
        theme: "prefecture",
        description: "多进州府配有仪门、回廊、幕僚院和州级仓廒，治理规模明显扩大。",
        spaces: "州府大堂 · 府库 · 州府议事厅 · 营造院",
      },
      {
        rank: "巡抚",
        scene: "督府议政厅",
        theme: "governor",
        description: "督府拥有更完整的仪门轴线、辖地图亭、幕僚院和仪仗区域。",
        spaces: "督府大堂 · 藩库 · 督府议事厅 · 营造署",
      },
    ];
    return (
      <div className="page-stack">
        <section className="page-title">
          <div><span className="eyebrow">储蓄改变世界</span><h1>建设与官阶</h1></div>
          <button className="outline-button" onClick={() => openRecorder(`储蓄${Math.min(100, Math.max(1, state.profile.savingsTarget - Math.max(0, treasuryBalance)))}元`)}>
            记录一笔储蓄
          </button>
        </section>
        <section className={`construction-card ${fiscalState}`}>
          <div>
            <span className="eyebrow">{fiscalState === "deficit" ? `当前任务 · 修复${courtVocabulary.residence}` : "当前工程"}</span>
            <h2>{state.profile.savingsName}</h2>
            <p>
              {fiscalState === "deficit"
                ? `${courtVocabulary.treasury}为负时${courtVocabulary.residence}会进入破损状态；后续储蓄会先修复破损，再继续长期建设。`
                : "储蓄记录推动建设；消费池超支会改变当前场景状态。"}
            </p>
          </div>
          <div className="construction-progress">
            <strong>{savingsPercent}%</strong>
            <div className="progress-line"><span style={{ width: `${savingsPercent}%` }} /></div>
            <span>{courtVocabulary.treasury} {formatMoney(treasuryBalance)} / 目标 {formatMoney(state.profile.savingsTarget)}</span>
            <small>目标日期：{state.profile.savingsDeadline}</small>
          </div>
        </section>
        <section className="section-card rank-world-section">
          <div className="rank-world-heading">
            <div>
              <span className="eyebrow">人物与官署共同成长</span>
              <h2>仕途图鉴</h2>
            </div>
            <p>官阶决定整座官署，储蓄解锁新的空间；财政变化会直接改变建筑、陈设、花木和人气。</p>
          </div>
          <div className="rank-world-grid">
            {rankStages.map((stage, index) => {
              const relation =
                index === currentRankIndex ? "current" : index < currentRankIndex ? "past" : "future";
              const visualState =
                relation === "current"
                  ? recoveryEvent
                    ? "recovering"
                    : fiscalState
                  : "stable";
              const status =
                relation === "current"
                  ? "当前官阶"
                  : relation === "past"
                    ? "历任官署"
                    : index === currentRankIndex + 1
                      ? "下一段仕途预览"
                      : "更高仕途预览";

              return (
                <article className={`rank-world-card ${relation}`} key={stage.rank}>
                  <div className="rank-world-visual">
                    <div
                      className={`rank-world-avatar rank-index-${index}`}
                      role="img"
                      aria-label={`${stage.rank}官服人物`}
                    />
                    <div
                      className={`rank-world-scene rank-theme-${stage.theme} ${visualState}`}
                      role="img"
                      aria-label={`${stage.scene}，${relation === "current" ? buildFiscalLabel : status}`}
                    >
                      <div className="rank-world-scene-labels">
                        <span>{status}</span>
                        <strong>{stage.scene}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="rank-world-copy">
                    <div>
                      <h3>{stage.rank}</h3>
                      <span className="rank-status">{status}</span>
                    </div>
                    <p>{stage.description}</p>
                    <small>{stage.spaces}</small>
                    {relation === "current" && (
                      <nav className="rank-room-nav" aria-label={`${stage.rank}官署空间`}>
                        <button onClick={() => setTab("home")}>进入大堂</button>
                        <button onClick={() => setTab("treasury")}>查看库房</button>
                        <button onClick={() => setTab("council")}>前往议事厅</button>
                        <button onClick={() => setTab("build")}>留在营造院</button>
                      </nav>
                    )}
                  </div>
                </article>
              );
            })}
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
            <span>{state.profile.presentation === "女性" ? "女" : state.profile.presentation === "男性" ? "男" : "人"}</span>
            <strong>{state.profile.name}</strong>
            <small>{state.profile.rank}</small>
          </div>
          <nav>
            {tabItems.map((item) => (
              <button
                key={item.key}
                className={tab === item.key ? "active" : ""}
                onClick={() => setTab(item.key)}
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

        <section className="main-content" id="main-content" tabIndex={-1}>
          {tab === "home" && renderHome()}
          {tab === "treasury" && renderTreasury()}
          {tab === "council" && renderCouncil()}
          {tab === "build" && renderBuild()}
        </section>
      </div>

      <nav className="mobile-nav" aria-label="移动端主要导航">
        {tabItems.map((item) => (
          <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
            <span>{item.mark}</span>{item.label}
          </button>
        ))}
      </nav>
      <button className="mobile-add" aria-label="记一笔" onClick={() => openRecorder()}>＋</button>

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
                  confirmLock.current = false;
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
                <small className="recognition-note">当前演示使用本地识别规则，不会上传你的账目文本。</small>
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
                <article className="feedback-role-card" key={`${role.name}-${role.tone}`}>
                  <div className="feedback-role-identity">
                    <NpcPortrait kind={role.kind} name={role.name} mood={role.mood} />
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
                  key={`${role.name}-${role.tone}`}
                >
                  <div className="risk-role-identity">
                    <NpcPortrait kind={role.kind} name={role.name} mood={role.mood} />
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
            <div className="promotion-seal">府</div>
            <span className="eyebrow">晋升诏书</span>
            <h2 id="promotion-title">政绩合格，晋升知府</h2>
            <p>当前身份、府库称谓和议事角色已经切换为知府阶段。</p>
            <div className="unlock-list"><span>✓ 知府身份</span><span>✓ 府库称谓</span><span>✓ 州府议事角色</span></div>
            <button className="primary-button full" onClick={() => { setPromotionOpen(false); setTab("home"); }}>
              返回升级后的府衙
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
              <button onClick={() => { setSettingsOpen(false); onExitMode(); }}>切换账本</button>
              {mode === "demo" && <button onClick={() => { onResetDemo(); setSettingsOpen(false); setTab("home"); }}>重新开始体验</button>}
              {mode === "real" && <button onClick={() => { window.localStorage.removeItem(realStorageKey); setSettingsOpen(false); onExitMode(); }}>清空我的账本</button>}
            </div>
            <p className="boundary-note">数据仅保存在此浏览器。清除浏览器数据或更换设备后将无法恢复。</p>
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
