import { describe, expect, it } from 'vitest';
import {
  decimalToMinor,
  formatAmount,
  majorToMinor,
  minorToDecimal,
  minorUnits,
  normalizeAmount,
} from '../src/model/money';

describe('minorUnits', () => {
  it('uses the ISO 4217 places', () => {
    expect(minorUnits('LKR')).toBe(2);
    expect(minorUnits('JPY')).toBe(0);
    expect(minorUnits('KWD')).toBe(3);
  });
});

describe('normalizeAmount', () => {
  it('strips quotes and thousand separators', () => {
    expect(normalizeAmount('"1,397,855.95"')).toBe('1397855.95');
  });

  it('keeps plain numbers', () => {
    expect(normalizeAmount('25')).toBe('25');
  });

  it('reads parentheses and minus signs as negative', () => {
    expect(normalizeAmount('(12.50)')).toBe('-12.50');
    expect(normalizeAmount('-1,000.00')).toBe('-1000.00');
  });

  it('returns undefined for empty or non-numeric text', () => {
    expect(normalizeAmount('')).toBeUndefined();
    expect(normalizeAmount('abc')).toBeUndefined();
    expect(normalizeAmount('—')).toBeUndefined();
  });
});

describe('decimalToMinor', () => {
  it('converts to minor units of the currency', () => {
    expect(decimalToMinor('1397855.95', 'LKR')).toBe(139785595);
    expect(decimalToMinor('25', 'LKR')).toBe(2500);
    expect(decimalToMinor('1500', 'JPY')).toBe(1500);
    expect(decimalToMinor('-12.5', 'USD')).toBe(-1250);
  });

  it('rounds extra places half away from zero', () => {
    expect(decimalToMinor('0.385', 'USD')).toBe(39);
    expect(decimalToMinor('-0.385', 'USD')).toBe(-39);
  });
});

describe('minorToDecimal and majorToMinor', () => {
  it('formats minor units as a decimal string', () => {
    expect(minorToDecimal(-1250, 'USD')).toBe('-12.50');
    expect(minorToDecimal(5, 'LKR')).toBe('0.05');
    expect(minorToDecimal(1500, 'JPY')).toBe('1500');
  });

  it('converts config numbers without float error', () => {
    expect(majorToMinor(300000, 'LKR')).toBe(30000000);
    expect(majorToMinor(0.1, 'USD')).toBe(10);
  });
});

describe('formatAmount', () => {
  it('groups digits and keeps the currency places', () => {
    expect(formatAmount(139785595, 'LKR', 'en-US')).toBe('1,397,855.95');
    expect(formatAmount(-1250, 'USD', 'en-US')).toBe('-12.50');
  });
});
