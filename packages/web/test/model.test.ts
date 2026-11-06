import type { Ledger } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import {
  accountsByBank,
  latestMonth,
  needsByType,
  overviewStats,
  rangeEndingAt,
  rangeFor,
  topNeeds,
  transactionRows,
} from '../src/model';

const ledger = loadWorld();
const empty: Ledger = {
  ...ledger,
  accounts: [],
  files: [],
  transactions: [],
  transfers: [],
  conversions: [],
  coverage: {},
  cards: {},
  closings: {},
  depositMoves: [],
  needs: [],
  issues: [],
};

describe('overviewStats', () => {
  it('adds up the fixture world on its today', () => {
    expect(overviewStats(ledger)).toEqual({
      netWorth: 82385010,
      netWorthChange: 82385010 - 86707260,
      inAccounts: 28529000 + 998750 + 5495310 + 36012000,
      inDeposits: 12000000,
      owedOnCards: 650050,
      hasCards: true,
      spentThisMonth: 4323500,
      spentLastMonth: 807550,
      unknown: [],
      unvalued: [],
    });
  });

  it('gives zeros for an empty ledger', () => {
    expect(overviewStats(empty)).toEqual({
      netWorth: 0,
      inAccounts: 0,
      inDeposits: 0,
      owedOnCards: 0,
      hasCards: false,
      spentThisMonth: 0,
      spentLastMonth: 0,
      unknown: [],
      unvalued: [],
    });
  });
});

describe('accountsByBank', () => {
  it('groups accounts by bank with balances and statements', () => {
    const banks = accountsByBank(ledger);
    expect(
      banks.map((bank) => [bank.bank, bank.name, bank.accounts.map((row) => row.account.id)]),
    ).toEqual([
      ['boc', 'Bank of Ceylon', ['boc-main']],
      [
        'combank',
        'Commercial Bank of Ceylon',
        ['cb-savings', 'cb-card', 'deposit-combank-3099999999'],
      ],
      ['hnb', 'Hatton National Bank', ['hnb-lkr', 'hnb-usd']],
    ]);
    expect(banks[0]?.accounts[0]).toMatchObject({
      balance: 28529000,
      homeValue: 28529000,
      asOf: '2026-02-15',
      lastStatement: '2026-02-15',
    });
    expect(banks[2]?.accounts[1]).toMatchObject({
      balance: 120040,
      homeValue: 36012000,
      asOf: '2026-01-31',
      lastStatement: '2026-01-31',
    });
    expect(banks[1]?.accounts[1]).toMatchObject({ balance: -650050, asOf: '2026-02-06' });
    const deposit = banks[1]?.accounts[2];
    expect(deposit).toMatchObject({ balance: 12000000, asOf: '2026-02-20' });
    expect(deposit?.lastStatement).toBeUndefined();
  });

  it('is empty for an empty ledger', () => {
    expect(accountsByBank(empty)).toEqual([]);
  });

  it('marks an account closed in the config once that day has passed', () => {
    const closed: Ledger = {
      ...ledger,
      accounts: ledger.accounts.map((account) =>
        account.id === 'hnb-lkr' ? { ...account, closed: '2026-02-01' } : account,
      ),
    };
    const hnb = accountsByBank(closed)[2];
    expect(hnb?.accounts.map((row) => [row.account.id, row.closed])).toEqual([
      ['hnb-usd', false],
      ['hnb-lkr', true],
    ]);
  });

  it('marks closed fixed deposits and puts them last', () => {
    const deposit = ledger.accounts.at(-1);
    const savings = ledger.accounts[1];
    if (!deposit || !savings) throw new Error('fixture accounts missing');
    const closed: Ledger = {
      ...ledger,
      accounts: [...ledger.accounts, { ...savings, id: 'cb-extra', name: 'ComBank Extra' }],
      depositMoves: [
        ...ledger.depositMoves,
        { account: deposit.id, date: '2026-02-10', amount: -12000000 },
      ],
    };
    const combank = accountsByBank(closed)[1];
    expect(combank?.accounts.map((row) => [row.account.id, row.closed])).toEqual([
      ['cb-savings', false],
      ['cb-card', false],
      ['cb-extra', false],
      ['deposit-combank-3099999999', true],
    ]);
  });
});

describe('ranges', () => {
  it('ends a range of whole months at today', () => {
    expect(rangeEndingAt('2026-02-20', 12)).toEqual({ from: '2025-03-01', to: '2026-02-20' });
    expect(rangeEndingAt('2026-02-20', 1)).toEqual({ from: '2026-02-01', to: '2026-02-20' });
  });

  it('turns each preset into dates', () => {
    const today = '2026-02-20';
    expect(rangeFor('this-month', today, ledger)).toEqual({ from: '2026-02-01', to: today });
    expect(rangeFor('3m', today, ledger)).toEqual({ from: '2025-12-01', to: today });
    expect(rangeFor('6m', today, ledger)).toEqual({ from: '2025-09-01', to: today });
    expect(rangeFor('12m', today, ledger)).toEqual({ from: '2025-03-01', to: today });
    expect(rangeFor('this-year', today, ledger)).toEqual({ from: '2026-01-01', to: today });
    expect(rangeFor('all', today, ledger)).toEqual({ from: '2026-01-01', to: today });
    expect(rangeFor('all', today, empty)).toEqual({ from: '2026-02-01', to: today });
  });

  it('finds the latest month with spending', () => {
    expect(latestMonth(ledger)).toBe('2026-02');
    expect(latestMonth(empty)).toBe('2026-02');
  });
});

describe('transactionRows', () => {
  it('lists every transaction newest first with names, links and files', () => {
    const rows = transactionRows(ledger);
    expect(rows).toHaveLength(23);
    const dates = rows.map((row) => row.date);
    expect(dates).toEqual([...dates].sort().reverse());
    const salary = rows.find((row) => row.description.startsWith('SLIPS IN - ACME'));
    expect(salary).toMatchObject({
      accountId: 'boc-main',
      accountName: 'BOC Main',
      kind: 'income',
      category: 'Salary',
      amount: 15000000,
      currency: 'LKR',
    });
    expect(salary?.files).toContain('boc/BOC_0011111111_2026-01-01_to_2026-01-31.csv');
    const sent = rows.find((row) => row.accountId === 'boc-main' && row.transfer !== undefined);
    expect(sent?.transferWith).toBe('ComBank Savings');
  });

  it('is empty for an empty ledger', () => {
    expect(transactionRows(empty)).toEqual([]);
  });
});

describe('needsByType', () => {
  it('groups what needs you, most urgent first', () => {
    const groups = needsByType(ledger);
    expect(groups.map((group) => [group.type, group.items.length])).toEqual([
      ['unreadable-file', 1],
      ['card-due', 1],
      ['uncategorised', 1],
      ['deposit-details', 1],
      ['tidy', 1],
    ]);
    expect(groups[0]?.label).toBe('Files Kanakku cannot read');
  });

  it('is empty when nothing needs you', () => {
    expect(needsByType(empty)).toEqual([]);
  });
});

describe('topNeeds', () => {
  it('takes the most urgent items first', () => {
    expect(topNeeds(ledger, 3).map((need) => need.type)).toEqual([
      'unreadable-file',
      'card-due',
      'uncategorised',
    ]);
  });
});
