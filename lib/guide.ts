export type DemoGuideSignals = {
  triggerAdded: boolean;
  councilDecisionMade: boolean;
  councilDone: boolean;
  recoveryDone: boolean;
};

export type RecoveryEntry = {
  type: string;
  amount: number;
};

export function getDemoGuideStep(signals: DemoGuideSignals): 1 | 2 | 3 | 4 | 5 {
  if (!signals.triggerAdded) return 1;
  if (!signals.councilDecisionMade) return 2;
  if (!signals.councilDone) return 3;
  if (!signals.recoveryDone) return 4;
  return 5;
}

export function shouldCompleteDemoRecovery(
  guideStep: number,
  entry: RecoveryEntry,
  treasuryAfterEntry: number,
): boolean {
  return (
    guideStep === 4 &&
    entry.type === "储蓄" &&
    entry.amount > 0 &&
    treasuryAfterEntry >= 0
  );
}
