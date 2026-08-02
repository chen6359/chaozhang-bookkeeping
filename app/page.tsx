"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SceneMedia } from "../components/SceneMedia";
import {
  calculateFinance,
  type FinanceSnapshot,
  type FinanceTransaction,
  type FiscalState,
} from "../lib/finance";
import {
  getCycleWeekKey,
  getHabitProgress,
  getLocalDateKey,
  getRecoverableContinuity,
  getWeeklyReviewAvailability,
  type DailyCheckIn,
  type LocalDateKey,
  type WeeklyReview as HabitWeeklyReview,
} from "../lib/habit";
import {
  calculateExpenseByCategory,
  expenseCategories,
  parseLedgerText,
  type ExpenseCategory,
  type LedgerDirection,
} from "../lib/ledger";
import { getNpcPortraitAsset } from "../lib/characters";
import { getSceneMediaAsset } from "../lib/scene-media";
import {
  getFiscalStateCopy,
  getRankConfig,
  getRankDisplayName,
  getRankPortraitAsset,
  getRoomConfig,
  rankConfigs,
  type CharacterGender,
  type FiscalStateKey,
  type RankKey,
  type RoomKey,
} from "../lib/world";

type Mode = "real" | "demo";
type TabKey = "home" | "treasury" | "council" | "build";
type ExpenseClass = "variable" | "fixed";

type LedgerItem = {
  id: string;
  direction: LedgerDirection;
  amount: number;
  category: ExpenseCategory | "收入";
  note: string;
  date: LocalDateKey;
  createdAt: string;
  expenseClass: ExpenseClass;
};

type FixedCommitment = {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  paid: boolean;
};

type DailyCheck = {
  dateKey: LocalDateKey;
  checkedAt: string | null;
  noSpendConfirmed: boolean;
};

type WeeklyReview = {
  weekKey: string;
  completedAt: string;
  selectedActionId: string;
  actionLabel: string;
  category?: ExpenseCategory;
  amount?: number;
};

type Profile = {
  name: string;
  presentation: "男性" | "女性";
  fundingLabel: "生活费" | "工资" | "本月可用资金";
  openingFunds: number;
  carriedBalance: number;
  usableCarryover: number;
  desiredRetention: number;
  cycleStartDate: LocalDateKey;
  cycleEndDate: LocalDateKey;
  reminderEnabled: boolean;
  reminderTime: string;
  onboarded: boolean;
};

type BookState = {
  version: 4;
  profile: Profile;
  ledger: LedgerItem[];
  fixedCommitments: FixedCommitment[];
  dailyChecks: DailyCheck[];
  weeklyReviews: WeeklyReview[];
  categoryReferences: Partial<Record<ExpenseCategory, number>>;
};

type PendingEntry = {
  id?: string;
  direction: LedgerDirection;
  amount: number;
  category: ExpenseCategory | "收入";
  note: string;
  date: LocalDateKey;
  expenseClass: ExpenseClass;
};

type FeedbackState = {
  title: string;
  fact: string;
  balance: number;
  safeToSpend: number;
  fiscalState: FiscalState;
};

type SetupDraft = {
  name: string;
  presentation: "男性" | "女性";
  fundingLabel: "生活费" | "工资" | "本月可用资金";
  openingFunds: string;
  carriedBalance: string;
  usableCarryover: string;
  desiredRetention: string;
  cycleStartDate: LocalDateKey;
  cycleEndDate: LocalDateKey;
  fixedName: string;
  fixedAmount: string;
  reminderEnabled: boolean;
  reminderTime: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const realStorageKey = "chaozhang-real-v4";
const demoStorageKey = "chaozhang-demo-v4";
const lastModeStorageKey = "chaozhang-last-mode-v4";
const dayMs = 86_400_000;

const tabRoom: Record<TabKey, RoomKey> = {
  home: "hall",
  treasury: "treasury",
  council: "council",
  build: "works",
};

const categoryCourtNames: Record<ExpenseCategory, string> = {
  餐饮: "膳食房",
  住房: "营造司",
  交通: "车马司",
  医疗: "医药房",
  购物: "采买司",
  娱乐: "百戏坊",
  学习: "书院",
  人情: "礼宾司",
  其他: "杂项房",
};

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatMoney(value: number, withSign = false): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const sign = normalized < 0 ? "−" : withSign && normalized > 0 ? "+" : "";
  return `${sign}¥${moneyFormatter.format(Math.abs(normalized))}`;
}

function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function toYuan(value: number): number {
  return value / 100;
}

function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function shiftDate(dateKey: string, amount: number): LocalDateKey {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}

function getCurrentCycleDates(now = new Date()): {
  start: LocalDateKey;
  end: LocalDateKey;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12);
  return {
    start: getLocalDateKey(start),
    end: getLocalDateKey(end),
  };
}

function createBlankBook(): BookState {
  const cycle = getCurrentCycleDates();
  return {
    version: 4,
    profile: {
      name: "",
      presentation: "女性",
      fundingLabel: "生活费",
      openingFunds: 0,
      carriedBalance: 0,
      usableCarryover: 0,
      desiredRetention: 0,
      cycleStartDate: cycle.start,
      cycleEndDate: cycle.end,
      reminderEnabled: false,
      reminderTime: "21:30",
      onboarded: false,
    },
    ledger: [],
    fixedCommitments: [],
    dailyChecks: [],
    weeklyReviews: [],
    categoryReferences: {},
  };
}

function createDemoBook(): BookState {
  const cycle = getCurrentCycleDates();
  const today = getLocalDateKey();
  const demoEntries: LedgerItem[] = [
    {
      id: "demo-breakfast",
      direction: "支出",
      amount: 18,
      category: "餐饮",
      note: "早餐",
      date: shiftDate(today, -3),
      createdAt: new Date().toISOString(),
      expenseClass: "variable",
    },
    {
      id: "demo-lunch",
      direction: "支出",
      amount: 32,
      category: "餐饮",
      note: "午饭",
      date: shiftDate(today, -2),
      createdAt: new Date().toISOString(),
      expenseClass: "variable",
    },
    {
      id: "demo-metro",
      direction: "支出",
      amount: 8,
      category: "交通",
      note: "地铁",
      date: shiftDate(today, -2),
      createdAt: new Date().toISOString(),
      expenseClass: "variable",
    },
    {
      id: "demo-book",
      direction: "支出",
      amount: 86,
      category: "学习",
      note: "专业书",
      date: shiftDate(today, -1),
      createdAt: new Date().toISOString(),
      expenseClass: "variable",
    },
    {
      id: "demo-friends",
      direction: "支出",
      amount: 168,
      category: "餐饮",
      note: "同学聚餐",
      date: today,
      createdAt: new Date().toISOString(),
      expenseClass: "variable",
    },
  ];
  const demoDates = [today, shiftDate(today, -1), shiftDate(today, -2), shiftDate(today, -3)];

  return {
    version: 4,
    profile: {
      name: "小林",
      presentation: "女性",
      fundingLabel: "生活费",
      openingFunds: 3000,
      carriedBalance: 200,
      usableCarryover: 0,
      desiredRetention: 500,
      cycleStartDate: cycle.start,
      cycleEndDate: cycle.end,
      reminderEnabled: true,
      reminderTime: "21:30",
      onboarded: true,
    },
    ledger: demoEntries,
    fixedCommitments: [
      {
        id: "demo-rent",
        name: "本月房租",
        amount: 900,
        category: "住房",
        paid: false,
      },
    ],
    dailyChecks: demoDates.map((dateKey) => ({
      dateKey,
      checkedAt: new Date().toISOString(),
      noSpendConfirmed: false,
    })),
    weeklyReviews: [],
    categoryReferences: {},
  };
}

function createSetupDraft(book: BookState): SetupDraft {
  const unpaid = book.fixedCommitments.find((item) => !item.paid);
  return {
    name: book.profile.name,
    presentation: book.profile.presentation,
    fundingLabel: book.profile.fundingLabel,
    openingFunds: book.profile.openingFunds
      ? String(book.profile.openingFunds)
      : "",
    carriedBalance: String(book.profile.carriedBalance || 0),
    usableCarryover: String(book.profile.usableCarryover || 0),
    desiredRetention: String(book.profile.desiredRetention || 0),
    cycleStartDate: book.profile.cycleStartDate,
    cycleEndDate: book.profile.cycleEndDate,
    fixedName: unpaid?.name ?? "",
    fixedAmount: unpaid ? String(unpaid.amount) : "",
    reminderEnabled: book.profile.reminderEnabled,
    reminderTime: book.profile.reminderTime,
  };
}

