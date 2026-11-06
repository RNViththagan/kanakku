import { describe, expect, it } from 'vitest';
import type { ParsedRow } from '../src/banks/types';
import { type MoneyRow, toChronological, toMoneyRows } from '../src/ledger/order';

let line = 0;
const row = (
  date: string,
  amount: number,
  balance?: number,
  description = `row ${line + 1}`,
): MoneyRow => {
  line += 1;
  const result: MoneyRow = { line, date, description, amount, file: 'f.csv', raw: [] };
  if (balance !== undefined) result.balance = balance;
  return result;
};
const amounts = (rows: MoneyRow[]) => rows.map((item) => item.amount);

describe('toMoneyRows', () => {
  it('converts decimal strings in the currency', () => {
    const parsed: ParsedRow[] = [
      { line: 3, date: '2026-01-01', description: 'x', amount: '-12.5', balance: '100', raw: [] },
    ];
    expect(toMoneyRows(parsed, 'USD', 'f.csv')).toEqual([
      {
        line: 3,
        date: '2026-01-01',
        description: 'x',
        amount: -1250,
        balance: 10000,
        file: 'f.csv',
        raw: [],
      },
    ]);
  });
});

describe('toChronological', () => {
  it('reverses a newest-first file', () => {
    const result = toChronological([
      row('2026-03-02', -500, 9500),
      row('2026-03-02', -1000, 10000),
      row('2026-03-01', 11000, 11000),
    ]);
    expect(result.direction).toBe('newest-first');
    expect(amounts(result.rows)).toEqual([11000, -1000, -500]);
    expect(result.issues).toEqual([]);
  });

  it('keeps an oldest-first file', () => {
    const rows = [
      row('2026-03-01', 100, 100),
      row('2026-03-02', 50, 150),
      row('2026-03-02', -20, 130),
    ];
    const result = toChronological(rows);
    expect(result.direction).toBe('oldest-first');
    expect(result.rows).toEqual(rows);
  });

  it('fixes a file that is newest first across days but oldest first within a day', () => {
    const result = toChronological([
      row('2026-03-03', -40, 100),
      row('2026-03-03', 5, 105),
      row('2026-03-02', -20, 130),
      row('2026-03-02', 10, 140),
      row('2026-03-01', 100, 100),
      row('2026-03-01', 50, 150),
    ]);
    expect(amounts(result.rows)).toEqual([100, 50, -20, 10, -40, 5]);
  });

  it('anchors a same-day reversal on its neighbours', () => {
    const result = toChronological([
      row('2026-03-01', 5000, 5000),
      row('2026-03-02', -1000, 5000),
      row('2026-03-02', 1000, 6000),
      row('2026-03-03', 100, 5100),
    ]);
    expect(amounts(result.rows)).toEqual([5000, 1000, -1000, 100]);
  });

  it('orders rows through a negative balance', () => {
    const result = toChronological([
      row('2026-03-03', 500, 200),
      row('2026-03-02', -800, -300),
      row('2026-03-01', 500, 500),
    ]);
    expect(result.rows.map((item) => item.balance)).toEqual([500, -300, 200]);
  });

  it('does not let zero-amount rows sway the vote', () => {
    const result = toChronological([
      row('2026-03-01', 100, 100),
      row('2026-03-02', 50, 150),
      row('2026-03-03', 0, 100),
    ]);
    expect(result.direction).toBe('oldest-first');
  });

  it('sorts rows without balances by date and keeps same-day order', () => {
    const a = row('2026-01-20', -1);
    const b = row('2026-01-08', -2);
    const c = row('2026-01-11', -3);
    const d = row('2026-01-11', -4);
    const result = toChronological([a, b, c, d]);
    expect(result.direction).toBe('unknown');
    expect(result.rows).toEqual([b, c, d, a]);
  });

  it('reports a day no order can fix', () => {
    const result = toChronological([
      row('2026-03-01', 1000, 1000),
      row('2026-03-02', 10, 2000),
      row('2026-03-02', 20, 3000),
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({ level: 'info', code: 'order-unresolved', date: '2026-03-02' }),
    ]);
    expect(amounts(result.rows)).toEqual([1000, 10, 20]);
  });

  it('accepts a day whose own chain holds even when the day before is missing rows', () => {
    const result = toChronological([
      row('2026-03-01', 1000, 1000),
      row('2026-03-05', 20, 520),
      row('2026-03-05', 500, 500),
    ]);
    expect(amounts(result.rows)).toEqual([1000, 500, 20]);
    expect(result.issues).toEqual([]);
  });
});
