/**
 * 朝账 V2 的习惯逻辑。
 *
 * 这里刻意只处理可验证的行为：有效核对日与有效周复盘。
 * 记账笔数、消费金额和收入金额都不会直接增加政绩，避免拆账刷分，
 * 也避免收入更高的用户天然升官更快。
 */

export const DEFAULT_HABIT_TIME_ZONE = "Asia/Shanghai";

export type LocalDateKey = `${number}-${number}-${number}`;
export type CycleWeekKey = `week:${LocalDateKey}`;
export type HabitDateInput = Date | string | number;

export type DailyCheckIn = {
  dateKey: LocalDateKey;
  confirmedEntryCount: number;
  checkedAt?: string | null;
  noSpendConfirmed?: boolean;
};

export type WeeklyReview = {
  weekKey: CycleWeekKey;
  completedAt?: string | null;
  selectedActionId?: string | null;
};

export type ContinuityStatus = "new" | "active" | "recoverable" | "paused";

export type RecoverableContinuity = {
  status: ContinuityStatus;
  todayKey: LocalDateKey;
  latestValidDateKey: LocalDateKey | null;
  daysSinceLatestValid: number | null;
  totalValidDays: number;
  rollingValidDays: number;
  retainedProgressDays: number;
  recoverableDateKeys: readonly LocalDateKey[];
};

export type ContinuityOptions = {
  now?: HabitDateInput;
  timeZone?: string;
  rollingWindowDays?: number;
  recoveryWindowDays?: number;
};

export type WeeklyReviewAvailabilityReason =
  | "ready"
  | "already-completed"
  | "not-enough-valid-days"
  | "no-ledger-data";

export type WeeklyReviewAvailability = {
  canOpen: boolean;
  reason: WeeklyReviewAvailabilityReason;
  weekKey: CycleWeekKey;
  validCheckInDays: number;
  minimumValidDays: number;
  missingValidDays: number;
  confirmedEntryCount: number;
};

export type WeeklyReviewAvailabilityInput = {
  checkIns: readonly DailyCheckIn[];
  reviews: readonly WeeklyReview[];
  now?: HabitDateInput;
  timeZone?: string;
  minimumValidDays?: number;
};

export const habitRankKeys = [
  "county",
  "prefecture",
  "governor",
  "regent",
  "emperor",
] as const;

export type HabitRankKey = (typeof habitRankKeys)[number];

export type HabitMeritRules = {
  pointsPerValidCheckInDay: number;
  pointsPerCompletedWeeklyReview: number;
};

export const DEFAULT_HABIT_MERIT_RULES: Readonly<HabitMeritRules> = {
  pointsPerValidCheckInDay: 4,
  pointsPerCompletedWeeklyReview: 12,
};

export type HabitRankThreshold = {
  key: HabitRankKey;
  threshold: number;
};

export const HABIT_RANK_THRESHOLDS: readonly HabitRankThreshold[] = [
  { key: "county", threshold: 0 },
  { key: "prefecture", threshold: 50 },
  { key: "governor", threshold: 160 },
  { key: "regent", threshold: 320 },
  { key: "emperor", threshold: 560 },
] as const;

export type HabitRankProgress = {
  key: HabitRankKey;
  index: number;
  merit: number;
  currentThreshold: number;
  nextKey: HabitRankKey | null;
  nextThreshold: number | null;
  meritToNextRank: number;
  progressToNextRank: number;
};

export type HabitProgress = {
  validCheckInDays: number;
  completedWeeklyReviews: number;
  merit: number;
  rank: HabitRankProgress;
};

type CalendarParts = {
  year: number;
  month: number;
  day: number;
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const asNonNegativeInteger = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const asPositiveInteger = (value: number, fallback: number): number => {
  const normalized = asNonNegativeInteger(value);
  return normalized > 0 ? normalized : fallback;
};

const toDate = (value: HabitDateInput): Date => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid habit date: ${String(value)}`);
  }
  return date;
};

const getCalendarParts = (
  value: HabitDateInput,
  timeZone: string,
): CalendarParts => {
  const date = toDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const numberPart = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);

  return {
    year: numberPart("year"),
    month: numberPart("month"),
    day: numberPart("day"),
  };
};

const formatDateKey = ({ year, month, day }: CalendarParts): LocalDateKey =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as LocalDateKey;

const parseDateKey = (value: string): CalendarParts => {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid local date key: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid local date key: ${value}`);
  }

  return { year, month, day };
};

const calendarDateFromKey = (dateKey: LocalDateKey): Date => {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
};

const resolveDateKey = (
  value: HabitDateInput,
  timeZone: string,
): LocalDateKey => {
  if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) {
    parseDateKey(value);
    return value as LocalDateKey;
  }
  return formatDateKey(getCalendarParts(value, timeZone));
};

/** Returns the calendar date seen by the user, never a UTC-truncated date. */
export const getLocalDateKey = (
  value: HabitDateInput = new Date(),
  timeZone = DEFAULT_HABIT_TIME_ZONE,
): LocalDateKey => resolveDateKey(value, timeZone);