function getCycleProgress(profile: Profile): {
  elapsedDays: number;
  totalDays: number;
} {
  const start = new Date(`${profile.cycleStartDate}T12:00:00`);
  const end = new Date(`${profile.cycleEndDate}T12:00:00`);
  const now = new Date();
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const elapsedDays = Math.max(
    0,
    Math.min(totalDays, Math.floor((now.getTime() - start.getTime()) / dayMs) + 1),
  );
  return { elapsedDays, totalDays };
}

function getFinanceSnapshot(book: BookState): FinanceSnapshot {
  const transactions: FinanceTransaction[] = book.ledger.map((item) =>
    item.direction === "收入"
      ? { kind: "income", amountCents: toCents(item.amount) }
      : {
          kind: "expense",
          amountCents: toCents(item.amount),
          expenseClass: item.expenseClass,
        },
  );
  const unpaidFixedExpense = book.fixedCommitments
    .filter((item) => !item.paid)
    .reduce((sum, item) => sum + item.amount, 0);
  const cycle = getCycleProgress(book.profile);

  return calculateFinance({
    carriedBalanceCents: toCents(book.profile.carriedBalance),
    openingFundsCents: toCents(book.profile.openingFunds),
    usableCarryoverCents: toCents(
      Math.min(
        Math.max(0, book.profile.carriedBalance),
        Math.max(0, book.profile.usableCarryover),
      ),
    ),
    desiredRetentionCents: toCents(book.profile.desiredRetention),
    unpaidFixedExpenseCents: toCents(unpaidFixedExpense),
    transactions,
    elapsedDays: cycle.elapsedDays,
    totalDays: cycle.totalDays,
  });
}

function getHabitCheckIns(book: BookState): DailyCheckIn[] {
  return book.dailyChecks.map((check) => ({
    ...check,
    confirmedEntryCount: book.ledger.filter(
      (item) => item.date === check.dateKey,
    ).length,
  }));
}

function getHabitReviews(book: BookState): HabitWeeklyReview[] {
  return book.weeklyReviews.map((review) => ({
    weekKey: review.weekKey as HabitWeeklyReview["weekKey"],
    completedAt: review.completedAt,
    selectedActionId: review.selectedActionId,
  }));
}

function getSceneStyle(snapshot: FinanceSnapshot): FiscalStateKey {
  return snapshot.fiscalState;
}

function getWallpaperStyle(
  rank: RankKey,
  room: RoomKey,
  fiscalState: FiscalStateKey,
): CSSProperties {
  const media = getSceneMediaAsset(rank, room, fiscalState);
  return {
    backgroundImage: `linear-gradient(rgba(245, 237, 220, .58), rgba(245, 237, 220, .76)), url("${media.poster}")`,
    backgroundSize: media.posterBackgroundSize ?? "cover",
    backgroundPosition: media.posterBackgroundPosition ?? "center",
  };
}

function WorldScene({
  rank,
  room,
  fiscalState,
  balance,
}: {
  rank: RankKey;
  room: RoomKey;
  fiscalState: FiscalStateKey;
  balance: number;
}) {
  const rankConfig = getRankConfig(rank);
  const roomConfig = getRoomConfig(rank, room);
  const stateCopy = getFiscalStateCopy(rank, fiscalState, room);
  const media = getSceneMediaAsset(rank, room, fiscalState);

  return (
    <section className="world-scene" aria-label={`${roomConfig.name}当前状态`}>
      <SceneMedia media={media} eagerPoster={room === "hall"} />
      <div className="scene-shade" />
      <div className="scene-topline">
        <span>{roomConfig.genericName}</span>
        <strong data-state={fiscalState}>{stateCopy.label}</strong>
      </div>
      <div className="scene-copy">
        <span>{rankConfig.residenceName} · 本周期</span>
        <h2>{roomConfig.name}</h2>
        <p>{stateCopy.description}</p>
      </div>
      <div className="scene-balance">
        <span>{rankConfig.treasuryName}账面</span>
        <strong>{formatMoney(balance)}</strong>
      </div>
    </section>
  );
}

