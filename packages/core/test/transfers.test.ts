import { describe, expect, it } from 'vitest';
import type { WordingTag } from '../src/banks/types';
import type { Account } from '../src/config/schema';
import type { Decision } from '../src/decisions/load';
import { applyPairAnswers, matchTransfers } from '../src/ledger/transfers';
import type { Transaction } from '../src/ledger/types';

const account = (id: string, fields: Partial<Account> = {}): Account => ({
  id,
  name: id,
  bank: 'boc',
  type: 'savings',
  currency: 'LKR',
  ...fields,
});
const accounts = [
  account('A'),
  account('B', { bank: 'combank' }),
  account('C', { bank: 'hnb' }),
  account('D'),
  account('U', { bank: 'hnb', currency: 'USD' }),
  account('card', {
    bank: 'combank',
    type: 'credit-card',
    card: { statementDay: 5, dueDay: 26, openingOwed: 0 },
  }),
];
const coveredAll = Object.fromEntries(
  accounts.map((item) => [item.id, { firstKnown: '2025-01-01', lastCovered: '2026-12-31' }]),
);

interface Options {
  currency?: string;
  description?: string;
  reference?: string;
  tags?: WordingTag[];
  decidedBy?: Transaction['decidedBy'];
}
const tx = (
  id: string,
  acct: string,
  date: string,
  amount: number,
  options: Options = {},
): Transaction => {
  const result: Transaction = {
    id,
    account: acct,
    date,
    amount,
    currency: options.currency ?? 'LKR',
    description: options.description ?? 'transfer',
    sources: [],
    kind: '',
    category: '',
    tags: options.tags ?? [],
    parts: [],
  };
  if (options.reference) result.reference = options.reference;
  if (options.decidedBy) {
    result.decidedBy = options.decidedBy;
    result.kind = 'spending';
  }
  return result;
};

const run = (
  txns: Transaction[],
  extra: {
    decisions?: Decision[];
    coverage?: Record<string, { firstKnown?: string; lastCovered?: string }>;
    youNames?: string[];
  } = {},
) =>
  matchTransfers(txns, {
    accounts,
    windowDays: 3,
    fees: { LKR: [2500, 5000] },
    youNames: extra.youNames ?? [],
    coverage: extra.coverage ?? coveredAll,
    decisions: extra.decisions ?? [],
  });

