export type CouncilCadence = "daily" | "weekly";

export type CouncilAvailabilityReason =
  | "ready"
  | "no-ledger"
  | "already-held"
  | "no-new-ledger";

export type CouncilAvailability = {
  canOpen: boolean;
  reason: CouncilAvailabilityReason;
  cadenceLabel: string;
  periodLabel: string;
  message: string;
};

type CouncilAvailabilityInput = {
  cadence: CouncilCadence;
  lastCompletedAt: string;
  ledgerCount: number;
  lastLedgerCount: number;
  now?: Date;
};

const shanghaiDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
};

export const getCouncilCadenceLabel = (cadence: CouncilCadence) =>
  cadence === "daily" ? "每日一次" : "每周一次";

export const getCouncilPeriodKey = (
  date: Date,
  cadence: CouncilCadence,
): string => {
  const { year, month, day } = shanghaiDateParts(date);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  if (cadence === "daily") {
    return `day:${calendarDate.toISOString().slice(0, 10)}`;
  }

  const mondayOffset = (calendarDate.getUTCDay() + 6) % 7;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - mondayOffset);
  return `week:${calendarDate.toISOString().slice(0, 10)}`;
};

export const getCouncilAvailability = ({
  cadence,
  lastCompletedAt,
  ledgerCount,
  lastLedgerCount,
  now = new Date(),
}: CouncilAvailabilityInput): CouncilAvailability => {
  const cadenceLabel = getCouncilCadenceLabel(cadence);
  const periodLabel = cadence === "daily" ? "今日" : "本周";

  if (ledgerCount < 1) {
    return {
      canOpen: false,
      reason: "no-ledger",
      cadenceLabel,
      periodLabel,
      message: "至少记录一笔账后，才能开启第一次朝会。",
    };
  }

  if (!lastCompletedAt) {
    return {
      canOpen: true,
      reason: "ready",
      cadenceLabel,
      periodLabel,
      message: `${periodLabel}朝会尚未召开。`,
    };
  }

  const lastCompleted = new Date(lastCompletedAt);
  const lastPeriod = Number.isNaN(lastCompleted.getTime())
    ? ""
    : getCouncilPeriodKey(lastCompleted, cadence);
  const currentPeriod = getCouncilPeriodKey(now, cadence);

  if (lastPeriod === currentPeriod) {
    return {
      canOpen: false,
      reason: "already-held",
      cadenceLabel,
      periodLabel,
      message:
        cadence === "daily"
          ? "今日朝会已经完成，新增消费或储蓄不会重复解锁；明日有新账后可再次开议。"
          : "本周朝会已经完成，新增消费或储蓄不会重复解锁；下周有新账后可再次开议。",
    };
  }

  if (ledgerCount <= lastLedgerCount) {
    return {
      canOpen: false,
      reason: "no-new-ledger",
      cadenceLabel,
      periodLabel,
      message: `已经进入新的${cadence === "daily" ? "一天" : "一周"}，先记一笔新账再开议。`,
    };
  }

  return {
    canOpen: true,
    reason: "ready",
    cadenceLabel,
    periodLabel,
    message: `${periodLabel}已有新账，可以开启朝会。`,
  };
};
