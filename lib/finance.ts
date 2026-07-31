/**
 * All money values are integer cents.
 *
 * Using cents keeps the engine deterministic and avoids floating-point drift.
 * Formatting cents as yuan is a presentation concern and does not belong here.
 */
export type MoneyCents = number;

export type FiscalState = "stable" | "strained" | "deficit";

export type ExpenseClass = "fixed" | "variable";

export type FinanceTransaction =
  | {
      kind: "income";
      amountCents: MoneyCents;
    }
  | {
      kind: "expense";
      amountCents: MoneyCents;
      expenseClass: ExpenseClass;
    }
  | {
      /**
       * A refund for an expense recorded in this cycle reverses that expense.
       * The expense class is required so the refund also corrects spending pace.
       */
      kind: "refund";
      sourcePeriod: "current";
      expenseClass: ExpenseClass;
      amountCents: MoneyCents;
    }
  | {
      /**
       * A refund for an older cycle is cash received in this cycle. It must not
       * rewrite this cycle's expense pace, so it behaves like additional income.
       */
      kind: "refund";
      sourcePeriod: "previous";
      amountCents: MoneyCents;
    };

export interface FinanceCycleInput {
  /** Positive or negative closing balance carried from the previous cycle. */
  carriedBalanceCents: MoneyCents;

  /** Salary or living allowance received at the beginning of this cycle. */
  openingFundsCents: MoneyCents;

  /**
   * Amount of a positive carryover the user explicitly permits this cycle to
   * spend. Positive carryover is protected by default.
   */
  usableCarryoverCents?: MoneyCents;

  /**
   * New amount the user hopes to retain by the end of this cycle. This is a
   * target, not a deposit, transfer, or transaction.
   */
  desiredRetentionCents?: MoneyCents;

  /**
   * Fixed obligations that have not yet been paid (for example, upcoming
   * rent). They reduce safe-to-spend money but not the ledger balance.
   */
  unpaidFixedExpenseCents?: MoneyCents;

  transactions?: readonly FinanceTransaction[];

  /** Zero-based number of elapsed days in the current cycle. */
  elapsedDays: number;

  /** Length of the cycle in days. */
  totalDays: number;
}

export interface FinanceTransactionSummary {
  additionalIncomeCents: MoneyCents;
  previousPeriodRefundCents: MoneyCents;
  fixedExpenseCents: MoneyCents;
  variableExpenseCents: MoneyCents;
  currentFixedRefundCents: MoneyCents;
  currentVariableRefundCents: MoneyCents;
  netFixedExpenseCents: MoneyCents;
  netVariableExpenseCents: MoneyCents;
  netExpenseCents: MoneyCents;
}

export interface SpendingPace {
  elapsedDays: number;
  totalDays: number;
  timeProgress: number;
  variableBudgetCents: MoneyCents;
  netVariableExpenseCents: MoneyCents;
  expectedVariableExpenseToDateCents: MoneyCents;
  paceDeltaCents: MoneyCents;
  spendingProgress: number | null;
  paceRatio: number | null;
  projectedVariableExpenseCents: MoneyCents | null;
  projectedClosingBalanceCents: MoneyCents | null;
  isAheadOfPace: boolean;
}

export interface FinanceSnapshot {
  /** Carryover plus this cycle's regular opening funds. */
  openingBalanceCents: MoneyCents;

  /** Actual balance implied by confirmed transactions. May be negative. */
  ledgerBalanceCents: MoneyCents;

  /** Portion of positive carryover that remains protected this cycle. */
  protectedCarryoverCents: MoneyCents;

  /** Protected carryover plus this cycle's desired new retention. */
  targetClosingBalanceCents: MoneyCents;

  /** Total money available for all spending before expenses are recorded. */
  periodSpendingCapacityCents: MoneyCents;

  /** Money available for variable spending after all fixed commitments. */
  variableBudgetCents: MoneyCents;

  /**
   * Raw safe-to-spend result. A negative value is useful because it preserves
   * the size of the shortfall instead of silently clamping it away.
   */
  rawSafeToSpendCents: MoneyCents;

  /** Non-negative amount that can be presented as safe to spend now. */
  safeToSpendCents: MoneyCents;

  /** Non-negative amount by which the safety boundary has been exceeded. */
  safetyShortfallCents: MoneyCents;

  /** Current ledger balance minus the target closing balance. */
  retentionGapCents: MoneyCents;

  unpaidFixedExpenseCents: MoneyCents;
  transactions: FinanceTransactionSummary;
  pace: SpendingPace;
  fiscalState: FiscalState;
}

interface SpendingPaceInput {
  cycleFundingCents: MoneyCents;
  targetClosingBalanceCents: MoneyCents;
  netFixedExpenseCents: MoneyCents;
  unpaidFixedExpenseCents: MoneyCents;
  netVariableExpenseCents: MoneyCents;
  elapsedDays: number;
  totalDays: number;
}

