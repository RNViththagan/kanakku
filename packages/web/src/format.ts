import { type CurrencyCode, formatAmount, type IsoDate, minorUnits } from '@kanakku/core';

export function money(minor: number, currency: CurrencyCode, locale: string): string {
  return `${formatAmount(minor, currency, locale)} ${currency}`;
}

export function compact(minor: number, currency: CurrencyCode, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(
    minor / 10 ** minorUnits(currency),
  );
}

function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function shortDate(iso: IsoDate, locale: string): string {
  const date = utcDay(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function monthLabel(month: string, locale: string): string {
  const date = utcDay(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