/** Shifts a calendar key without introducing local-time or DST drift. */
export const shiftLocalDateKey = (
  dateKey: LocalDateKey,
  days: number,
): LocalDateKey => {
  const calendarDate = calendarDateFromKey(dateKey);
  calendarDate.setUTCDate(calendarDate.getUTCDate() + Math.trunc(days));
  return calendarDate.toISOString().slice(0, 10) as LocalDateKey;
};

const daysBetweenDateKeys = (
  earlierDateKey: LocalDateKey,
  laterDateKey: LocalDateKey,
): number =>
  Math.round(
    (calendarDateFromKey(laterDateKey).getTime() -
      calendarDateFromKey(earlierDateKey).getTime()) /
      86_400_000,
  );

/**
 * Natural-week key. The key contains the first calendar day of the week.
 * Monday is used by default; `weekStartsOn` follows JS weekday numbers.
 */
export const getCycleWeekKey = (
  value: HabitDateInput = new Date(),
  options: { timeZone?: string; weekStartsOn?: number } = {},
): CycleWeekKey => {
  const timeZone = options.timeZone ?? DEFAULT_HABIT_TIME_ZONE;
  const weekStartsOn = Math.min(
    6,
    Math.max(0, Math.trunc(options.weekStartsOn ?? 1)),
  );
  const dateKey = resolveDateKey(value, timeZone);
  const calendarDate = calendarDateFromKey(dateKey);
  const offset = (calendarDate.getUTCDay() - weekStartsOn + 7) % 7;
  return `week:${shiftLocalDateKey(dateKey, -offset)}`;
};

/** A valid day needs a deliberate check plus either a real entry or no-spend confirmation. */
export const isValidCheckInDay = (checkIn: DailyCheckIn): boolean =>
  Boolean(checkIn.checkedAt?.trim()) &&
  (asNonNegativeInteger(checkIn.confirmedEntryCount) > 0 ||
    checkIn.noSpendConfirmed === true);

/**
 * Merges duplicate records for the same day before validating them.
 * This lets storage keep entry evidence and the later daily check separately.
 */
export const getValidCheckInDateKeys = (
  checkIns: readonly DailyCheckIn[],
): readonly LocalDateKey[] => {
  const merged = new Map<LocalDateKey, DailyCheckIn>();

  for (const checkIn of checkIns) {
    parseDateKey(checkIn.dateKey);
    const existing = merged.get(checkIn.dateKey);
    merged.set(checkIn.dateKey, {
      dateKey: checkIn.dateKey,
      confirmedEntryCount:
        asNonNegativeInteger(existing?.confirmedEntryCount ?? 0) +
        asNonNegativeInteger(checkIn.confirmedEntryCount),
      checkedAt: existing?.checkedAt || checkIn.checkedAt,
      noSpendConfirmed:
        existing?.noSpendConfirmed === true ||
        checkIn.noSpendConfirmed === true,
    });
  }

  return [...merged.values()]
    .filter(isValidCheckInDay)
    .map((checkIn) => checkIn.dateKey)
    .sort();
};

/**
 * A missed day never erases accrued progress. Recent gaps are exposed as
 * recoverable dates; after the recovery window the state pauses, while
 * `retainedProgressDays` remains unchanged.
 */
export const getRecoverableContinuity = (
  checkIns: readonly DailyCheckIn[],
  options: ContinuityOptions = {},
): RecoverableContinuity => {
  const timeZone = options.timeZone ?? DEFAULT_HABIT_TIME_ZONE;
  const todayKey = resolveDateKey(options.now ?? new Date(), timeZone);
  const rollingWindowDays = asPositiveInteger(
    options.rollingWindowDays ?? 28,
    28,
  );
  const recoveryWindowDays = asPositiveInteger(
    options.recoveryWindowDays ?? 3,
    3,
  );
  const allValidDateKeys = getValidCheckInDateKeys(checkIns).filter(
    (dateKey) => dateKey <= todayKey,
  );
  const latestValidDateKey = allValidDateKeys.at(-1) ?? null;
  const daysSinceLatestValid = latestValidDateKey
    ? daysBetweenDateKeys(latestValidDateKey, todayKey)
    : null;
  const rollingStartKey = shiftLocalDateKey(todayKey, -(rollingWindowDays - 1));
  const rollingValidDays = allValidDateKeys.filter(
    (dateKey) => dateKey >= rollingStartKey,
  ).length;

  let status: ContinuityStatus = "new";
  if (daysSinceLatestValid === 0) {
    status = "active";
  } else if (
    daysSinceLatestValid !== null &&
    daysSinceLatestValid <= recoveryWindowDays
  ) {
    status = "recoverable";
  } else if (daysSinceLatestValid !== null) {
    status = "paused";
  }

  const validDateKeySet = new Set(allValidDateKeys);
  const recoverableDateKeys: LocalDateKey[] = [];
  if (status === "recoverable") {
    const recoveryStartKey = shiftLocalDateKey(
      todayKey,
      -(recoveryWindowDays - 1),
    );
    for (
      let dateKey = recoveryStartKey;
      dateKey <= todayKey;
      dateKey = shiftLocalDateKey(dateKey, 1)
    ) {
      if (!validDateKeySet.has(dateKey)) recoverableDateKeys.push(dateKey);
    }
  }

  return {
    status,
    todayKey,
    latestValidDateKey,
    daysSinceLatestValid,
    totalValidDays: allValidDateKeys.length,
    rollingValidDays,
    retainedProgressDays: allValidDateKeys.length,
    recoverableDateKeys,
  };
};

