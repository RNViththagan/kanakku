import {
  balanceOn,
  type CurrencyCode,
  cashFlowByMonth,
  type DateRange,
  type IsoDate,
  type Ledger,
  monthEnds,
  monthKey,
  netWorthSeries,
  spendingByCategory,
} from '@kanakku/core';

export interface WorthPoint {
  date: IsoDate;
  month: string;
  total: number;
  unknown: string[];
  unvalued: CurrencyCode[];
}

export function netWorthPoints(ledger: Ledger, range: DateRange): WorthPoint[] {
  if (ledger.accounts.length === 0) return [];
  const tracked = ledger.accounts.filter((account) => account.type !== 'fixed-deposit').length;
  const points = netWorthSeries(ledger, { ...range, step: 'month' });
  const first = points.findIndex((point) => tracked === 0 || point.unknown.length < tracked);
  if (first < 0) return [];
  return points.slice(first).map((point) => ({
    date: point.date,
    month: monthKey(point.date),
    total: point.total,
    unknown: point.unknown,
    unvalued: point.unvalued,
  }));
}

export interface SpendingTrend {
  categories: string[];
  months: Array<{ month: string; values: Record<string, number> }>;
}

export const OTHER = 'Other';

export function spendingTrend(ledger: Ledger, range: DateRange, top = 5): SpendingTrend {
  const totals = spendingByCategory(ledger, range);
  const kept = totals.slice(0, top).map((total) => total.category);
  const categories = totals.length > top ? [...kept, OTHER] : kept;
  const months = cashFlowByMonth(ledger, range).map((month) => {
    const values: Record<string, number> = Object.fromEntries(
      categories.map((category) => [category, 0]),
    );
    for (const [category, amount] of Object.entries(month.spendingBy)) {
      const key = kept.includes(category) ? category : OTHER;
      values[key] = (values[key] ?? 0) + amount;
    }
    return { month: month.month, values };
  });
  return { categories, months };
}

export interface BalancePoint {
  date: IsoDate;
  month: string;
  balance?: number;
}

export function balanceSeries(ledger: Ledger, accountId: string, range: DateRange): BalancePoint[] {
  return monthEnds(range).map((date) => {
    const balance = balanceOn(ledger, accountId, date);
    const point: BalancePoint = { date, month: monthKey(date) };
    if (balance !== undefined) point.balance = balance;
    return point;
  });
}
