export type FiscalState = "stable" | "strained" | "deficit";

export function calculateFinance(
  treasuryBase: number,
  expenseTotal: number,
  consumptionPool: number,
): {
  overspend: number;
  treasuryBalance: number;
  fiscalState: FiscalState;
} {
  const overspend = Math.max(0, expenseTotal - consumptionPool);
  const treasuryBalance = treasuryBase - overspend;
  const fiscalState: FiscalState =
    treasuryBalance < 0 ? "deficit" : overspend > 0 ? "strained" : "stable";

  return { overspend, treasuryBalance, fiscalState };
}

export function calculateRecoverySavings(
  treasuryBalance: number,
  minimumSavings = 100,
): number {
  if (treasuryBalance >= 0) return minimumSavings;

  const deficitToCover = Math.max(0, -treasuryBalance);
  return Math.max(
    minimumSavings,
    Math.ceil((deficitToCover + 1) / minimumSavings) * minimumSavings,
  );
}