/** A review only counts after the user has chosen a real next-period action. */
export const isValidWeeklyReview = (review: WeeklyReview): boolean =>
  Boolean(review.completedAt?.trim()) &&
  Boolean(review.selectedActionId?.trim());

export const countCompletedWeeklyReviews = (
  reviews: readonly WeeklyReview[],
): number =>
  new Set(
    reviews
      .filter(isValidWeeklyReview)
      .map((review) => review.weekKey),
  ).size;

export const getWeeklyReviewAvailability = ({
  checkIns,
  reviews,
  now = new Date(),
  timeZone = DEFAULT_HABIT_TIME_ZONE,
  minimumValidDays = 4,
}: WeeklyReviewAvailabilityInput): WeeklyReviewAvailability => {
  const weekKey = getCycleWeekKey(now, { timeZone });
  const normalizedMinimumValidDays = asPositiveInteger(minimumValidDays, 4);
  const currentWeekCheckIns = checkIns.filter(
    (checkIn) => getCycleWeekKey(checkIn.dateKey, { timeZone }) === weekKey,
  );
  const validCheckInDays = getValidCheckInDateKeys(currentWeekCheckIns).length;
  const confirmedEntryCount = currentWeekCheckIns.reduce(
    (total, checkIn) =>
      total + asNonNegativeInteger(checkIn.confirmedEntryCount),
    0,
  );
  const alreadyCompleted = reviews.some(
    (review) => review.weekKey === weekKey && isValidWeeklyReview(review),
  );

  const base = {
    weekKey,
    validCheckInDays,
    minimumValidDays: normalizedMinimumValidDays,
    missingValidDays: Math.max(
      0,
      normalizedMinimumValidDays - validCheckInDays,
    ),
    confirmedEntryCount,
  };

  if (alreadyCompleted) {
    return {
      ...base,
      canOpen: false,
      reason: "already-completed",
    };
  }

  if (validCheckInDays < normalizedMinimumValidDays) {
    return {
      ...base,
      canOpen: false,
      reason: "not-enough-valid-days",
    };
  }

  if (confirmedEntryCount < 1) {
    return {
      ...base,
      canOpen: false,
      reason: "no-ledger-data",
    };
  }

  return {
    ...base,
    canOpen: true,
    reason: "ready",
  };
};

export const calculateHabitMerit = (
  validCheckInDays: number,
  completedWeeklyReviews: number,
  rules: HabitMeritRules = DEFAULT_HABIT_MERIT_RULES,
): number =>
  asNonNegativeInteger(validCheckInDays) *
    asNonNegativeInteger(rules.pointsPerValidCheckInDay) +
  asNonNegativeInteger(completedWeeklyReviews) *
    asNonNegativeInteger(rules.pointsPerCompletedWeeklyReview);

export const getHabitRank = (merit: number): HabitRankProgress => {
  const normalizedMerit = asNonNegativeInteger(merit);
  const index = HABIT_RANK_THRESHOLDS.findLastIndex(
    (rank) => normalizedMerit >= rank.threshold,
  );
  const currentIndex = Math.max(0, index);
  const current = HABIT_RANK_THRESHOLDS[currentIndex];
  const next = HABIT_RANK_THRESHOLDS[currentIndex + 1] ?? null;
  const range = next ? next.threshold - current.threshold : 0;
  const progressToNextRank = next
    ? Math.min(1, Math.max(0, (normalizedMerit - current.threshold) / range))
    : 1;

  return {
    key: current.key,
    index: currentIndex,
    merit: normalizedMerit,
    currentThreshold: current.threshold,
    nextKey: next?.key ?? null,
    nextThreshold: next?.threshold ?? null,
    meritToNextRank: next
      ? Math.max(0, next.threshold - normalizedMerit)
      : 0,
    progressToNextRank,
  };
};

export const getHabitProgress = (
  checkIns: readonly DailyCheckIn[],
  reviews: readonly WeeklyReview[],
  rules: HabitMeritRules = DEFAULT_HABIT_MERIT_RULES,
): HabitProgress => {
  const validCheckInDays = getValidCheckInDateKeys(checkIns).length;
  const completedWeeklyReviews = countCompletedWeeklyReviews(reviews);
  const merit = calculateHabitMerit(
    validCheckInDays,
    completedWeeklyReviews,
    rules,
  );

  return {
    validCheckInDays,
    completedWeeklyReviews,
    merit,
    rank: getHabitRank(merit),
  };
};
