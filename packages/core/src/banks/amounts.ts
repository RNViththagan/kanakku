import { normalizeAmount } from '../model/money';

function fractionLength(decimal: string): number {
  return decimal.split('.')[1]?.length ?? 0;
}

function scaled(decimal: string, places: number): bigint {
  const [whole = '0', fraction = ''] = decimal.replace('-', '').split('.');
  const value = BigInt(whole + fraction.padEnd(places, '0'));
  return decimal.startsWith('-') ? -value : value;
}

function unscaled(value: bigint, places: number): string {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(places + 1, '0');
  return places === 0
    ? sign + digits
    : `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

export function negateDecimal(decimal: string): string {
  return decimal.startsWith('-') ? decimal.slice(1) : `-${decimal}`;
}

export function signedAmount(credit: string, debit: string): string | undefined {
  const plus = normalizeAmount(credit);
  const minus = normalizeAmount(debit);
  if (minus === undefined) return plus;
  if (plus === undefined) return negateDecimal(minus);
  const places = Math.max(fractionLength(plus), fractionLength(minus));
  return unscaled(scaled(plus, places) - scaled(minus, places), places);
}
