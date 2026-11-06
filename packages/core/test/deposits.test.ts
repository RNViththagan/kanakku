import { describe, expect, it } from 'vitest';
import type { WordingTag } from '../src/banks/types';
import type { Account } from '../src/config/schema';
import type { Decision } from '../src/decisions/load';
import { trackDeposits } from '../src/ledger/deposits';
import type { Transaction } from '../src/ledger/types';

const savings: Account = {
  id: 'cb',
  name: 'ComBank',
  bank: 'combank',
  type: 'savings',
  currency: 'LKR',
};
const usd: Account = { id: 'usd', name: 'HNB USD', bank: 'hnb', type: 'savings', currency: 'USD' };

const tx = (
  id: string,
  account: string,
  date: string,
  amount: number,
  tags: WordingTag[],
  deposit?: string,
  currency = 'LKR',
): Transaction => {
  const row: Transaction = {
    id,
    account,
    date,
    amount,
    currency,
    description: id,
    sources: [],
    kind: '',
    category: '',
    tags,
    parts: [],
  };
  if (deposit) row.deposit = deposit;
  return row;
};

const run = (
  txns: Transaction[],
  accounts: Account[] = [savings, usd],
  decisions: Decision[] = [],
) => trackDeposits(txns, { accounts, decisions });

describe('trackDeposits', () => {
  it('discovers a deposit from a placement and links it', () => {
    const result = run([
      tx('p', 'cb', '2026-03-29', -10000000, ['deposit-placement'], '003012345678'),
    ]);
    expect(result.accounts).toEqual([
      expect.objectContaining({
        id: 'deposit-combank-003012345678',
        bank: 'combank',
        type: 'fixed-deposit',
        currency: 'LKR',
        number: '003012345678',
        discovered: true,
      }),
    ]);
    expect(result.transfers).toEqual([
      expect.objectContaining({
        out: 'p',
        from: 'cb',
        to: 'deposit-combank-003012345678',
        rule: 'deposit',
        status: 'one-sided',
        amountOut: 10000000,
      }),
    ]);
    expect(result.txns[0]).toMatchObject({ kind: 'transfer', transfer: result.transfers[0]?.id });
    expect(result.moves).toEqual([
      { account: 'deposit-combank-003012345678', date: '2026-03-29', amount: 10000000 },
    ]);
  });

  it('splits closure proceeds into principal and interest', () => {
    const result = run([
      tx('p', 'usd', '2026-06-15', -200000, ['deposit-placement'], '900000000016', 'USD'),
      tx('c', 'usd', '2026-09-15', 202130, ['deposit-closure'], '900000000016', 'USD'),
    ]);
    expect(result.txns[1]?.parts).toEqual([
      { kind: 'transfer', category: '', amount: 200000 },
      { kind: 'income', category: 'Interest', amount: 2130 },
    ]);
    expect(result.needs).toEqual([]);
  });

  it('asks for the principal of a closure it never saw placed', () => {
    const closure = tx(
      'c',
      'usd',
      '2026-09-15',
      202130,
      ['deposit-closure'],
      '900000000025',
      'USD',
    );
    const result = run([closure]);
    expect(result.txns[0]?.parts).toEqual([{ kind: 'transfer', category: '', amount: 202130 }]);
    expect(result.needs).toEqual([
      expect.objectContaining({
        type: 'deposit-principal',
        refs: expect.objectContaining({ account: 'deposit-hnb-900000000025' }),
      }),
    ]);
    const answered = run(
      [closure],
      [savings, usd],
      [
        {
          id: 'd',
          at: 'x',
          type: 'fd-principal',
          deposit: 'deposit-hnb-900000000025',
          principal: '2000.00',
        },
      ],
    );
    expect(answered.txns[0]?.parts).toEqual([
      { kind: 'transfer', category: '', amount: 200000 },
      { kind: 'income', category: 'Interest', amount: 2130 },
    ]);
    expect(answered.needs).toEqual([]);
  });

  it('uses a config principal for a deposit placed before the statements', () => {
    const configured: Account = {
      id: 'fd',
      name: 'Old deposit',
      bank: 'combank',
      type: 'fixed-deposit',
      currency: 'LKR',
      number: '003099999999',
      deposit: { principal: 50000000, start: '2025-12-01' },
    };
    const result = run(
      [tx('c', 'cb', '2026-12-01', 51234500, ['deposit-closure'], '003099999999')],
      [savings, configured],
    );
    expect(result.txns[0]?.parts).toEqual([
      { kind: 'transfer', category: '', amount: 50000000 },
      { kind: 'income', category: 'Interest', amount: 1234500 },
    ]);
    expect(result.moves).toEqual([
      { account: 'fd', date: '2025-12-01', amount: 50000000 },
      { account: 'fd', date: '2026-12-01', amount: -50000000 },
    ]);
    expect(result.needs).toEqual([]);
  });

  it('sends a return without a number to the oldest matching deposit, else the pool', () => {
    const result = run([
      tx('p1', 'cb', '2026-01-10', -10000000, ['deposit-placement'], '003000000001'),
      tx('p2', 'cb', '2026-02-10', -10000000, ['deposit-placement'], '003000000002'),
      tx('r1', 'cb', '2026-07-10', 10000000, ['deposit-return']),
      tx('r2', 'cb', '2026-07-11', 7000000, ['deposit-return']),
    ]);
    const to = (id: string) => result.transfers.find((transfer) => transfer.in === id)?.from;
    expect(to('r1')).toBe('deposit-combank-003000000001');
    expect(to('r2')).toBe('deposit-combank-lkr-pool');
  });

  it('seeds a config deposit only when no placement shows it', () => {
    const configured: Account = {
      id: 'fd',
      name: 'Deposit',
      bank: 'combank',
      type: 'fixed-deposit',
      currency: 'LKR',
      number: '003012345678',
      deposit: { principal: 10000000, start: '2026-03-29' },
    };
    const placed = run(
      [tx('p', 'cb', '2026-03-29', -10000000, ['deposit-placement'], '003012345678')],
      [savings, configured],
    );
    expect(placed.moves).toEqual([{ account: 'fd', date: '2026-03-29', amount: 10000000 }]);
    expect(placed.accounts).toEqual([]);
    const notPlaced = run([], [savings, configured]);
    expect(notPlaced.moves).toEqual([{ account: 'fd', date: '2026-03-29', amount: 10000000 }]);
    expect(notPlaced.needs).toEqual([]);
  });

  it('keeps the statement amount when it differs from config', () => {
    const configured: Account = {
      id: 'fd',
      name: 'Deposit',
      bank: 'combank',
      type: 'fixed-deposit',
      currency: 'LKR',
      number: '003012345678',
      deposit: { principal: 9000000 },
    };
    const result = run(
      [tx('p', 'cb', '2026-03-29', -10000000, ['deposit-placement'], '003012345678')],
      [savings, configured],
    );
    expect(result.moves).toEqual([{ account: 'fd', date: '2026-03-29', amount: 10000000 }]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['deposit-principal-mismatch']);
  });

  it('never goes below zero', () => {
    const result = run([
      tx('p', 'cb', '2026-01-10', -50000, ['deposit-placement']),
      tx('r', 'cb', '2026-06-10', 200000, ['deposit-return']),
    ]);
    expect(result.moves).toEqual([
      { account: 'deposit-combank-lkr-pool', date: '2026-01-10', amount: 50000 },
      { account: 'deposit-combank-lkr-pool', date: '2026-06-10', amount: -50000 },
    ]);
    expect(result.needs.map((need) => need.type)).toEqual(['deposit-before-statements']);
  });

  it('matches deposit numbers with or without leading zeros', () => {
    const result = run([
      tx('p', 'cb', '2026-06-01', -15000000, ['deposit-placement'], '003011112222'),
      tx('i', 'cb', '2026-07-01', 88767, ['deposit-interest'], '3011112222'),
      tx('r', 'cb', '2026-07-01', 15000000, ['deposit-return'], '3011112222'),
    ]);
    expect(result.accounts.map((account) => account.id)).toEqual(['deposit-combank-003011112222']);
    expect(result.transfers.find((transfer) => transfer.in === 'r')?.from).toBe(
      'deposit-combank-003011112222',
    );
    expect(result.moves.reduce((sum, move) => sum + move.amount, 0)).toBe(0);
    expect(result.needs).toEqual([]);
  });

  it('matches an early redemption with a little interest to the closest open deposit', () => {
    const result = run([
      tx('p1', 'cb', '2026-08-03', -50000000, ['deposit-placement'], '003000000011'),
      tx('p2', 'cb', '2026-08-03', -60000000, ['deposit-placement'], '003000000012'),
      tx('p3', 'cb', '2026-08-03', -65000000, ['deposit-placement'], '003000000013'),
      tx('r', 'cb', '2026-08-07', 60000001, ['deposit-return']),
    ]);
    expect(result.transfers.find((transfer) => transfer.in === 'r')).toMatchObject({
      from: 'deposit-combank-003000000012',
      amountOut: 60000000,
    });
    expect(result.txns.find((row) => row.id === 'r')?.parts).toEqual([
      { kind: 'transfer', category: '', amount: 60000000 },
      { kind: 'income', category: 'Interest', amount: 1 },
    ]);
    expect(result.needs).toEqual([]);
  });

  it('skips rows that are already in a transfer', () => {
    const paired = {
      ...tx('p', 'cb', '2026-03-29', -10000000, ['deposit-placement'], '003012345678'),
      transfer: 't1',
    };
    const result = run([paired]);
    expect(result.accounts).toEqual([]);
    expect(result.transfers).toEqual([]);
    expect(result.txns[0]).toBe(paired);
  });
});
