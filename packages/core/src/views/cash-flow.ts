import type { Ledger } from '../ledger/types';
import { monthKey } from '../model/dates';
import type { CurrencyCode } from '../model/types';
import { rateBookFor } from './balances';
import { type DateRange, monthsIn } from './range';

export interface CashFlowMonth {
  month: string;
  income: number;
  spending: number;
  net: number;
  incomeBy: Record<string, number>;
  spendingBy: Record<string, number>;
  unvalued: CurrencyCode[];
}

export function cashFlowByMonth(ledger: Ledger, range: DateRange): CashFlowMonth[] {
  const rates = rateBookFor(ledger);
  const months = new Map<string, CashFlowMonth>(
    monthsIn(range).map((month) => [
      month,
      { month, income: 0, spending: 0, net: 0, incomeBy: {}, spendingBy: {}, unvalued: [] },
    ]),
  );
  for (const row of ledger.transactions) {
    if (row.date < range.from || row.date > range.to) continue;
    const month = months.get(monthKey(row.date));
    if (!month) continue;
    for (const part of row.parts) {
      if (part.kind !== 'income' && part.kind !== 'spending') continue;
      const valued = rates.toHome(part.amount, row.currency, row.date);
      if (!valued) {
        if (!month.unvalued.includes(row.currency)) month.unvalued.push(row.currency);
        continue;
      }
      if (part.kind === 'income') {
        month.income += valued.value;
        month.incomeBy[part.category] = (month.incomeBy[part.category] ?? 0) + valued.value;
      } else {
        month.spending -= valued.value;
        month.spendingBy[part.category] = (month.spendingBy[part.category] ?? 0) - valued.value;
      }
    }
  }
  return [...months.values()].map((month) => ({ ...month, net: month.income - month.spending }));
}
