export const MAX_NEXT_CYCLE_REFERENCE = 99_999_999;

export const parseNextCycleReferenceAmount = (value: string) => {
  const normalized = value.trim().replaceAll(",", "");

  if (!/^\d+$/.test(normalized)) return null;

  const amount = Number(normalized);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_NEXT_CYCLE_REFERENCE
  ) {
    return null;
  }

  return amount;
};
