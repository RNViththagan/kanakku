import { describe, expect, it } from 'vitest';
import type { Transaction, Transfer } from '../src/ledger/types';
import {
  buildConversions,
  type Conversion,
  decimalToMicro,
  makeRateBook,
} from '../src/ledger/valuation';
import type { RateQuote } from '../src/rates/types';

const row = (
  id: string,
  account: string,
  amount: number,
  currency: string,
  reference?: string,
): Transaction => {
  const result: Transaction = {
    id,
    account,
    date: '2026-10-20',
    amount,
    currency,
    description: id,
    sources: [],
    kind: 'transfer',
    category: '',
    tags: [],
    parts: [],
  };
  if (reference) result.reference = reference;
  return result;
};

const conversion = (
  date: string,
  micro: number,
  currencyOut = 'USD',
  currencyIn = 'LKR',
): Conversion => ({
  id: `c${date}`,
  transfer: `t${date}`,
  date,
  from: 'usd',
  to: 'lkr',
  amountOut: 100,
  currencyOut,
  amountIn: 100,
  currencyIn,
  micro,
});

const quote = (date: string, buying: string, source = 'hnb'): RateQuote => ({
  currency: 'USD',
  date,
  buying,
  source,
});

describe('decimalToMicro', () => {
  it('keeps six places exactly', () => {
    expect(decimalToMicro('328.75')).toBe(328750000);
    expect(decimalToMicro('328.123456')).toBe(328123456);
    expect(decimalToMicro('2.05')).toBe(2050000);
  });
});

describe('buildConversions', () => {
  it('records the rate achieved', () => {
    const out = row('o', 'usd', -60000, 'USD', 'SD1');
    const incoming = row('i', 'lkr', 18000000, 'LKR', 'SD1');
    const transfer: Transfer = {
      id: 't1',
      out: 'o',
      in: 'i',
      from: 'usd',
      to: 'lkr',
      date: '2026-10-20',
      amountOut: 60000,
      currencyOut: 'USD',
      amountIn: 18000000,
      currencyIn: 'LKR',
      fee: 0,
      rule: 'reference',
      status: 'matched',
    };
    const same: Transfer = { ...transfer, id: 't2', currencyIn: 'USD', amountIn: 60000 };
    const result = buildConversions(
      [transfer, same],
      new Map([
        ['o', out],
        ['i', incoming],
      ]),
    );
    expect(result).toEqual([
      expect.objectContaining({
        transfer: 't1',
        date: '2026-10-20',
        from: 'usd',
        to: 'lkr',
        amountOut: 60000,
        currencyOut: 'USD',
        amountIn: 18000000,
        currencyIn: 'LKR',
        micro: 300000000,
        reference: 'SD1',
      }),
    ]);
  });
});

describe('makeRateBook', () => {
  const book = (fields: Partial<Parameters<typeof makeRateBook>[0]>) =>
    makeRateBook({
      home: 'LKR',
      source: 'hnb',
      stored: [],
      conversions: [],
      manual: {},
      ...fields,
    });

  it('uses the manual rate first when it is the source', () => {
    const rates = book({
      source: 'manual',
      stored: [quote('2026-11-06', '328.75')],
      manual: { USD: '330' },
    });
    expect(rates.rateOn('USD', '2026-11-06')).toEqual({
      micro: 330000000,
      date: '2026-11-06',
      source: 'manual',
    });
  });

  it('uses the selected source on the day, then its nearest earlier rate', () => {
    const stored = [
      quote('2026-11-06', '328.75'),
      quote('2026-11-06', '328.50', 'numbers-lk:HNB'),
      quote('2026-11-01', '327.00'),
    ];
    const rates = book({ stored });
    expect(rates.rateOn('USD', '2026-11-06')).toEqual({
      micro: 328750000,
      date: '2026-11-06',
      source: 'hnb',
    });
    expect(rates.rateOn('USD', '2026-11-08')).toEqual({
      micro: 328750000,
      date: '2026-11-06',
      source: 'hnb',
    });
    expect(rates.rateOn('USD', '2026-11-03')).toEqual({
      micro: 327000000,
      date: '2026-11-01',
      source: 'hnb',
    });
  });

  it('treats source variants as the selected source', () => {
    const rates = book({
      source: 'numbers-lk',
      stored: [quote('2026-11-06', '328.50', 'numbers-lk:HNB')],
    });
    expect(rates.rateOn('USD', '2026-11-06')?.source).toBe('numbers-lk:HNB');
  });

  it('falls back to any stored source, then conversions, then manual', () => {
    const anySource = book({ stored: [quote('2026-11-01', '327.10', 'numbers-lk:BOC')] });
    expect(anySource.rateOn('USD', '2026-11-05')?.source).toBe('numbers-lk:BOC');
    const conversions = [conversion('2026-03-31', 311850000), conversion('2026-08-01', 332000000)];
    const fromConversions = book({ conversions });
    expect(fromConversions.rateOn('USD', '2026-03-01')).toEqual({
      micro: 311850000,
      date: '2026-03-31',
      source: 'conversion',
    });
    expect(book({ manual: { USD: '330.5' } }).rateOn('USD', '2026-03-01')).toEqual({
      micro: 330500000,
      date: '2026-03-01',
      source: 'manual',
    });
    expect(book({}).rateOn('USD', '2026-03-01')).toBeUndefined();
  });

  it('only learns from conversions into the home currency', () => {
    const rates = book({ conversions: [conversion('2026-03-31', 3205, 'LKR', 'USD')] });
    expect(rates.rateOn('USD', '2026-03-31')).toBeUndefined();
  });

  it('values amounts in the home currency exactly', () => {
    const rates = book({ manual: { USD: '328.75', JPY: '2.05' }, source: 'manual' });
    expect(rates.toHome(125000, 'USD', '2026-11-06')?.value).toBe(41093750);
    expect(rates.toHome(-125000, 'USD', '2026-11-06')?.value).toBe(-41093750);
    expect(rates.toHome(1500, 'JPY', '2026-11-06')?.value).toBe(307500);
    expect(
      book({ manual: { USD: '328.123456' }, source: 'manual' }).toHome(100000, 'USD', '2026-11-06')
        ?.value,
    ).toBe(32812346);
    expect(rates.toHome(5000, 'LKR', '2026-11-06')).toEqual({ value: 5000 });
    expect(book({}).toHome(100, 'USD', '2026-11-06')).toBeUndefined();
  });
});