interface FiscalStateInput {
  ledgerBalanceCents: MoneyCents;
  rawSafeToSpendCents: MoneyCents;
  targetClosingBalanceCents: MoneyCents;
  projectedClosingBalanceCents: MoneyCents | null;
}

function assertIntegerCents(
  value: number,
  name: string,
  options: { allowNegative?: boolean } = {},
): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer number of cents.`);
  }

  if (!options.allowNegative && value < 0) {
    throw new RangeError(`${name} cannot be negative.`);
  }
}

function assertCycleDays(elapsedDays: number, totalDays: number): void {
  if (!Number.isInteger(totalDays) || totalDays <= 0) {
    throw new RangeError("totalDays must be a positive integer.");
  }

  if (
    !Number.isInteger(elapsedDays) ||
    elapsedDays < 0 ||
    elapsedDays > totalDays
  ) {
    throw new RangeError(
      "elapsedDays must be an integer between 0 and totalDays.",
    );
  }
}

export function summarizeFinanceTransactions(
  transactions: readonly FinanceTransaction[] = [],
): FinanceTransactionSummary {
  let additionalIncomeCents = 0;
  let previousPeriodRefundCents = 0;
  let fixedExpenseCents = 0;
  let variableExpenseCents = 0;
  let currentFixedRefundCents = 0;
  let currentVariableRefundCents = 0;

  transactions.forEach((transaction, index) => {
    assertIntegerCents(
      transaction.amountCents,
      `transactions[${index}].amountCents`,
    );

    if (transaction.kind === "income") {
      additionalIncomeCents += transaction.amountCents;
      return;
    }

    if (transaction.kind === "expense") {
      if (transaction.expenseClass === "fixed") {
        fixedExpenseCents += transaction.amountCents;
      } else {
        variableExpenseCents += transaction.amountCents;
      }
      return;
    }

    if (transaction.sourcePeriod === "previous") {
      previousPeriodRefundCents += transaction.amountCents;
      return;
    }

    if (transaction.expenseClass === "fixed") {
      currentFixedRefundCents += transaction.amountCents;
    } else {
      currentVariableRefundCents += transaction.amountCents;
    }
  });

  if (currentFixedRefundCents > fixedExpenseCents) {
    throw new RangeError(
      "Current-cycle fixed refunds cannot exceed fixed expenses.",
    );
  }

  if (currentVariableRefundCents > variableExpenseCents) {
    throw new RangeError(
      "Current-cycle variable refunds cannot exceed variable expenses.",
    );
  }

  const netFixedExpenseCents =
    fixedExpenseCents - currentFixedRefundCents;
  const netVariableExpenseCents =
    variableExpenseCents - currentVariableRefundCents;

  return {
    additionalIncomeCents,
    previousPeriodRefundCents,
    fixedExpenseCents,
    variableExpenseCents,
    currentFixedRefundCents,
    currentVariableRefundCents,
    netFixedExpenseCents,
    netVariableExpenseCents,
    netExpenseCents: netFixedExpenseCents + netVariableExpenseCents,
  };
}

export function calculateSpendingPace(
  input: SpendingPaceInput,
): SpendingPace {
  assertCycleDays(input.elapsedDays, input.totalDays);
  assertIntegerCents(
    input.cycleFundingCents,
    "cycleFundingCents",
    { allowNegative: true },
  );
  assertIntegerCents(
    input.targetClosingBalanceCents,
    "targetClosingBalanceCents",
  );
  assertIntegerCents(input.netFixedExpenseCents, "netFixedExpenseCents");
  assertIntegerCents(
    input.unpaidFixedExpenseCents,
    "unpaidFixedExpenseCents",
  );
  assertIntegerCents(
    input.netVariableExpenseCents,
    "netVariableExpenseCents",
  );

  const fixedCommitmentCents =
    input.netFixedExpenseCents + input.unpaidFixedExpenseCents;
  const rawVariableBudgetCents =
    input.cycleFundingCents -
    input.targetClosingBalanceCents -
    fixedCommitmentCents;
  const variableBudgetCents = Math.max(0, rawVariableBudgetCents);
  const timeProgress = input.elapsedDays / input.totalDays;
  const expectedVariableExpenseToDateCents = Math.floor(
    variableBudgetCents * timeProgress,
  );
  const paceDeltaCents =
    input.netVariableExpenseCents - expectedVariableExpenseToDateCents;

  const spendingProgress =
    variableBudgetCents > 0
      ? input.netVariableExpenseCents / variableBudgetCents
      : input.netVariableExpenseCents === 0
        ? 0
        : null;
  const paceRatio =
    spendingProgress !== null && timeProgress > 0
      ? spendingProgress / timeProgress
      : null;
  const projectedVariableExpenseCents =
    input.elapsedDays > 0
      ? Math.ceil(
          (input.netVariableExpenseCents * input.totalDays) /
            input.elapsedDays,
        )
      : null;
  const projectedClosingBalanceCents =
    projectedVariableExpenseCents === null
      ? null
      : input.cycleFundingCents -
        fixedCommitmentCents -
        projectedVariableExpenseCents;

  return {
    elapsedDays: input.elapsedDays,
    totalDays: input.totalDays,
    timeProgress,
    variableBudgetCents,
    netVariableExpenseCents: input.netVariableExpenseCents,
    expectedVariableExpenseToDateCents,
    paceDeltaCents,
    spendingProgress,
    paceRatio,
    projectedVariableExpenseCents,
    projectedClosingBalanceCents,
    isAheadOfPace:
      input.elapsedDays > 0 &&
      input.netVariableExpenseCents >
        expectedVariableExpenseToDateCents,
  };
}

export function classifyFiscalState(
  input: FiscalStateInput,
): FiscalState {
  if (input.ledgerBalanceCents < 0) {
    return "deficit";
  }

  const forecastMissesTarget =
    input.projectedClosingBalanceCents !== null &&
    input.projectedClosingBalanceCents <
      input.targetClosingBalanceCents;

  if (input.rawSafeToSpendCents < 0 || forecastMissesTarget) {
    return "strained";
  }

  return "stable";
}

export function calculateFinance(
  input: FinanceCycleInput,
): FinanceSnapshot {
  const usableCarryoverCents = input.usableCarryoverCents ?? 0;
  const desiredRetentionCents = input.desiredRetentionCents ?? 0;
  const unpaidFixedExpenseCents =
    input.unpaidFixedExpenseCents ?? 0;

  assertIntegerCents(
    input.carriedBalanceCents,
    "carriedBalanceCents",
    { allowNegative: true },
  );
  assertIntegerCents(input.openingFundsCents, "openingFundsCents");
  assertIntegerCents(usableCarryoverCents, "usableCarryoverCents");
  assertIntegerCents(
    desiredRetentionCents,
    "desiredRetentionCents",
  );
  assertIntegerCents(
    unpaidFixedExpenseCents,
    "unpaidFixedExpenseCents",
  );
  assertCycleDays(input.elapsedDays, input.totalDays);

  const positiveCarryoverCents = Math.max(
    0,
    input.carriedBalanceCents,
  );
  if (usableCarryoverCents > positiveCarryoverCents) {
    throw new RangeError(
      "usableCarryoverCents cannot exceed positive carried balance.",
    );
  }

  const transactions = summarizeFinanceTransactions(
    input.transactions,
  );
  const protectedCarryoverCents =
    positiveCarryoverCents - usableCarryoverCents;
  const targetClosingBalanceCents =
    protectedCarryoverCents + desiredRetentionCents;
  const openingBalanceCents =
    input.carriedBalanceCents + input.openingFundsCents;

  // A previous-period refund belongs to this cycle's funding. A current-cycle
  // refund is already represented by reducing its matching expense.
  const cycleFundingCents =
    openingBalanceCents +
    transactions.additionalIncomeCents +
    transactions.previousPeriodRefundCents;
  const ledgerBalanceCents =
    cycleFundingCents - transactions.netExpenseCents;
  const periodSpendingCapacityCents =
    cycleFundingCents - targetClosingBalanceCents;
  const rawSafeToSpendCents =
    ledgerBalanceCents -
    targetClosingBalanceCents -
    unpaidFixedExpenseCents;
  const retentionGapCents =
    ledgerBalanceCents - targetClosingBalanceCents;

  const pace = calculateSpendingPace({
    cycleFundingCents,
    targetClosingBalanceCents,
    netFixedExpenseCents: transactions.netFixedExpenseCents,
    unpaidFixedExpenseCents,
    netVariableExpenseCents:
      transactions.netVariableExpenseCents,
    elapsedDays: input.elapsedDays,
    totalDays: input.totalDays,
  });

  const fiscalState = classifyFiscalState({
    ledgerBalanceCents,
    rawSafeToSpendCents,
    targetClosingBalanceCents,
    projectedClosingBalanceCents:
      pace.projectedClosingBalanceCents,
  });

  return {
    openingBalanceCents,
    ledgerBalanceCents,
    protectedCarryoverCents,
    targetClosingBalanceCents,
    periodSpendingCapacityCents,
    variableBudgetCents: pace.variableBudgetCents,
    rawSafeToSpendCents,
    safeToSpendCents: Math.max(0, rawSafeToSpendCents),
    safetyShortfallCents: Math.max(0, -rawSafeToSpendCents),
    retentionGapCents,
    unpaidFixedExpenseCents,
    transactions,
    pace,
    fiscalState,
  };
}
