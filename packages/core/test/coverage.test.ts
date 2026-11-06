import { describe, expect, it } from 'vitest';
import type { ParsedStatement } from '../src/banks/types';
import type { Account } from '../src/config/schema';
import { accountCoverage, filePeriod } from '../src/ledger/coverage';
import type { MoneyRow } from '../src/ledger/order';
import type { ChainBreak, Transaction } from '../src/ledger/types';

const statement = (fields: Partial<ParsedStatement> = {}): ParsedStatement => ({
  account: {},
  rows: [],
  issues: [],
  ...fields,
});
const moneyRow = (date: string, amount = -100, balance?: number): MoneyRow => {
  const row: MoneyRow = { line: 1, date, description: 'x', amount, file: 'f.csv', raw: [] };
  if (balance !== undefined) row.balance = balance;
  return row;
};
const txn = (date: string, amount: number, balance?: number): Transaction => {
  const result: Transaction = {
    id: `${date}${amount}`,
    account: 'main',
    date,
    amount,
    currency: 'LKR',
    description: 'x',
    sources: [],
    kind: '',
    category: '',
    tags: [],
    parts: [],
  };
  if (balance !== undefined) result.balance = balance;
  return result;
};
const main: Account = { id: 'main', name: 'Main', bank: 'boc', type: 'savings', currency: 'LKR' };
const tidy = 'BOC_0012345678_2026-01-01_to_2026-03-31.csv';

describe('filePeriod', () => {
  it('prefers a stated period, then the tidy name, then an inferred one, then rows', () => {
    const stated = { from: '2026-01-05', to: '2026-03-30' };
    expect(filePeriod(statement({ period: stated }), tidy, [])).toEqual({
      ...stated,
      source: 'stated',
    });
    const inferred = { from: '2026-02-01', to: '2026-02-28', inferred: true };
    expect(filePeriod(statement({ period: inferred }), tidy, [])).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
      source: 'tidy-name',
    });
    expect(filePeriod(statement({ period: inferred }), 'x.csv', [])).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      source: 'inferred',
    });
    const rows = [moneyRow('2026-01-10'), moneyRow('2026-01-03')];
    expect(filePeriod(statement(), 'x.csv', rows)).toEqual({
      from: '2026-01-03',
      to: '2026-01-10',
      source: 'rows',
    });
  });

  it('extends to the generation day only when it is close to the last row', () => {
    const rows = [moneyRow('2026-03-30')];
    expect(filePeriod(statement({ generatedAt: '2026-04-01' }), 'x.csv', rows)?.to).toBe(
      '2026-04-01',
    );
    expect(filePeriod(statement({ generatedAt: '2026-10-17' }), 'x.csv', rows)?.to).toBe(
      '2026-03-30',
    );
  });

  it('runs to a stated closing date, and uses it alone when there are no rows', () => {
    const closing = { date: '2026-03-31', balance: '10' };
    expect(filePeriod(statement({ closing }), 'x.csv', [moneyRow('2026-03-04')])?.to).toBe(
      '2026-03-31',
    );
    expect(filePeriod(statement({ closing }), 'x.csv', [])).toEqual({
      from: '2026-03-31',
      to: '2026-03-31',
      source: 'rows',
    });
    expect(filePeriod(statement(), 'x.csv', [])).toBeUndefined();
  });
});

