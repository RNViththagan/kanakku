import type { CashFlowMonth } from '@kanakku/core';

export function month(
  incomeBy: Record<string, number>,
  spendingBy: Record<string, number>,
): CashFlowMonth {
  const income = Object.values(incomeBy).reduce((sum, value) => sum + value, 0);
  const spending = Object.values(spendingBy).reduce((sum, value) => sum + value, 0);
  return {
    month: '2026-03',
    income,
    spending,
    net: income - spending,
    incomeBy,
    spendingBy,
    unvalued: [],
  };
}