function EmptyState({
  title,
  copy,
  action,
  onAction,
}: {
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-seal">账</span>
      <strong>{title}</strong>
      <p>{copy}</p>
      <button className="secondary-button" type="button" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [book, setBook] = useState<BookState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabKey>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(() =>
    createSetupDraft(createBlankBook()),
  );
  const [setupError, setSetupError] = useState("");
  const [cycleSettingsOpen, setCycleSettingsOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordInput, setRecordInput] = useState("");
  const [recordStage, setRecordStage] = useState<"input" | "confirm">("input");
  const [recordError, setRecordError] = useState("");
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [rankArchiveOpen, setRankArchiveOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ledgerQuestion, setLedgerQuestion] = useState("");
  const [ledgerAnswer, setLedgerAnswer] = useState("");
  const [commitmentName, setCommitmentName] = useState("");
  const [commitmentAmount, setCommitmentAmount] = useState("");
  const [commitmentCategory, setCommitmentCategory] =
    useState<ExpenseCategory>("住房");
  const speechRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const lastMode = localStorage.getItem(lastModeStorageKey);
    let nextMode: Mode | null = null;
    let nextBook: BookState | null = null;
    if (lastMode === "real" || lastMode === "demo") {
      const key = lastMode === "real" ? realStorageKey : demoStorageKey;
      const stored = localStorage.getItem(key);
      nextMode = lastMode;
      nextBook =
        lastMode === "real" ? createBlankBook() : createDemoBook();
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as BookState;
          if (parsed.version === 4) nextBook = parsed;
        } catch {
          localStorage.removeItem(key);
        }
      }
    }
    const frame = window.requestAnimationFrame(() => {
      if (nextMode && nextBook) {
        setMode(nextMode);
        setBook(nextBook);
        setSetupDraft(createSetupDraft(nextBook));
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated || !mode || !book) return;
    const key = mode === "real" ? realStorageKey : demoStorageKey;
    localStorage.setItem(key, JSON.stringify(book));
    localStorage.setItem(lastModeStorageKey, mode);
  }, [book, hydrated, mode]);

  const activeBook = book ?? createBlankBook();
  const snapshot = useMemo(
    () => getFinanceSnapshot(activeBook),
    [activeBook],
  );
  const habitCheckIns = useMemo(
    () => getHabitCheckIns(activeBook),
    [activeBook],
  );
  const habitReviews = useMemo(
    () => getHabitReviews(activeBook),
    [activeBook],
  );
  const habitProgress = useMemo(
    () => getHabitProgress(habitCheckIns, habitReviews),
    [habitCheckIns, habitReviews],
  );
  const continuity = useMemo(
    () => getRecoverableContinuity(habitCheckIns),
    [habitCheckIns],
  );
  const reviewAvailability = useMemo(
    () =>
      getWeeklyReviewAvailability({
        checkIns: habitCheckIns,
        reviews: habitReviews,
        minimumValidDays: mode === "demo" ? 1 : 4,
      }),
    [habitCheckIns, habitReviews, mode],
  );
  const rank = habitProgress.rank.key as RankKey;
  const gender: CharacterGender =
    activeBook.profile.presentation === "女性" ? "female" : "male";
  const fiscalState = getSceneStyle(snapshot);
  const currentRoom = tabRoom[tab];
  const rankConfig = getRankConfig(rank);
  const portrait = getRankPortraitAsset(rank, gender, fiscalState);
  const categoryTotals = useMemo(
    () => calculateExpenseByCategory(activeBook.ledger),
    [activeBook.ledger],
  );
  const topCategories = useMemo(
    () =>
      Object.entries(categoryTotals)
        .map(([category, amount]) => ({
          category: category as ExpenseCategory,
          amount,
        }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [categoryTotals],
  );
  const today = getLocalDateKey();
  const todayLedger = activeBook.ledger.filter((item) => item.date === today);
  const todayCheck = activeBook.dailyChecks.find(
    (item) => item.dateKey === today,
  );
  const todayChecked = Boolean(
    todayCheck?.checkedAt &&
      (todayLedger.length > 0 || todayCheck.noSpendConfirmed),
  );
  const wallpaperStyle = getWallpaperStyle(rank, currentRoom, fiscalState);

  const startMode = (nextMode: Mode) => {
    const key = nextMode === "real" ? realStorageKey : demoStorageKey;
    const stored = localStorage.getItem(key);
    let nextBook = nextMode === "real" ? createBlankBook() : createDemoBook();
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as BookState;
        if (parsed.version === 4) nextBook = parsed;
      } catch {
        localStorage.removeItem(key);
      }
    }
    setMode(nextMode);
    setBook(nextBook);
    setSetupDraft(createSetupDraft(nextBook));
    setTab("home");
    setSettingsOpen(false);
  };

  const returnToModeChoice = () => {
    localStorage.removeItem(lastModeStorageKey);
    setMode(null);
    setBook(null);
    setSettingsOpen(false);
  };

  const saveSetup = (startWithRecord = false) => {
    if (!book) return;
    const openingFunds = Number(setupDraft.openingFunds);
    const carriedBalance = Number(setupDraft.carriedBalance || 0);
    const desiredRetention = Number(setupDraft.desiredRetention || 0);
    const usableCarryover = Number(setupDraft.usableCarryover || 0);
    const fixedAmount = Number(setupDraft.fixedAmount || 0);
    if (!Number.isFinite(openingFunds) || openingFunds <= 0) {
      setSetupError("请填写本周期实际可用的生活费或工资。");
      return;
    }
    if (
      !Number.isFinite(desiredRetention) ||
      desiredRetention < 0 ||
      !Number.isFinite(carriedBalance) ||
      !Number.isFinite(usableCarryover) ||
      usableCarryover < 0
    ) {
      setSetupError("请检查结转和月末留存金额。");
      return;
    }
    if (setupDraft.cycleEndDate < setupDraft.cycleStartDate) {
      setSetupError("周期结束日期不能早于开始日期。");
      return;
    }
    const nextCommitments =
      !book.profile.onboarded && fixedAmount > 0
        ? [
            ...book.fixedCommitments,
            {
              id: createId("fixed"),
              name: setupDraft.fixedName.trim() || "本月固定支出",
              amount: fixedAmount,
              category: "住房" as ExpenseCategory,
              paid: false,
            },
          ]
        : book.fixedCommitments;
    const nextBook: BookState = {
      ...book,
      profile: {
        name: setupDraft.name.trim() || "未命名大人",
        presentation: setupDraft.presentation,
        fundingLabel: setupDraft.fundingLabel,
        openingFunds,
        carriedBalance,
        usableCarryover: Math.min(
          Math.max(0, carriedBalance),
          usableCarryover,
        ),
        desiredRetention,
        cycleStartDate: setupDraft.cycleStartDate,
        cycleEndDate: setupDraft.cycleEndDate,
        reminderEnabled: setupDraft.reminderEnabled,
        reminderTime: setupDraft.reminderTime,
        onboarded: true,
      },
      fixedCommitments: nextCommitments,
    };
    setBook(nextBook);
    setSetupDraft(createSetupDraft(nextBook));
    setSetupError("");
    setCycleSettingsOpen(false);
    if (startWithRecord) {
      setRecordOpen(true);
      setRecordStage("input");
    }
  };

  const openRecorder = (entry?: LedgerItem) => {
    setRecordError("");
    setVoiceStatus("");
    if (entry) {
      setPendingEntries([
        {
          id: entry.id,
          direction: entry.direction,
          amount: entry.amount,
          category: entry.category,
          note: entry.note,
          date: entry.date,
          expenseClass: entry.expenseClass,
        },
      ]);
      setRecordInput("");
      setRecordStage("confirm");
    } else {
      setPendingEntries([]);
      setRecordInput("");
      setRecordStage("input");
    }
    setRecordOpen(true);
  };

  const recognizeEntries = () => {
    const parsed = parseLedgerText(recordInput);
    if (parsed.length === 0) {
      setRecordError("还没有识别到金额。可以试试：午饭32元，地铁4元。");
      return;
    }
    setPendingEntries(
      parsed.map((item) => ({
        direction: item.direction,
        amount: item.amount,
        category: item.category,
        note: item.note,
        date: today,
        expenseClass:
          item.direction === "支出" && item.category === "住房"
            ? "fixed"
            : "variable",
      })),
    );
    setRecordError("");
    setRecordStage("confirm");
  };

  const addPendingRow = () => {
    setPendingEntries((items) => [
      ...items,
      {
        direction: "支出",
        amount: 0,
        category: "其他",
        note: "",
        date: today,
        expenseClass: "variable",
      },
    ]);
  };

  const startVoice = () => {
    if (voiceActive) {
      speechRef.current?.stop();
      return;
    }
    const voiceWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition =
      voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("当前浏览器不支持语音识别，仍可直接输入一句话。");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? "";
      }
      setRecordInput((current) =>
        `${current}${current ? "，" : ""}${transcript}`.trim(),
      );
      setVoiceStatus("已写入原话，请确认金额后再入账。");
    };
    recognition.onerror = () => {
      setVoiceStatus("没有听清，原输入已保留，可以再说一次或手动修改。");
    };
    recognition.onend = () => setVoiceActive(false);
    speechRef.current = recognition;
    setVoiceActive(true);
    setVoiceStatus("正在听，请说“午饭32元，地铁4元”。");
    recognition.start();
  };

  const confirmEntries = () => {
    if (!book) return;
    const validEntries = pendingEntries.filter(
      (item) =>
        Number.isFinite(item.amount) &&
        item.amount > 0 &&
        item.note.trim() &&
        item.date,
    );
    if (validEntries.length !== pendingEntries.length || validEntries.length === 0) {
      setRecordError("请把每一笔的金额、名称和日期补充完整。");
      return;
    }
    const now = new Date().toISOString();
    let nextLedger = [...book.ledger];
    for (const entry of validEntries) {
      const nextItem: LedgerItem = {
        id: entry.id ?? createId("ledger"),
        direction: entry.direction,
        amount: entry.amount,
        category: entry.direction === "收入" ? "收入" : entry.category,
        note: entry.note.trim(),
        date: entry.date,
        createdAt:
          book.ledger.find((item) => item.id === entry.id)?.createdAt ?? now,
        expenseClass:
          entry.direction === "收入" ? "variable" : entry.expenseClass,
      };
      if (entry.id) {
        nextLedger = nextLedger.map((item) =>
          item.id === entry.id ? nextItem : item,
        );
      } else {
        nextLedger.push(nextItem);
      }
    }
    const dates = new Set(validEntries.map((item) => item.date));
    const nextChecks = [...book.dailyChecks];
    dates.forEach((dateKey) => {
      if (!nextChecks.some((check) => check.dateKey === dateKey)) {
        nextChecks.push({
          dateKey,
          checkedAt: null,
          noSpendConfirmed: false,
        });
      }
    });
    const nextBook = {
      ...book,
      ledger: nextLedger,
      dailyChecks: nextChecks,
    };
    const nextSnapshot = getFinanceSnapshot(nextBook);
    const totalSigned = validEntries.reduce(
      (sum, entry) =>
        sum + (entry.direction === "收入" ? entry.amount : -entry.amount),
      0,
    );
    setBook(nextBook);
    setFeedback({
      title:
        validEntries.length === 1
          ? `已记下：${validEntries[0].note}`
          : `已确认 ${validEntries.length} 笔账`,
      fact: `本次账面变化 ${formatMoney(totalSigned, true)}，所有金额已按你的确认重新计算。`,
      balance: toYuan(nextSnapshot.ledgerBalanceCents),
      safeToSpend: toYuan(nextSnapshot.rawSafeToSpendCents),
      fiscalState: nextSnapshot.fiscalState,
    });
    setRecordOpen(false);
    setRecordStage("input");
    setPendingEntries([]);
    setRecordInput("");
  };

  const deleteLedger = (item: LedgerItem) => {
    if (!book || !window.confirm(`删除“${item.note}”这笔账吗？`)) return;
    setBook({
      ...book,
      ledger: book.ledger.filter((entry) => entry.id !== item.id),
    });
  };

  const markTodayChecked = (noSpendConfirmed: boolean) => {
    if (!book) return;
    if (!noSpendConfirmed && todayLedger.length === 0) {
      openRecorder();
      return;
    }
    const next: DailyCheck = {
      dateKey: today,
      checkedAt: new Date().toISOString(),
      noSpendConfirmed,
    };
    setBook({
      ...book,
      dailyChecks: [
        ...book.dailyChecks.filter((item) => item.dateKey !== today),
        next,
      ],
    });
  };

  const addCommitment = () => {
    if (!book) return;
    const amount = Number(commitmentAmount);
    if (!commitmentName.trim() || !Number.isFinite(amount) || amount <= 0) {
      return;
    }
    setBook({
      ...book,
      fixedCommitments: [
        ...book.fixedCommitments,
        {
          id: createId("fixed"),
          name: commitmentName.trim(),
          amount,
          category: commitmentCategory,
          paid: false,
        },
      ],
    });
    setCommitmentName("");
    setCommitmentAmount("");
  };

  const payCommitment = (commitment: FixedCommitment) => {
    if (!book || commitment.paid) return;
    const nextLedger: LedgerItem[] = [
      ...book.ledger,
      {
        id: createId("ledger"),
        direction: "支出",
        amount: commitment.amount,
        category: commitment.category,
        note: commitment.name,
        date: today,
        createdAt: new Date().toISOString(),
        expenseClass: "fixed",
      },
    ];
    const nextBook = {
      ...book,
      ledger: nextLedger,
      fixedCommitments: book.fixedCommitments.map((item) =>
        item.id === commitment.id ? { ...item, paid: true } : item,
      ),
      dailyChecks: book.dailyChecks.some((item) => item.dateKey === today)
        ? book.dailyChecks
        : [
            ...book.dailyChecks,
            { dateKey: today, checkedAt: null, noSpendConfirmed: false },
          ],
    };
    const nextSnapshot = getFinanceSnapshot(nextBook);
    setBook(nextBook);
    setFeedback({
      title: `已支付：${commitment.name}`,
      fact: "待付项目已转为真实支出，账面余额和安全可花同步更新。",
      balance: toYuan(nextSnapshot.ledgerBalanceCents),
      safeToSpend: toYuan(nextSnapshot.rawSafeToSpendCents),
      fiscalState: nextSnapshot.fiscalState,
    });
  };

  const removeCommitment = (commitment: FixedCommitment) => {
    if (!book || !window.confirm(`移除待付项目“${commitment.name}”吗？`)) {
      return;
    }
    setBook({
      ...book,
      fixedCommitments: book.fixedCommitments.filter(
        (item) => item.id !== commitment.id,
      ),
    });
  };

  const askLedger = () => {
    const question = ledgerQuestion.trim();
    if (!question) return;
    if (/花哪|最多|主要/.test(question)) {
      setLedgerAnswer(
        topCategories.length
          ? `本周期金额最高的是${topCategories
              .slice(0, 3)
              .map((item) => `${item.category}${formatMoney(item.amount)}`)
              .join("、")}。`
          : "本周期还没有支出记录。",
      );
      return;
    }
    if (/还能花|可花|剩多少/.test(question)) {
      setLedgerAnswer(
        `按已记录账目、月末留存和未付固定支出估算，现在安全可花 ${formatMoney(
          toYuan(snapshot.rawSafeToSpendCents),
        )}。`,
      );
      return;
    }
    setLedgerAnswer(
      `本周期已记录支出 ${formatMoney(
        toYuan(snapshot.transactions.netExpenseCents),
      )}，账面余额 ${formatMoney(toYuan(snapshot.ledgerBalanceCents))}。`,
    );
  };

  const getReviewIssue = () => {
    const top = topCategories[0];
    if (snapshot.rawSafeToSpendCents < 0) {
      return {
        category: top?.category ?? ("其他" as ExpenseCategory),
        title: `安全可花已少于 0 元`,
        detail: `在保留月末目标和未付固定支出后，当前缺口为 ${formatMoney(
          toYuan(snapshot.safetyShortfallCents),
        )}。`,
      };
    }
    if (top) {
      const count = activeBook.ledger.filter(
        (item) => item.direction === "支出" && item.category === top.category,
      ).length;
      return {
        category: top.category,
        title: `本周先看${top.category}`,
        detail: `${count} 笔共 ${formatMoney(top.amount)}，是当前金额最高的支出方向。`,
      };
    }
    return {
      category: "其他" as ExpenseCategory,
      title: "本周账目还不够形成判断",
      detail: "先补齐本周账目，下次复盘再给出调整。",
    };
  };

  const saveReviewAction = (
    actionId: string,
    actionLabel: string,
    category?: ExpenseCategory,
    amount?: number,
  ) => {
    if (!book) return;
    const weekKey = getCycleWeekKey();
    const nextReferences = { ...book.categoryReferences };
    if (category && amount) nextReferences[category] = amount;
    setBook({
      ...book,
      profile:
        actionId === "daily-reminder"
          ? { ...book.profile, reminderEnabled: true }
          : book.profile,
      weeklyReviews: [
        ...book.weeklyReviews.filter((item) => item.weekKey !== weekKey),
        {
          weekKey,
          completedAt: new Date().toISOString(),
          selectedActionId: actionId,
          actionLabel,
          category,
          amount,
        },
      ],
      categoryReferences: nextReferences,
    });
    setReviewOpen(false);
  };

  const resetCurrentMode = () => {
    if (!mode || !window.confirm("重置当前账本后，本模式中的记录会被清空。继续吗？")) {
      return;
    }
    const key = mode === "real" ? realStorageKey : demoStorageKey;
    localStorage.removeItem(key);
    const nextBook = mode === "real" ? createBlankBook() : createDemoBook();
    setBook(nextBook);
    setSetupDraft(createSetupDraft(nextBook));
    setTab("home");
    setSettingsOpen(false);
  };

  if (!hydrated) {
    return (
      <main className="loading-screen">
        <span className="brand-seal">账</span>
        <p>正在打开账本…</p>
      </main>
    );
  }

  if (!mode || !book) {
    const welcomeMedia = getSceneMediaAsset("county", "hall", "stable");
    return (
      <main className="welcome-screen">
        <SceneMedia media={welcomeMedia} eagerPoster />
        <div className="welcome-shade" />
        <section className="welcome-panel">
          <span className="welcome-kicker">从一笔真实消费开始</span>
          <h1>朝账</h1>
          <p className="welcome-lead">
            十秒记下收支，看清这个月还剩多少；每周只处理一个真正需要调整的问题。
          </p>
          <div className="welcome-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => startMode("real")}
            >
              建立我的账本
            </button>
            <button
              className="secondary-button light"
              type="button"
              onClick={() => startMode("demo")}
            >
              先体验演示账本
            </button>
          </div>
          <p className="privacy-note">数据只保存在当前浏览器，不连接银行卡。</p>
        </section>
      </main>
    );
  }

  if (!book.profile.onboarded) {
    return (
      <main className="setup-screen">
        <section className="setup-panel">
          <div className="setup-heading">
            <span className="brand-seal">账</span>
            <div>
              <span className="eyebrow">先定清楚这个月的钱</span>
              <h1>建立第一本朝账</h1>
            </div>
          </div>
          <p className="setup-intro">
            这里填写的是你本周期真实可用的生活费或工资。以后每一笔支出都会从账面余额中减去。
          </p>
          <div className="form-grid">
            <label>
              <span>怎么称呼你</span>
              <input
                value={setupDraft.name}
                placeholder="例如：小林"
                onChange={(event) =>
                  setSetupDraft({ ...setupDraft, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>主人物形象</span>
              <select
                value={setupDraft.presentation}
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    presentation: event.target.value as "男性" | "女性",
                  })
                }
              >
                <option value="女性">女性</option>
                <option value="男性">男性</option>
              </select>
            </label>
            <label>
              <span>本周期资金来源</span>
              <select
                value={setupDraft.fundingLabel}
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    fundingLabel: event.target.value as Profile["fundingLabel"],
                  })
                }
              >
                <option value="生活费">生活费</option>
                <option value="工资">工资</option>
                <option value="本月可用资金">本月可用资金</option>
              </select>
            </label>
            <label>
              <span>{setupDraft.fundingLabel}金额</span>
              <div className="money-input">
                <b>¥</b>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={setupDraft.openingFunds}
                  placeholder="3000"
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      openingFunds: event.target.value,
                    })
                  }
                />
              </div>
            </label>
            <label>
              <span>上期结转</span>
              <div className="money-input">
                <b>¥</b>
                <input
                  type="number"
                  inputMode="decimal"
                  value={setupDraft.carriedBalance}
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      carriedBalance: event.target.value,
                    })
                  }
                />
              </div>
              <small>可以是负数；不会由系统自动补齐。</small>
            </label>
            <label>
              <span>结转中允许本月动用</span>
              <div className="money-input">
                <b>¥</b>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={setupDraft.usableCarryover}
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      usableCarryover: event.target.value,
                    })
                  }
                />
              </div>
              <small>不填写即默认保护正数结转。</small>
            </label>
            <label>
              <span>月末希望留下</span>
              <div className="money-input">
                <b>¥</b>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={setupDraft.desiredRetention}
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      desiredRetention: event.target.value,
                    })
                  }
                />
              </div>
              <small>这是目标，不是一笔“存款”交易；可以填 0。</small>
            </label>
            <label>
              <span>本月待付固定支出（可选）</span>
              <input
                value={setupDraft.fixedName}
                placeholder="例如：房租"
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    fixedName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>固定支出金额（可选）</span>
              <div className="money-input">
                <b>¥</b>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={setupDraft.fixedAmount}
                  placeholder="800"
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      fixedAmount: event.target.value,
                    })
                  }
                />
              </div>
            </label>
            <label>
              <span>周期开始</span>
              <input
                type="date"
                value={setupDraft.cycleStartDate}
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    cycleStartDate: event.target.value as LocalDateKey,
                  })
                }
              />
            </label>
            <label>
              <span>周期结束</span>
              <input
                type="date"
                value={setupDraft.cycleEndDate}
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    cycleEndDate: event.target.value as LocalDateKey,
                  })
                }
              />
            </label>
          </div>
          <label className="reminder-row">
            <input
              type="checkbox"
              checked={setupDraft.reminderEnabled}
              onChange={(event) =>
                setSetupDraft({
                  ...setupDraft,
                  reminderEnabled: event.target.checked,
                })
              }
            />
            <span>
              每天
              <input
                type="time"
                value={setupDraft.reminderTime}
                disabled={!setupDraft.reminderEnabled}
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    reminderTime: event.target.value,
                  })
                }
              />
              提醒我核对当天账目
            </span>
          </label>
          <div className="formula-note">
            <strong>安全可花</strong>
            <span>账面余额 − 月末希望留下 − 未支付固定支出</span>
          </div>
          {setupError && <p className="form-error">{setupError}</p>}
          <button
            className="primary-button full"
            type="button"
            onClick={() => saveSetup(true)}
          >
            建立账本并记第一笔
          </button>
          <button
            className="text-button"
            type="button"
            onClick={returnToModeChoice}
          >
            返回模式选择
          </button>
        </section>
      </main>
    );
  }

  const reviewIssue = getReviewIssue();
  const reviewReference = Math.max(
    50,
    Math.round((categoryTotals[reviewIssue.category] || 100) * 0.85 / 10) * 10,
  );
  const latestReview = [...book.weeklyReviews]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const npcMood =
    fiscalState === "stable"
      ? "success"
      : fiscalState === "strained"
        ? "warning"
        : "alarm";
  const messenger = getNpcPortraitAsset(
    "comic",
    rank,
    book.profile.presentation,
    npcMood,
  );
  const advisor = getNpcPortraitAsset(
    "advisor",
    rank,
    book.profile.presentation,
    npcMood,
  );
  const companion = getNpcPortraitAsset(
    "companion",
    rank,
    book.profile.presentation,
    npcMood,
  );

  return (
    <main className="app-shell">
      <div className="app-wallpaper" style={wallpaperStyle} />
      <header className="app-header">
        <button
          className="brand-button"
          type="button"
          onClick={() => setTab("home")}
          aria-label="返回首页"
        >
          <span className="brand-seal">账</span>
          <span>
            <strong>朝账</strong>
            <small>记真实收支，养成财务习惯</small>
          </span>
        </button>
        <div className="header-actions">
          <button
            className={`mode-pill ${mode}`}
            type="button"
            onClick={returnToModeChoice}
          >
            {mode === "demo" ? "演示账本" : "我的本地账本"}
          </button>
          <button
            className="more-button"
            type="button"
            aria-label="打开设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <i />
            <i />
            <i />
          </button>
        </div>
        {settingsOpen && (
          <div className="settings-menu">
            <button
              type="button"
              onClick={() => {
                setSetupDraft(createSetupDraft(book));
                setCycleSettingsOpen(true);
                setSettingsOpen(false);
              }}
            >
              调整本周期设置
            </button>
            <button type="button" onClick={returnToModeChoice}>
              切换真实／演示模式
            </button>
            <button className="danger" type="button" onClick={resetCurrentMode}>
              重置当前账本
            </button>
          </div>
        )}
      </header>

      <div className="page-content">
        {tab === "home" && (
          <div className="page-stack">
            <section className="rank-hero">
              <button
                className="player-portrait-button"
                type="button"
                onClick={() => setRankArchiveOpen(true)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portrait.src} alt={`${getRankDisplayName(rank, gender)}人物形象`} />
                <span>查看仕途与人物</span>
              </button>
              <div className="rank-copy">
                <span className="eyebrow">当前官阶</span>
                <h1>{getRankDisplayName(rank, gender)}</h1>
                <p>{book.profile.name} · {rankConfig.residenceName}</p>
                <div className="habit-progress">
                  <div>
                    <span>记账习惯政绩</span>
                    <b>{habitProgress.merit}</b>
                  </div>
                  {habitProgress.rank.nextKey ? (
                    <>
                      <progress
                        max="1"
                        value={habitProgress.rank.progressToNextRank}
                      />
                      <small>
                        再积累 {habitProgress.rank.meritToNextRank} 政绩晋升
                        {getRankDisplayName(habitProgress.rank.nextKey)}
                      </small>
                    </>
                  ) : (
                    <small>仕途已至最高阶</small>
                  )}
                </div>
              </div>
            </section>

            <section className="finance-overview">
              <div>
                <span>本期到账</span>
                <strong>{formatMoney(toYuan(snapshot.openingBalanceCents + snapshot.transactions.additionalIncomeCents))}</strong>
                <small>{book.profile.fundingLabel}与结转</small>
              </div>
              <div>
                <span>已记支出</span>
                <strong>{formatMoney(toYuan(snapshot.transactions.netExpenseCents))}</strong>
                <small>{book.ledger.filter((item) => item.direction === "支出").length} 笔</small>
              </div>
              <div>
                <span>{rankConfig.treasuryName}账面</span>
                <strong className={snapshot.ledgerBalanceCents < 0 ? "negative" : ""}>
                  {formatMoney(toYuan(snapshot.ledgerBalanceCents))}
                </strong>
                <small>按已记录账目估算</small>
              </div>
              <div className="safe-spend-card">
                <span>现在安全可花</span>
                <strong className={snapshot.rawSafeToSpendCents < 0 ? "negative" : ""}>
                  {formatMoney(toYuan(snapshot.rawSafeToSpendCents))}
                </strong>
                <small>已扣除留存目标与待付项目</small>
              </div>
            </section>

            <WorldScene
              rank={rank}
              room="hall"
              fiscalState={fiscalState}
              balance={toYuan(snapshot.ledgerBalanceCents)}
            />

            <section className={`daily-check ${todayChecked ? "complete" : ""}`}>
              <div className="daily-check-copy">
                <span className="eyebrow">今日核对</span>
                <h2>{todayChecked ? "今天的账已经核对" : "今天的消费都记齐了吗？"}</h2>
                <p>
                  {todayChecked
                    ? `今天共确认 ${todayLedger.length} 笔；漏记也可以随时回来补。`
                    : todayLedger.length
                      ? `今天已记录 ${todayLedger.length} 笔。确认完整后，今天会计入习惯成长。`
                      : "消费后立刻记，或晚上一次补齐；漏一天不会清零。"}
                </p>
              </div>
              {!todayChecked && (
                <div className="daily-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => markTodayChecked(false)}
                  >
                    {todayLedger.length ? "已经记齐" : "补记今天"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => markTodayChecked(true)}
                  >
                    今天无支出
                  </button>
                </div>
              )}
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">最近账目</span>
                  <h2>刚刚记下的变化</h2>
                </div>
                <button className="text-link" type="button" onClick={() => setTab("treasury")}>
                  查看全部
                </button>
              </div>
              {book.ledger.length ? (
                <div className="compact-ledger">
                  {[...book.ledger]
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .slice(0, 4)
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => openRecorder(item)}
                      >
                        <span className={`ledger-icon ${item.direction}`}>
                          {item.direction === "支出" ? "支" : "收"}
                        </span>
                        <span>
                          <strong>{item.note}</strong>
                          <small>{item.date.slice(5)} · {item.category}</small>
                        </span>
                        <b className={item.direction === "支出" ? "expense" : "income"}>
                          {formatMoney(item.direction === "支出" ? -item.amount : item.amount, true)}
                        </b>
                      </button>
                    ))}
                </div>
              ) : (
                <EmptyState
                  title="账本还是空的"
                  copy="记下第一笔真实消费，账面和府邸就会开始变化。"
                  action="记第一笔账"
                  onAction={() => openRecorder()}
                />
              )}
            </section>
          </div>
        )}

        {tab === "treasury" && (
          <div className="page-stack">
            <div className="page-title">
              <h1>{rankConfig.treasuryName}账房</h1>
            </div>
            <WorldScene
              rank={rank}
              room="treasury"
              fiscalState={fiscalState}
              balance={toYuan(snapshot.ledgerBalanceCents)}
            />
            <section className="section-card formula-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">本周期资金</span>
                  <h2>两种余额，不混在一起</h2>
                </div>
              </div>
              <div className="formula-lines">
                <div>
                  <span>账面余额</span>
                  <p>
                    本期到账 {formatMoney(toYuan(snapshot.openingBalanceCents + snapshot.transactions.additionalIncomeCents))}
                    <i>−</i>
                    已记支出 {formatMoney(toYuan(snapshot.transactions.netExpenseCents))}
                  </p>
                  <strong>{formatMoney(toYuan(snapshot.ledgerBalanceCents))}</strong>
                </div>
                <div className="safe">
                  <span>安全可花</span>
                  <p>
                    账面余额
                    <i>−</i>
                    留存目标 {formatMoney(toYuan(snapshot.targetClosingBalanceCents))}
                    <i>−</i>
                    待付 {formatMoney(toYuan(snapshot.unpaidFixedExpenseCents))}
                  </p>
                  <strong>{formatMoney(toYuan(snapshot.rawSafeToSpendCents))}</strong>
                </div>
              </div>
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>本月待付项目</h2>
                </div>
              </div>
              <div className="commitment-form">
                <input
                  value={commitmentName}
                  placeholder="例如：房租"
                  aria-label="待付项目名称"
                  onChange={(event) => setCommitmentName(event.target.value)}
                />
                <input
                  value={commitmentAmount}
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="金额"
                  aria-label="待付项目金额"
                  onChange={(event) => setCommitmentAmount(event.target.value)}
                />
                <select
                  value={commitmentCategory}
                  aria-label="待付项目分类"
                  onChange={(event) =>
                    setCommitmentCategory(event.target.value as ExpenseCategory)
                  }
                >
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <button className="secondary-button" type="button" onClick={addCommitment}>
                  加入待付
                </button>
              </div>
              {book.fixedCommitments.length ? (
                <div className="commitment-list">
                  {book.fixedCommitments.map((item) => (
                    <div key={item.id} className={item.paid ? "paid" : ""}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.paid ? "已转为支出" : "尚未支付，只影响安全可花"}</small>
                      </span>
                      <b>{formatMoney(item.amount)}</b>
                      {!item.paid && (
                        <button type="button" onClick={() => payCommitment(item)}>
                          标记已付
                        </button>
                      )}
                      <button type="button" onClick={() => removeCommitment(item)}>
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-line">目前没有待付固定支出。</p>
              )}
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>支出去向</h2>
                </div>
              </div>
              {topCategories.length ? (
                <div className="category-bars">
                  {topCategories.map((item) => {
                    const max = topCategories[0]?.amount || 1;
                    const reference = book.categoryReferences[item.category];
                    return (
                      <div key={item.category}>
                        <span>
                          <strong>{item.category} · {categoryCourtNames[item.category]}</strong>
                          <b>{formatMoney(item.amount)}</b>
                        </span>
                        <i>
                          <em style={{ width: `${Math.max(5, (item.amount / max) * 100)}%` }} />
                        </i>
                        {reference && (
                          <small>下周参考额度 {formatMoney(reference)}</small>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="muted-line">有了支出记录后，这里会按实际金额排序。</p>
              )}
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>问账房</h2>
                </div>
              </div>
              <div className="ask-ledger">
                <input
                  value={ledgerQuestion}
                  placeholder="例如：我这周的钱花哪了？"
                  onChange={(event) => setLedgerQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") askLedger();
                  }}
                />
                <button className="primary-button" type="button" onClick={askLedger}>
                  查询
                </button>
              </div>
              {ledgerAnswer && <div className="ledger-answer">{ledgerAnswer}</div>}
            </section>

            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>全部流水</h2>
                </div>
                <button className="primary-button compact" type="button" onClick={() => openRecorder()}>
                  + 记账
                </button>
              </div>
              {book.ledger.length ? (
                <div className="full-ledger">
                  {[...book.ledger]
                    .sort((a, b) =>
                      `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`),
                    )
                    .map((item) => (
                      <article key={item.id}>
                        <span className={`ledger-icon ${item.direction}`}>
                          {item.direction === "支出" ? "支" : "收"}
                        </span>
                        <div>
                          <strong>{item.note}</strong>
                          <small>{item.date} · {item.category}</small>
                        </div>
                        <b className={item.direction === "支出" ? "expense" : "income"}>
                          {formatMoney(item.direction === "支出" ? -item.amount : item.amount, true)}
                        </b>
                        <div className="row-actions">
                          <button type="button" onClick={() => openRecorder(item)}>
                            编辑
                          </button>
                          <button type="button" onClick={() => deleteLedger(item)}>
                            删除
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <EmptyState
                  title="还没有流水"
                  copy="一句话可以同时识别多笔，确认后才会进入账本。"
                  action="开始记账"
                  onAction={() => openRecorder()}
                />
              )}
            </section>
          </div>
        )}

        {tab === "council" && (
          <div className="page-stack">
            <div className="page-title">
              <h1>每日核对与周议事</h1>
            </div>
            <WorldScene
              rank={rank}
              room="council"
              fiscalState={fiscalState}
              balance={toYuan(snapshot.ledgerBalanceCents)}
            />
            <section className="section-card council-entry">
              <div className="council-mark">
                <strong>{continuity.rollingValidDays}</strong>
                <span>近28天有效核对日</span>
              </div>
              <div>
                <span className="eyebrow">本周复盘</span>
                {latestReview?.weekKey === getCycleWeekKey() ? (
                  <>
                    <h2>本周决定已经保存</h2>
                    <p>{latestReview.actionLabel}</p>
                  </>
                ) : reviewAvailability.canOpen ? (
                  <>
                    <h2>账册已齐，可以开始议事</h2>
                    <p>系统会提出一个重点，你来选择下周真正生效的调整。</p>
                  </>
                ) : (
                  <>
                    <h2>再完成 {reviewAvailability.missingValidDays} 天核对</h2>
                    <p>至少完成四个有效核对日后，才生成本周复盘。</p>
                  </>
                )}
              </div>
              {latestReview?.weekKey === getCycleWeekKey() ? (
                <button className="secondary-button" type="button" onClick={() => setReviewOpen(true)}>
                  查看本周决定
                </button>
              ) : reviewAvailability.canOpen ? (
                <button className="primary-button" type="button" onClick={() => setReviewOpen(true)}>
                  开始本周议事
                </button>
              ) : (
                <button className="secondary-button" type="button" onClick={() => setTab("home")}>
                  去完成今日核对
                </button>
              )}
            </section>
            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>核对记录</h2>
                </div>
              </div>
              <div className="check-calendar">
                {Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6)).map(
                  (dateKey) => {
                    const valid = habitCheckIns.some(
                      (item) =>
                        item.dateKey === dateKey &&
                        item.checkedAt &&
                        (item.confirmedEntryCount > 0 || item.noSpendConfirmed),
                    );
                    return (
                      <div key={dateKey} className={valid ? "valid" : ""}>
                        <span>{dateKey.slice(5)}</span>
                        <strong>{valid ? "已核对" : dateKey === today ? "今天" : "可补记"}</strong>
                      </div>
                    );
                  },
                )}
              </div>
              {continuity.status === "recoverable" && (
                <button className="secondary-button" type="button" onClick={() => openRecorder()}>
                  一句话补记漏掉的账
                </button>
              )}
            </section>
            {book.weeklyReviews.length > 0 && (
              <section className="section-card">
                <div className="section-heading">
                  <div>
                    <h2>往期决定</h2>
                  </div>
                </div>
                <div className="review-history">
                  {[...book.weeklyReviews]
                    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                    .map((review) => (
                      <div key={review.weekKey}>
                        <span>{review.weekKey.replace("week:", "周起始 ")}</span>
                        <strong>{review.actionLabel}</strong>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "build" && (
          <div className="page-stack">
            <div className="page-title">
              <h1>建设与官阶</h1>
            </div>
            <WorldScene
              rank={rank}
              room="works"
              fiscalState={fiscalState}
              balance={toYuan(snapshot.ledgerBalanceCents)}
            />
            <section className="section-card build-progress-card">
              <div className="build-seal">建</div>
              <div>
                <span className="eyebrow">当前营造成果</span>
                <h2>{habitProgress.completedWeeklyReviews ? "议事档案与账房已扩建" : "县衙账房正在起步"}</h2>
                <p>
                  已完成 {habitProgress.validCheckInDays} 个有效核对日、{habitProgress.completedWeeklyReviews} 次周复盘。
                  漏记不会拆除已经获得的成果。
                </p>
              </div>
            </section>
            <section className="section-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">五阶仕途</span>
                  <h2>人物与官署共同成长</h2>
                </div>
                <button className="text-link" type="button" onClick={() => setRankArchiveOpen(true)}>
                  打开图鉴
                </button>
              </div>
              <div className="rank-road">
                {rankConfigs.map((item) => {
                  const unlocked = item.index <= habitProgress.rank.index;
                  return (
                    <div key={item.key} className={unlocked ? "unlocked" : ""}>
                      <span>{item.index + 1}</span>
                      <strong>{getRankDisplayName(item.key, gender)}</strong>
                      <small>{unlocked ? "已开启" : "尚未开放"}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>

      <nav className="bottom-nav" aria-label="主要功能">
        <button
          type="button"
          className={tab === "home" ? "active" : ""}
          onClick={() => setTab("home")}
        >
          <span>邸</span>
          <b>{rankConfig.residenceName}</b>
        </button>
        <button
          type="button"
          className={tab === "treasury" ? "active" : ""}
          onClick={() => setTab("treasury")}
        >
          <span>库</span>
          <b>{rankConfig.treasuryName}</b>
        </button>
        <button className="record-nav" type="button" onClick={() => openRecorder()}>
          <span>＋</span>
          <b>记账</b>
        </button>
        <button
          type="button"
          className={tab === "council" ? "active" : ""}
          onClick={() => setTab("council")}
        >
          <span>议</span>
          <b>议事</b>
        </button>
        <button
          type="button"
          className={tab === "build" ? "active" : ""}
          onClick={() => setTab("build")}
        >
          <span>建</span>
          <b>建设</b>
        </button>
      </nav>

      {recordOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
            <div className="modal-heading">
              <div>
                <h2 id="record-title">{pendingEntries[0]?.id ? "编辑这笔账" : "记一笔账"}</h2>
              </div>
              <button className="close-button" type="button" aria-label="关闭" onClick={() => setRecordOpen(false)}>
                ×
              </button>
            </div>
            {recordStage === "input" ? (
              <>
                <label className="record-textarea">
                  <span>可以一次说完一天的账</span>
                  <textarea
                    value={recordInput}
                    autoFocus
                    placeholder="例如：午饭32元，地铁4元，买书68元"
                    onChange={(event) => setRecordInput(event.target.value)}
                  />
                </label>
                <div className="quick-examples">
                  {["午饭32元", "地铁4元", "奶茶18元", "工资到账3000元"].map((text) => (
                    <button
                      type="button"
                      key={text}
                      onClick={() =>
                        setRecordInput((current) => `${current}${current ? "，" : ""}${text}`)
                      }
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <div className="voice-row">
                  <button
                    className={`voice-button ${voiceActive ? "active" : ""}`}
                    type="button"
                    onClick={startVoice}
                  >
                    <span>{voiceActive ? "■" : "●"}</span>
                    {voiceActive ? "停止收音" : "语音录入"}
                  </button>
                  <p>{voiceStatus || "识别失败也不会丢失你已经输入的原话。"}</p>
                </div>
                {recordError && <p className="form-error">{recordError}</p>}
                <button className="primary-button full" type="button" onClick={recognizeEntries}>
                  识别为账目
                </button>
              </>
            ) : (
              <>
                <p className="confirm-intro">
                  请检查金额、收支方向和日期。确认前不会改变账面。
                </p>
                <div className="draft-list">
                  {pendingEntries.map((entry, index) => (
                    <article key={entry.id ?? `draft-${index}`}>
                      <div className="draft-topline">
                        <strong>第 {index + 1} 笔</strong>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingEntries((items) =>
                              items.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          移除
                        </button>
                      </div>
                      <div className="draft-fields">
                        <label>
                          <span>方向</span>
                          <select
                            value={entry.direction}
                            onChange={(event) => {
                              const direction = event.target.value as LedgerDirection;
                              setPendingEntries((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        direction,
                                        category:
                                          direction === "收入"
                                            ? "收入"
                                            : item.category === "收入"
                                              ? "其他"
                                              : item.category,
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            <option value="支出">支出</option>
                            <option value="收入">收入</option>
                          </select>
                        </label>
                        <label>
                          <span>金额</span>
                          <input
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={entry.amount || ""}
                            onChange={(event) =>
                              setPendingEntries((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, amount: Number(event.target.value) }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="wide">
                          <span>账目名称</span>
                          <input
                            value={entry.note}
                            onChange={(event) =>
                              setPendingEntries((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, note: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>分类</span>
                          <select
                            value={entry.category}
                            disabled={entry.direction === "收入"}
                            onChange={(event) =>
                              setPendingEntries((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        category: event.target.value as ExpenseCategory,
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            {entry.direction === "收入" && <option value="收入">收入</option>}
                            {expenseCategories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>日期</span>
                          <input
                            type="date"
                            value={entry.date}
                            onChange={(event) =>
                              setPendingEntries((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        date: event.target.value as LocalDateKey,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        {entry.direction === "支出" && (
                          <label>
                            <span>支出属性</span>
                            <select
                              value={entry.expenseClass}
                              onChange={(event) =>
                                setPendingEntries((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          expenseClass: event.target.value as ExpenseClass,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="variable">普通支出</option>
                              <option value="fixed">固定支出</option>
                            </select>
                          </label>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {recordError && <p className="form-error">{recordError}</p>}
                {!pendingEntries.some((item) => item.id) && (
                  <button className="text-button" type="button" onClick={addPendingRow}>
                    + 再添加一笔
                  </button>
                )}
                <div className="modal-actions">
                  {!pendingEntries.some((item) => item.id) && (
                    <button className="secondary-button" type="button" onClick={() => setRecordStage("input")}>
                      返回原话
                    </button>
                  )}
                  <button className="primary-button" type="button" onClick={confirmEntries}>
                    确认入账
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {feedback && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal feedback-modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {feedback.fiscalState === "stable"
                    ? "账已记好"
                    : feedback.fiscalState === "strained"
                      ? "账面提醒"
                      : `${rankConfig.treasuryName}告急`}
                </span>
                <h2>{feedback.title}</h2>
              </div>
              <button className="close-button" type="button" aria-label="关闭" onClick={() => setFeedback(null)}>
                ×
              </button>
            </div>
            <p className="feedback-fact">{feedback.fact}</p>
            <div className="feedback-numbers">
              <div>
                <span>账面余额</span>
                <strong>{formatMoney(feedback.balance)}</strong>
              </div>
              <div>
                <span>安全可花</span>
                <strong className={feedback.safeToSpend < 0 ? "negative" : ""}>
                  {formatMoney(feedback.safeToSpend)}
                </strong>
              </div>
            </div>
            <div className={`feedback-cast ${feedback.fiscalState}`}>
              {(feedback.fiscalState === "stable"
                ? [
                    {
                      asset: companion,
                      name: companion.identity,
                      line: "已经记清了。今晚核对一次，就不会让小额消费悄悄漏过去。",
                    },
                  ]
                : [
                    {
                      asset: messenger,
                      name: messenger.identity,
                      line:
                        feedback.fiscalState === "deficit"
                          ? `${rankConfig.treasuryName}账面已经转负，先别急着再花啦！`
                          : "安全可花正在收紧，这笔账已经让账房注意到了。",
                    },
                    {
                      asset: advisor,
                      name: advisor.identity,
                      line:
                        feedback.fiscalState === "deficit"
                          ? "先核对最近三笔金额最高的支出，再决定下一笔是否必要。"
                          : "账面仍可运转，但要把待付项目和月末留存一起看。",
                    },
                    {
                      asset: companion,
                      name: companion.identity,
                      line: "现在发现并不晚。继续如实记录，下一步才有得调整。",
                    },
                  ]
              ).map((role) => (
                <article key={role.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={role.asset.src} alt={role.name} />
                  <div>
                    <strong>{role.name}</strong>
                    <p>“{role.line}”</p>
                  </div>
                </article>
              ))}
            </div>
            <button className="primary-button full" type="button" onClick={() => setFeedback(null)}>
              继续记账
            </button>
          </section>
        </div>
      )}

      {reviewOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal review-modal" role="dialog" aria-modal="true">
            <div className="review-scene">
              <SceneMedia media={getSceneMediaAsset(rank, "council", fiscalState)} eagerPoster />
              <div className="scene-shade" />
              <div className="modal-heading">
                <div>
                  <h2>{latestReview?.weekKey === getCycleWeekKey() ? "本周议事备忘" : reviewIssue.title}</h2>
                </div>
                <button className="close-button dark" type="button" aria-label="关闭" onClick={() => setReviewOpen(false)}>
                  ×
                </button>
              </div>
            </div>
            {latestReview?.weekKey === getCycleWeekKey() ? (
              <div className="saved-review">
                <span className="review-seal">定</span>
                <p>本周已经决定：</p>
                <strong>{latestReview.actionLabel}</strong>
                <button className="primary-button" type="button" onClick={() => setReviewOpen(false)}>
                  收好备忘
                </button>
              </div>
            ) : (
              <>
                <div className="review-dialogue">
                  <article>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={messenger.src} alt={messenger.identity} />
                    <div>
                      <strong>{messenger.identity}</strong>
                      <p>“本周账册已经核对完毕，可以开议了。”</p>
                    </div>
                  </article>
                  <article>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={advisor.src} alt={advisor.identity} />
                    <div>
                      <strong>{advisor.identity}</strong>
                      <p>“{reviewIssue.detail}”</p>
                    </div>
                  </article>
                  <article>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={companion.src} alt={companion.identity} />
                    <div>
                      <strong>{companion.identity}</strong>
                      <p>“不用一次改很多。选一件下周真正做得到的事就好。”</p>
                    </div>
                  </article>
                </div>
                <div className="review-options">
                  <button
                    type="button"
                    onClick={() =>
                      saveReviewAction(
                        "category-reference",
                        `下周${reviewIssue.category}参考额度设为 ${formatMoney(reviewReference)}`,
                        reviewIssue.category,
                        reviewReference,
                      )
                    }
                  >
                    <span>收紧一个方向</span>
                    <strong>下周{reviewIssue.category}参考 {formatMoney(reviewReference)}</strong>
                    <small>保存后会出现在账房分类中，不改变本周账目。</small>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveReviewAction(
                        "daily-reminder",
                        `每天 ${book.profile.reminderTime} 提醒核对当天账目`,
                      )
                    }
                  >
                    <span>先补齐记录</span>
                    <strong>每天 {book.profile.reminderTime} 核对一次</strong>
                    <small>提醒只帮助补漏，不改变任何金额。</small>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveReviewAction(
                        "observe-next-week",
                        `本周暂不调整，继续观察${reviewIssue.category}`,
                      )
                    }
                  >
                    <span>信息还不够</span>
                    <strong>本周先不调整</strong>
                    <small>明确保留现状，下周再用新账目判断。</small>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {rankArchiveOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal rank-modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">人物与官署图鉴</span>
                <h2>五阶仕途</h2>
              </div>
              <button className="close-button" type="button" aria-label="关闭" onClick={() => setRankArchiveOpen(false)}>
                ×
              </button>
            </div>
            <p className="rank-modal-intro">
              官阶只由有效核对日与周复盘推进；收入高低和记账笔数不会让人更快升官。
            </p>
            <div className="rank-gallery">
              {rankConfigs.map((item) => {
                const unlocked = item.index <= habitProgress.rank.index;
                const rankPortrait = getRankPortraitAsset(item.key, gender, "stable");
                return (
                  <article key={item.key} className={unlocked ? "unlocked" : ""}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={rankPortrait.src} alt={getRankDisplayName(item.key, gender)} />
                    <div>
                      <span>第 {item.index + 1} 阶</span>
                      <h3>{getRankDisplayName(item.key, gender)}</h3>
                      <p>{item.residenceName} · {item.treasuryName} · {item.rooms.council.name}</p>
                      <strong>{unlocked ? "已开启" : `需 ${habitProgress.rank.nextThreshold ?? "更多"} 政绩逐步解锁`}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {cycleSettingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal settings-modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <h2>调整本周期设置</h2>
              </div>
              <button className="close-button" type="button" aria-label="关闭" onClick={() => setCycleSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>本周期可用资金</span>
                <input
                  type="number"
                  min="0"
                  value={setupDraft.openingFunds}
                  onChange={(event) =>
                    setSetupDraft({ ...setupDraft, openingFunds: event.target.value })
                  }
                />
              </label>
              <label>
                <span>上期结转</span>
                <input
                  type="number"
                  value={setupDraft.carriedBalance}
                  onChange={(event) =>
                    setSetupDraft({ ...setupDraft, carriedBalance: event.target.value })
                  }
                />
              </label>
              <label>
                <span>结转中允许动用</span>
                <input
                  type="number"
                  min="0"
                  value={setupDraft.usableCarryover}
                  onChange={(event) =>
                    setSetupDraft({ ...setupDraft, usableCarryover: event.target.value })
                  }
                />
              </label>
              <label>
                <span>月末希望留下</span>
                <input
                  type="number"
                  min="0"
                  value={setupDraft.desiredRetention}
                  onChange={(event) =>
                    setSetupDraft({ ...setupDraft, desiredRetention: event.target.value })
                  }
                />
              </label>
              <label>
                <span>周期开始</span>
                <input
                  type="date"
                  value={setupDraft.cycleStartDate}
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      cycleStartDate: event.target.value as LocalDateKey,
                    })
                  }
                />
              </label>
              <label>
                <span>周期结束</span>
                <input
                  type="date"
                  value={setupDraft.cycleEndDate}
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      cycleEndDate: event.target.value as LocalDateKey,
                    })
                  }
                />
              </label>
            </div>
            <label className="reminder-row">
              <input
                type="checkbox"
                checked={setupDraft.reminderEnabled}
                onChange={(event) =>
                  setSetupDraft({
                    ...setupDraft,
                    reminderEnabled: event.target.checked,
                  })
                }
              />
              <span>
                每天
                <input
                  type="time"
                  value={setupDraft.reminderTime}
                  onChange={(event) =>
                    setSetupDraft({
                      ...setupDraft,
                      reminderTime: event.target.value,
                    })
                  }
                />
                提醒核对
              </span>
            </label>
            {setupError && <p className="form-error">{setupError}</p>}
            <button className="primary-button full" type="button" onClick={() => saveSetup(false)}>
              保存并重新计算
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
