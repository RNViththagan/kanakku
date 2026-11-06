import { addMonths, endOfMonth, monthKey } from '../model/dates';
import type { IsoDate } from '../model/types';

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export function monthsIn(range: DateRange): string[] {
  const months: string[] = [];
  let year = Number(range.from.slice(0, 4));
  let month = Number(range.from.slice(5, 7));
  const last = monthKey(range.to);
  for (;;) {
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    if (key > last) break;
    months.push(key);
    ({ year, month } = addMonths(year, month, 1));
  }
  return months;
}

export function monthEnds(range: DateRange): IsoDate[] {
  return monthsIn(range).map((month) => {
    const end = endOfMonth(`${month}-01`);
    return end > range.to ? range.to : end;
  });
}
