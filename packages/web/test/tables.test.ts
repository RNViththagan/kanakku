import type { Ledger } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { transactionRows } from '../src/model';
import {
  conversionSummary,
  coverageBar,
  depositRows,
  fileRows,
  filterTransactions,
  transferPairs,
  transferRows,
  transfersOnTab,
} from '../src/tables';

const ledger = loadWorld();
const range = { from: '2026-01-01', to: '2026-02-20' };

describe('transferRows', () => {
  it('lists transfers newest first with names, fees and status', () => {
    const rows = transferRows(ledger, range);
    expect(
      rows.map((row) => [row.date, row.fromName, row.toName, row.amount, row.fee, row.status]),
    ).toEqual([
      ['2026-02-01', 'ComBank Savings', 'Deposit 003099999999', 12000000, 0, 'one-sided'],
      ['2026-01-21', 'HNB LKR', 'ComBank Savings', 10002500, 2500, 'matched'],
      ['2026-01-20', 'HNB USD', 'HNB LKR', 50000, 0, 'matched'],
      ['2026-01-10', 'BOC Main', 'ComBank Savings', 4002500, 2500, 'matched'],
    ]);
    expect(rows[2]).toMatchObject({ currency: 'USD', amountIn: 15000000, currencyIn: 'LKR' });
    expect(transferRows(ledger, { from: '2026-01-15', to: '2026-01-31' })).toHaveLength(2);
  });

  it('sorts rows into tabs, with unmatched rows on one side', () => {
    const flags: Record<string, 'possible' | 'waiting'> = {
      'POS       CAFE THREE - COLOMBO': 'possible',
      'INTEREST / - / -': 'waiting',
    };
    const flagged: Ledger = {
      ...ledger,
      transactions: ledger.transactions.map((row) =>
        flags[row.description] ? { ...row, flag: flags[row.description] } : row,
      ),
    };
    const rows = transferRows(flagged, range);
    expect(transfersOnTab(rows, 'all').map((row) => row.status)).toEqual([
      'waiting',
      'possible',
      'one-sided',
      'matched',
      'matched',
      'matched',
    ]);
    expect(transfersOnTab(rows, 'deposits').map((row) => row.toName)).toEqual([
      'Deposit 003099999999',
    ]);
    expect(transfersOnTab(rows, 'needs')).toMatchObject([
      {
        status: 'possible',
        from: 'boc-main',
        fromName: 'BOC Main',
        toName: 'Unknown',
        amount: 120000,
      },
    ]);
    expect(transfersOnTab(rows, 'waiting')).toMatchObject([
      {
        status: 'waiting',
        fromName: 'Unknown',
        to: 'cb-savings',
        toName: 'ComBank Savings',
        amount: 1250,
      },
    ]);
  });
});

describe('conversionSummary', () => {
  it('averages the rate and values what is held now', () => {
    const [usd, ...rest] = conversionSummary(ledger);
    expect(rest).toEqual([]);
    expect(usd).toMatchObject({
      currency: 'USD',
      conversions: 1,
      foreignTotal: 50000,
      homeTotal: 15000000,
      averageMicro: 300000000,
      held: 120040,
      heldValue: 36012000,
      rate: { micro: 300000000, source: 'manual' },
    });
  });

  it('is empty with one currency', () => {
    expect(
      conversionSummary({ ...ledger, accounts: ledger.accounts.slice(0, 4), conversions: [] }),
    ).toEqual([]);
  });
});

describe('coverageBar', () => {
  it('splits a window into covered and unknown parts', () => {
    expect(
      coverageBar(
        [{ from: '2026-01-01', to: '2026-01-31', state: 'covered' }],
        '2026-01-01',
        '2026-02-28',
      ),
    ).toEqual([
      { state: 'covered', from: '2026-01-01', to: '2026-01-31', share: 31 / 59 },
      { state: 'none', from: '2026-02-01', to: '2026-02-28', share: 28 / 59 },
    ]);
  });

  it('clips segments to the window', () => {
    const segments = [
      { from: '2025-12-01', to: '2026-01-10', state: 'missing' as const },
      { from: '2026-01-11', to: '2026-03-31', state: 'covered' as const },
    ];
    expect(coverageBar(segments, '2026-01-01', '2026-01-31')).toEqual([
      { state: 'missing', from: '2026-01-01', to: '2026-01-10', share: 10 / 31 },
      { state: 'covered', from: '2026-01-11', to: '2026-01-31', share: 21 / 31 },
    ]);
  });

  it('shows an empty window as unknown', () => {
    expect(coverageBar([], '2026-01-01', '2026-01-31')).toEqual([
      { state: 'none', from: '2026-01-01', to: '2026-01-31', share: 1 },
    ]);
  });
});

