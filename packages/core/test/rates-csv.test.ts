import { describe, expect, it } from 'vitest';
import { parseRatesCsv, serializeRatesCsv } from '../src/rates/csv';
import type { RateQuote } from '../src/rates/types';

const quotes: RateQuote[] = [
  { currency: 'USD', date: '2026-11-05', buying: '328.5', source: 'numbers-lk:HNB' },
  { currency: 'USD', date: '2026-11-06', buying: '328.75', selling: '336', source: 'hnb' },
];

describe('rates CSV', () => {
  it('round-trips quotes in date order', () => {
    const text = serializeRatesCsv([...quotes].reverse());
    expect(text.split('\n')[0]).toBe('date,buying,selling,source');
    expect(parseRatesCsv(text, 'USD')).toEqual(quotes);
  });

  it('skips blank and broken lines', () => {
    const text =
      'date,buying,selling,source\n\n2026-13-01,1,,hnb\nnot,a,row\n2026-11-06,328.75,,hnb\n';
    expect(parseRatesCsv(text, 'USD')).toEqual([
      { currency: 'USD', date: '2026-11-06', buying: '328.75', source: 'hnb' },
    ]);
  });
});