const byId = (txns: Transaction[], id: string) => {
  const found = txns.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe('matchTransfers', () => {
  it('matches equal amounts within the window', () => {
    const result = run([tx('o', 'A', '2026-10-12', -4000000), tx('i', 'B', '2026-10-14', 4000000)]);
    expect(result.transfers).toEqual([
      expect.objectContaining({
        out: 'o',
        in: 'i',
        from: 'A',
        to: 'B',
        fee: 0,
        rule: 'exact',
        status: 'matched',
      }),
    ]);
    expect(byId(result.txns, 'o')).toMatchObject({ kind: 'transfer', decidedBy: 'match' });
    expect(byId(result.txns, 'i').parts).toEqual([
      { kind: 'transfer', category: '', amount: 4000000 },
    ]);
  });

  it('splits a fee the sender paid', () => {
    const result = run([tx('o', 'A', '2026-10-12', -4002500), tx('i', 'B', '2026-10-12', 4000000)]);
    expect(result.transfers[0]).toMatchObject({
      fee: 2500,
      rule: 'fee',
      amountOut: 4002500,
      amountIn: 4000000,
    });
    expect(byId(result.txns, 'o').parts).toEqual([
      { kind: 'transfer', category: '', amount: -4000000 },
      { kind: 'spending', category: 'Fees', amount: -2500 },
    ]);
  });

  it('matches when the receiver got less', () => {
    const result = run([tx('o', 'C', '2026-07-08', -800000), tx('i', 'A', '2026-07-09', 797500)]);
    expect(result.transfers[0]).toMatchObject({ fee: 2500, rule: 'fee' });
  });

  it('ignores pairs more than the window apart', () => {
    const result = run([tx('o', 'A', '2026-10-12', -4000000), tx('i', 'B', '2026-10-16', 4000000)]);
    expect(result.transfers).toEqual([]);
  });

  it('matches currencies only by a shared reference', () => {
    const rows = [
      tx('o', 'U', '2026-10-20', -60000, { currency: 'USD', reference: 'SD1' }),
      tx('i', 'C', '2026-10-20', 18000000, { reference: 'SD1' }),
    ];
    expect(run(rows).transfers).toEqual([
      expect.objectContaining({
        rule: 'reference',
        currencyOut: 'USD',
        currencyIn: 'LKR',
        fee: 0,
        amountIn: 18000000,
      }),
    ]);
    const other = [rows[0] as Transaction, { ...(rows[1] as Transaction), reference: 'SD2' }];
    expect(run(other).transfers).toEqual([]);
  });

  it('flags a tie instead of guessing', () => {
    const result = run([
      tx('x', 'A', '2026-03-01', -100000),
      tx('y', 'B', '2026-03-01', 100000),
      tx('z', 'C', '2026-03-01', 100000),
    ]);
    expect(result.transfers).toEqual([]);
    expect(result.txns.map((item) => item.flag)).toEqual(['ambiguous', 'ambiguous', 'ambiguous']);
  });

  it('resolves forced pairs before declaring a tie', () => {
    const result = run([
      tx('x', 'A', '2026-03-01', -100000),
      tx('y', 'B', '2026-03-01', 100000),
      tx('z', 'C', '2026-03-03', 100000),
      tx('w', 'D', '2026-03-05', -100000),
    ]);
    expect(result.transfers.map((item) => [item.out, item.in])).toEqual([
      ['x', 'y'],
      ['w', 'z'],
    ]);
    expect(result.txns.every((item) => item.flag === undefined)).toBe(true);
  });

  it('pairs interchangeable transfers', () => {
    const result = run([
      tx('a1', 'A', '2026-03-01', -500000),
      tx('a2', 'A', '2026-03-01', -500000),
      tx('b1', 'B', '2026-03-01', 500000),
      tx('b2', 'B', '2026-03-01', 500000),
    ]);
    expect(result.transfers.map((item) => [item.out, item.in])).toEqual([
      ['a1', 'b1'],
      ['a2', 'b2'],
    ]);
  });

  it('waits when another account has no statement yet for the window', () => {
    const coverage = { ...coveredAll, B: { firstKnown: '2025-01-01', lastCovered: '2026-11-03' } };
    const row = tx('o', 'A', '2026-11-05', -1000000, { tags: ['transfer-hint'] });
    expect(run([row], { coverage }).txns[0]?.flag).toBe('waiting');
    const withEmpty = { ...coveredAll, B: {} };
    expect(run([row], { coverage: withEmpty }).txns[0]?.flag).toBe('possible');
  });

  it('marks unmatched hinted rows as possible transfers', () => {
    const row = tx('o', 'A', '2026-11-05', -1000000, { tags: ['transfer-hint'] });
    expect(run([row]).txns[0]?.flag).toBe('possible');
    const named = tx('n', 'A', '2026-11-05', -1000000, { description: 'to A Perera savings' });
    expect(run([named], { youNames: ['a perera'] }).txns[0]?.flag).toBe('possible');
    expect(run([tx('p', 'A', '2026-11-05', -1000000)]).txns[0]?.flag).toBeUndefined();
  });

  it('honours answers', () => {
    const rows = [tx('o', 'A', '2026-03-01', -100000), tx('i', 'B', '2026-03-01', 100000)];
    const blocked = run(rows, {
      decisions: [{ id: 'd', at: 'x', type: 'not-transfer', txn: 'o' }],
    });
    expect(blocked.transfers).toEqual([]);
    const settled = run([
      { ...(rows[0] as Transaction), decidedBy: 'answer', kind: 'spending' },
      rows[1] as Transaction,
    ]);
    expect(settled.transfers).toEqual([]);
  });

  it('never pairs a same-day reversal on one account', () => {
    const result = run([tx('o', 'A', '2026-03-01', -100000), tx('i', 'A', '2026-03-01', 100000)]);
    expect(result.transfers).toEqual([]);
  });

  it('never matches card spending or purchases automatically', () => {
    const card = run([tx('o', 'card', '2026-03-01', -500000), tx('i', 'A', '2026-03-01', 500000)]);
    expect(card.transfers).toEqual([]);
    const purchase = run([
      tx('o', 'A', '2026-03-01', -200000, { tags: ['purchase'] }),
      tx('i', 'B', '2026-03-01', 200000),
    ]);
    expect(purchase.transfers).toEqual([]);
  });

  it('links a card payment to a card without statements for that date', () => {
    const coverage = {
      ...coveredAll,
      card: { firstKnown: '2026-02-01', lastCovered: '2026-03-05' },
    };
    const row = tx('o', 'A', '2026-01-05', -1000000, { tags: ['card-payment'] });
    const result = run([row], { coverage });
    expect(result.transfers).toEqual([
      expect.objectContaining({
        out: 'o',
        from: 'A',
        to: 'card',
        status: 'one-sided',
        rule: 'wording',
      }),
    ]);
    expect(result.txns[0]).toMatchObject({ kind: 'transfer', transfer: result.transfers[0]?.id });
  });

  it('follows counterparty answers', () => {
    const row = tx('o', 'B', '2026-09-25', -200000, {
      description: 'SAVER PLUS AC',
      tags: ['transfer-hint'],
    });
    const mine: Decision[] = [
      { id: 'd', at: 'x', type: 'counterparty', text: 'saver plus', mine: true, account: 'D' },
    ];
    expect(run([row], { decisions: mine }).transfers).toEqual([
      expect.objectContaining({ from: 'B', to: 'D', status: 'one-sided', rule: 'counterparty' }),
    ]);
    const notMine: Decision[] = [
      { id: 'd', at: 'x', type: 'counterparty', text: 'SAVER PLUS', mine: false },
    ];
    const result = run([row], { decisions: notMine });
    expect(result.transfers).toEqual([]);
    expect(result.txns[0]?.flag).toBeUndefined();
  });
});

describe('applyPairAnswers', () => {
  it('confirms answered pairs even over wording', () => {
    const rows = [
      tx('o', 'B', '2026-03-29', -10000000, { tags: ['deposit-placement'], decidedBy: 'wording' }),
      tx('i', 'D', '2026-03-29', 10000000),
    ];
    const decisions: Decision[] = [{ id: 'd', at: 'x', type: 'pair', out: 'o', in: 'i' }];
    const result = applyPairAnswers(rows, decisions);
    expect(result.transfers).toEqual([
      expect.objectContaining({ out: 'o', in: 'i', status: 'confirmed', rule: 'answer' }),
    ]);
    expect(byId(result.txns, 'o')).toMatchObject({ kind: 'transfer', decidedBy: 'answer' });
  });
});
