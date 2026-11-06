import { describe, expect, it } from 'vitest';
import { mergeAccountFiles } from '../src/ledger/merge';
import type { MoneyRow } from '../src/ledger/order';

const row = (
  file: string,
  line: number,
  date: string,
  amount: number,
  balance?: number,
  description = 'purchase',
  reference?: string,
): MoneyRow => {
  const result: MoneyRow = { file, line, date, description, amount, raw: [] };
  if (balance !== undefined) result.balance = balance;
  if (reference !== undefined) result.reference = reference;
  return result;
};

const janFeb = {
  path: 'jan-feb.csv',
  newness: '2026-02-28',
  rows: [
    row('jan-feb.csv', 2, '2026-01-10', 10000, 10000, 'salary'),
    row('jan-feb.csv', 3, '2026-02-05', -2000, 8000, 'rent'),
    row('jan-feb.csv', 4, '2026-02-20', -500, 7500, 'food'),
  ],
};
const febMar = {
  path: 'feb-mar.csv',
  newness: '2026-03-31',
  rows: [
    row('feb-mar.csv', 2, '2026-02-05', -2000, 8000, 'rent'),
    row('feb-mar.csv', 3, '2026-02-20', -500, 7500, 'food'),
    row('feb-mar.csv', 4, '2026-03-02', -100, 7400, 'bus'),
  ],
};

describe('mergeAccountFiles', () => {
  it('counts rows in overlapping files once and lists both sources', () => {
    const { transactions, breaks } = mergeAccountFiles('main', 'LKR', [janFeb, febMar]);
    expect(transactions.map((t) => t.description)).toEqual(['salary', 'rent', 'food', 'bus']);
    expect(transactions[1]?.sources).toEqual([
      { file: 'feb-mar.csv', line: 2 },
      { file: 'jan-feb.csv', line: 3 },
    ]);
    expect(transactions[0]).toMatchObject({
      account: 'main',
      currency: 'LKR',
      amount: 10000,
      balance: 10000,
      kind: '',
      category: '',
      tags: [],
      parts: [],
    });
    expect(breaks).toEqual([]);
  });

  it('keeps identical purchases on one day, without doubling them across files', () => {
    const one = {
      path: 'a.csv',
      newness: '2026-01-31',
      rows: [
        row('a.csv', 2, '2026-01-05', -300, undefined, 'coffee'),
        row('a.csv', 3, '2026-01-05', -300, undefined, 'coffee'),
      ],
    };
    expect(mergeAccountFiles('card', 'LKR', [one]).transactions).toHaveLength(2);
    const two = { ...one, path: 'b.csv', newness: '2026-02-01' };
    expect(mergeAccountFiles('card', 'LKR', [one, two]).transactions).toHaveLength(2);
  });

  it('merges card rows by reference', () => {
    const a = {
      path: 'a.csv',
      newness: '2026-01-20',
      rows: [
        row('a.csv', 2, '2026-01-05', -300, undefined, 'SHOP / 000000000001 / -', '000000000001'),
        row('a.csv', 3, '2026-01-05', -300, undefined, 'SHOP / 000000000002 / -', '000000000002'),
      ],
    };
    const b = {
      ...a,
      path: 'b.csv',
      newness: '2026-01-25',
      rows: a.rows.slice(0, 1).map((r) => ({ ...r, file: 'b.csv' })),
    };
    const merged = mergeAccountFiles('card', 'LKR', [a, b]).transactions;
    expect(merged.map((t) => t.reference)).toEqual(['000000000001', '000000000002']);
  });

  it('keeps ids when files come in another order or a new file is added', () => {
    const ids = (files: Parameters<typeof mergeAccountFiles>[2]) =>
      mergeAccountFiles('main', 'LKR', files).transactions.map((t) => t.id);
    const first = ids([janFeb, febMar]);
    expect(ids([febMar, janFeb])).toEqual(first);
    const extra = {
      path: 'mar.csv',
      newness: '2026-04-01',
      rows: [
        row('mar.csv', 2, '2026-03-02', -100, 7400, 'bus'),
        row('mar.csv', 3, '2026-03-09', -50, 7350, 'tea'),
      ],
    };
    const withExtra = ids([janFeb, febMar, extra]);
    expect(withExtra.slice(0, 4)).toEqual(first);
    expect(new Set(withExtra).size).toBe(5);
  });

  it('keeps a same-day reversal', () => {
    const file = {
      path: 'a.csv',
      newness: '2026-01-31',
      rows: [
        row('a.csv', 2, '2026-01-05', -1000, 4000, 'transfer'),
        row('a.csv', 3, '2026-01-05', 1000, 5000, 'transfer'),
      ],
    };
    expect(mergeAccountFiles('main', 'LKR', [file]).transactions.map((t) => t.amount)).toEqual([
      -1000, 1000,
    ]);
  });

  it('takes the balance from the newest file, and by path when equally new', () => {
    const older = {
      path: 'b.csv',
      newness: '2026-01-31',
      rows: [row('b.csv', 2, '2026-01-05', 100, 200)],
    };
    const newer = {
      path: 'a.csv',
      newness: '2026-02-01',
      rows: [row('a.csv', 2, '2026-01-05', 100, 100)],
    };
    expect(mergeAccountFiles('main', 'LKR', [older, newer]).transactions[0]?.balance).toBe(100);
    const sameDay = { ...older, newness: '2026-02-01' };
    expect(mergeAccountFiles('main', 'LKR', [sameDay, newer]).transactions[0]?.balance).toBe(100);
  });

  it('flags files that disagree inside their overlap', () => {
    const older = {
      path: 'older.csv',
      newness: '2026-02-10',
      rows: [
        row('older.csv', 2, '2026-02-01', 100, 100, 'in'),
        row('older.csv', 3, '2026-02-02', 50, 150, 'pending'),
        row('older.csv', 4, '2026-02-03', -20, 130, 'out'),
      ],
    };
    const newer = {
      path: 'newer.csv',
      newness: '2026-02-20',
      rows: [
        row('newer.csv', 2, '2026-02-01', 100, 100, 'in'),
        row('newer.csv', 3, '2026-02-03', -20, 80, 'out'),
      ],
    };
    const { transactions, breaks } = mergeAccountFiles('main', 'LKR', [older, newer]);
    expect(transactions.map((t) => t.description)).toEqual(['in', 'pending', 'out']);
    expect(breaks).toEqual([
      {
        account: 'main',
        before: { date: '2026-02-02', file: 'older.csv', balance: 150 },
        after: { date: '2026-02-03', file: 'newer.csv', amount: -20, balance: 80 },
      },
    ]);
  });
});
