import type { IsoDate } from './types';

const DAY_MS = 86_400_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toDayNumber(date: IsoDate): number {
  return (
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) /
    DAY_MS
  );
}

function fromDayNumber(day: number): IsoDate {
  const date = new Date(day * DAY_MS);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function make(year: number, month: number, day: number): IsoDate | undefined {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }
  return iso(year, month, day);
}

function read(pattern: RegExp, text: string, order: [number, number, number]): IsoDate | undefined {
  const match = pattern.exec(text.trim());
  if (!match) return undefined;
  const [y, m, d] = order.map((index) => Number(match[index]));
  return make(y ?? 0, m ?? 0, d ?? 0);
}

export function parseYmd(text: string): IsoDate | undefined {
  return read(/^(\d{4})-(\d{2})-(\d{2})$/, text, [1, 2, 3]);
}

export function parseDmy(text: string): IsoDate | undefined {
  return read(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, text, [3, 2, 1]);
}

export function parseDmyDash(text: string): IsoDate | undefined {
  return read(/^(\d{1,2})-(\d{1,2})-(\d{4})$/, text, [3, 2, 1]);
}

export function parseMdyShort(text: string): IsoDate | undefined {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  return make(2000 + Number(match[3]), Number(match[1]), Number(match[2]));
}

export function parseDayMonthName(text: string): IsoDate | undefined {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/.exec(text.trim());
  if (!match) return undefined;
  const month = MONTHS.indexOf((match[2] ?? '').toLowerCase()) + 1;
  return make(Number(match[3]), month, Number(match[1]));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function clampDate(year: number, month: number, day: number): IsoDate {
  return iso(year, month, Math.min(day, daysInMonth(year, month)));
}

export function addMonths(
  year: number,
  month: number,
  months: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + months;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return iso(year, month, daysInMonth(year, month));
}
