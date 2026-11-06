import type { CurrencyCode } from './types';

const PLACES: Record<number, readonly string[]> = {
  0: [
    'BIF',
    'CLP',
    'DJF',
    'GNF',
    'ISK',
    'JPY',
    'KMF',
    'KRW',
    'PYG',
    'RWF',
    'UGX',
    'UYI',
    'VND',
    'VUV',
    'XAF',
    'XOF',
    'XPF',
  ],
  3: ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'],
  4: ['CLF', 'UYW'],
};

export function minorUnits(currency: CurrencyCode): number {
  for (const [places, codes] of Object.entries(PLACES)) {
    if (codes.includes(currency)) return Number(places);
  }
  return 2;
}

export function normalizeAmount(text: string): string | undefined {
  let value = text.replace(/["\s,]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith('-') || value.startsWith('+')) {
    negative = negative !== value.startsWith('-');
    value = value.slice(1);
  }
  if (value.startsWith('.')) value = `0${value}`;
  if (!/^\d+(\.\d+)?$/.test(value)) return undefined;
  return negative ? `-${value}` : value;
}

export function decimalToScaled(decimal: string, places: number): number {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match) throw new Error(`Not a decimal amount: ${decimal}`);
  const [, sign, whole = '', fraction = ''] = match;
  const kept = fraction.padEnd(places, '0').slice(0, places);
  let value = Number(whole) * 10 ** places + Number(kept === '' ? '0' : kept);
  if ((fraction[places] ?? '0') >= '5') value += 1;
  if (!Number.isSafeInteger(value)) throw new Error(`Amount too large: ${decimal}`);
  return sign && value !== 0 ? -value : value;
}

export function decimalToMinor(decimal: string, currency: CurrencyCode): number {
  return decimalToScaled(decimal, minorUnits(currency));
}

export function minorToDecimal(minor: number, currency: CurrencyCode): string {
  const places = minorUnits(currency);
  const sign = minor < 0 ? '-' : '';
  const digits = Math.abs(minor)
    .toString()
    .padStart(places + 1, '0');
  if (places === 0) return sign + digits;
  return `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

export function majorToMinor(major: number, currency: CurrencyCode): number {
  let text = String(major);
  if (/e/i.test(text)) text = major.toFixed(12);
  const decimal = normalizeAmount(text);
  if (decimal === undefined) throw new Error(`Not an amount: ${major}`);
  return decimalToMinor(decimal, currency);
}

export function formatAmount(minor: number, currency: CurrencyCode, locale: string): string {
  const places = minorUnits(currency);
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
  return format.format(minorToDecimal(minor, currency) as Intl.StringNumericLiteral);
}
