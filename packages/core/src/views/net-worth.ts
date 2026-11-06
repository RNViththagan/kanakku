import type { Ledger } from '../ledger/types';
import { addDays } from '../model/dates';
import type { CurrencyCode, IsoDate } from '../model/types';
import { balanceOn, rateBookFor } from './balances';
import { type DateRange, monthEnds } from './range';

export interface NetWorthPoint {
  date: IsoDate;
  total: number;
  byAccount: Record<string, number | undefined>;
  unknown: string[];
  unvalued: CurrencyCode[];
}

function datesIn(range: DateRange & { step: 'day' | 'month' }): IsoDate[] {
  if (range.step === 'month') return monthEnds(range);
  const dates: IsoDate[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function netWorthSeries(
  ledger: Ledger,
  range: DateRange & { step: 'day' | 'month' },
): NetWorthPoint[] {
  const rates = rateBookFor(ledger);
  return datesIn(range).map((date) => {
    const point: NetWorthPoint = { date, total: 0, byAccount: {}, unknown: [], unvalued: [] };
    for (const account of ledger.accounts) {
      const balance = balanceOn(ledger, account.id, date);
      if (balance === undefined) {
        point.byAccount[account.id] = undefined;
        point.unknown.push(account.id);
        continue;
      }
      const valued = rates.toHome(balance, account.currency, date);
      if (!valued) {
        point.byAccount[account.id] = undefined;
        if (!point.unvalued.includes(account.currency)) point.unvalued.push(account.currency);
        continue;
      }
      point.byAccount[account.id] = valued.value;
      point.total += valued.value;
    }
    return point;
  });
}