describe('accountCoverage', () => {
  const today = '2026-04-03';
  const jan = { path: 'jan.csv', period: { from: '2026-01-01', to: '2026-01-31' } };
  const feb = { path: 'feb.csv', period: { from: '2026-02-01', to: '2026-02-28' } };
  const mar = { path: 'mar.csv', period: { from: '2026-03-01', to: '2026-03-31' } };

  it('joins overlapping and touching periods', () => {
    const late = { path: 'late.csv', period: { from: '2026-01-15', to: '2026-02-10' } };
    const result = accountCoverage({
      account: main,
      files: [feb, late, jan],
      transactions: [],
      breaks: [],
      today,
    });
    expect(result.segments).toEqual([{ from: '2026-01-01', to: '2026-02-28', state: 'covered' }]);
    expect(result.firstKnown).toBe('2026-01-01');
    expect(result.lastCovered).toBe('2026-02-28');
  });

  it('calls a hole quiet when the balance carries across it', () => {
    const transactions = [txn('2026-01-20', 1000, 1000), txn('2026-03-05', 100, 1100)];
    const result = accountCoverage({
      account: main,
      files: [jan, mar],
      transactions,
      breaks: [],
      today,
    });
    expect(result.segments).toEqual([
      { from: '2026-01-01', to: '2026-01-31', state: 'covered' },
      { from: '2026-02-01', to: '2026-02-28', state: 'quiet' },
      { from: '2026-03-01', to: '2026-03-31', state: 'covered' },
    ]);
  });

  it('calls a hole missing when the chain breaks across it', () => {
    const transactions = [txn('2026-01-20', 1000, 1000), txn('2026-03-05', 100, 900)];
    const breaks: ChainBreak[] = [
      {
        account: 'main',
        before: { date: '2026-01-20', file: 'jan.csv', balance: 1000 },
        after: { date: '2026-03-05', file: 'mar.csv', amount: 100, balance: 900 },
      },
    ];
    const result = accountCoverage({
      account: main,
      files: [jan, mar],
      transactions,
      breaks,
      today,
    });
    expect(result.segments[1]).toEqual({ from: '2026-02-01', to: '2026-02-28', state: 'missing' });
    expect(result.brokenChains).toEqual([]);
  });

  it('reports a break inside covered time as a broken chain', () => {
    const breaks: ChainBreak[] = [
      {
        account: 'main',
        before: { date: '2026-01-10', file: 'jan.csv', balance: 1000 },
        after: { date: '2026-01-12', file: 'jan.csv', amount: 5, balance: 2000 },
      },
    ];
    const result = accountCoverage({
      account: main,
      files: [jan],
      transactions: [],
      breaks,
      today,
    });
    expect(result.segments).toEqual([{ from: '2026-01-01', to: '2026-01-31', state: 'covered' }]);
    expect(result.brokenChains).toEqual(breaks);
  });

  it('counts a month with only a closing balance as covered', () => {
    const quietFeb = { ...feb, closing: { date: '2026-02-28', balance: 1000 } };
    const transactions = [txn('2026-01-20', 1000, 1000), txn('2026-03-05', 100, 1100)];
    const result = accountCoverage({
      account: main,
      files: [jan, quietFeb, mar],
      transactions,
      breaks: [],
      today,
    });
    expect(result.segments).toEqual([{ from: '2026-01-01', to: '2026-03-31', state: 'covered' }]);
  });

  it('checks the time between opening and the first statement', () => {
    const opened = { ...main, opened: '2025-12-01' };
    const empty = accountCoverage({
      account: opened,
      files: [jan],
      transactions: [txn('2026-01-05', 500, 500)],
      breaks: [],
      today,
    });
    expect(empty.segments[0]).toEqual({ from: '2025-12-01', to: '2025-12-31', state: 'quiet' });
    const funded = accountCoverage({
      account: opened,
      files: [jan],
      transactions: [txn('2026-01-05', 500, 800)],
      breaks: [],
      today,
    });
    expect(funded.segments[0]).toEqual({ from: '2025-12-01', to: '2025-12-31', state: 'missing' });
    expect(funded.firstKnown).toBe('2026-01-01');
  });

  it('says how far statements are behind, except for closed accounts', () => {
    const october = { path: 'oct.csv', period: { from: '2026-10-01', to: '2026-10-28' } };
    const input = { files: [october], transactions: [], breaks: [], today: '2026-11-06' };
    expect(accountCoverage({ account: main, ...input }).behindDays).toBe(9);
    expect(
      accountCoverage({ account: main, ...input, today: '2026-11-02' }).behindDays,
    ).toBeUndefined();
    expect(
      accountCoverage({ account: { ...main, closed: '2026-10-28' }, ...input }).behindDays,
    ).toBeUndefined();
  });

  it('ignores time after an account closed', () => {
    const result = accountCoverage({
      account: { ...main, closed: '2026-01-15' },
      files: [jan],
      transactions: [],
      breaks: [],
      today,
    });
    expect(result.segments).toEqual([{ from: '2026-01-01', to: '2026-01-15', state: 'covered' }]);
  });
});