describe('fileRows', () => {
  it('labels each file with its bank, account and status', () => {
    const rows = fileRows(ledger);
    expect(rows).toHaveLength(7);
    expect(rows.find((row) => row.path === 'boc/notes.csv')).toMatchObject({
      name: 'notes.csv',
      bankName: '',
      accountName: '',
      status: ['Unreadable'],
    });
    expect(rows.find((row) => row.path === 'boc/BOC_RECEIPT_overlap.csv')).toMatchObject({
      bankName: 'Bank of Ceylon',
      accountName: 'BOC Main',
      from: '2026-01-20',
      to: '2026-02-15',
      status: ['Improper name', 'Overlapping'],
    });
    expect(rows.find((row) => row.path.startsWith('hnb/'))?.status).toEqual(['OK']);
  });
});

describe('filterTransactions', () => {
  const rows = transactionRows(ledger);

  it('keeps every row with no filter', () => {
    expect(filterTransactions(rows, {})).toHaveLength(23);
  });

  it('searches descriptions without caring about case', () => {
    expect(filterTransactions(rows, { search: 'acme' }).map((row) => row.date)).toEqual([
      '2026-01-25',
      '2026-01-10',
    ]);
  });

  it('filters by account, kind, category and dates', () => {
    expect(filterTransactions(rows, { category: 'Rent' }).map((row) => row.amount)).toEqual([
      -2000000,
    ]);
    expect(filterTransactions(rows, { kind: 'income' })).toHaveLength(6);
    const card = filterTransactions(rows, {
      account: 'cb-card',
      from: '2026-02-01',
      to: '2026-02-20',
    });
    expect(card.map((row) => row.description)).toEqual([
      'BOOKSHOP COLOMBO 07 COLK / 000000000013 / -',
    ]);
  });
});

describe('depositRows', () => {
  it('reads a discovered deposit from its moves', () => {
    expect(depositRows(ledger)).toEqual([
      {
        account: ledger.accounts.at(-1),
        balance: 12000000,
        principal: 12000000,
        start: '2026-02-01',
      },
    ]);
  });

  it('works out maturity and days left from the term', () => {
    const deposit = ledger.accounts.at(-1);
    if (!deposit) throw new Error('fixture deposit missing');
    const termed: Ledger = {
      ...ledger,
      accounts: [
        ...ledger.accounts.slice(0, -1),
        { ...deposit, deposit: { principal: 12000000, start: '2026-02-01', months: 12, rate: 9 } },
      ],
    };
    expect(depositRows(termed)[0]).toMatchObject({
      principal: 12000000,
      start: '2026-02-01',
      maturity: '2027-02-01',
      rate: 9,
      daysLeft: 346,
    });
  });
});

describe('transferPairs', () => {
  it('totals each pair of accounts, largest first, with deposits as one per bank', () => {
    expect(transferPairs(ledger, range)).toEqual([
      {
        from: 'hnb-usd',
        fromName: 'HNB USD',
        to: 'hnb-lkr',
        toName: 'HNB LKR',
        amount: 15000000,
        count: 1,
      },
      {
        from: 'cb-savings',
        fromName: 'ComBank Savings',
        to: 'deposits:combank',
        toName: 'ComBank fixed deposits',
        amount: 12000000,
        count: 1,
      },
      {
        from: 'hnb-lkr',
        fromName: 'HNB LKR',
        to: 'cb-savings',
        toName: 'ComBank Savings',
        amount: 10000000,
        count: 1,
      },
      {
        from: 'boc-main',
        fromName: 'BOC Main',
        to: 'cb-savings',
        toName: 'ComBank Savings',
        amount: 4000000,
        count: 1,
      },
    ]);
  });

  it('adds up several deposits at one bank', () => {
    const deposit = ledger.accounts.at(-1);
    const placed = ledger.transfers.find((transfer) => transfer.to === deposit?.id);
    if (!deposit || !placed) throw new Error('fixture deposit missing');
    const second: Ledger = {
      ...ledger,
      accounts: [...ledger.accounts, { ...deposit, id: 'deposit-combank-2', name: 'Deposit 2' }],
      transfers: [
        ...ledger.transfers,
        { ...placed, id: 'second', to: 'deposit-combank-2', amountOut: 5000000, amountIn: 5000000 },
      ],
    };
    expect(
      transferPairs(second, range).find((pair) => pair.to === 'deposits:combank'),
    ).toMatchObject({
      amount: 17000000,
      count: 2,
    });
  });
});
