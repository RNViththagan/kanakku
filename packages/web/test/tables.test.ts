import type { Account, Ledger } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { transactionRows } from '../src/model';
import {
  categoryLabel,
  categoryOptions,
  conversionSummary,
  coverageBar,
  type DepositRow,
  depositRows,
  fileRows,
  filterTransactions,
  pairLabel,
  searchTransfers,
  transferPairs,
  transferRows,
  transfersOnTab,
} from '../src/tables';
import { depositWorld } from './helpers/deposits';

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

  it('keeps both sides, the reason for the match and the pair it belongs to', () => {
    const rows = transferRows(ledger, range);
    const fee = rows.find((row) => row.date === '2026-01-10');
    expect(fee).toMatchObject({ rule: 'fee', pair: 'boc-main|cb-savings' });
    expect(fee?.sides.map((side) => [side.accountId, side.description])).toEqual([
      ['boc-main', 'CEFT-OWN TRANSFER'],
      ['cb-savings', 'own / O0000000001 / EF 20260112 101500 CEFLKU0001'],
    ]);
    const deposit = rows.find((row) => row.deposit);
    expect(deposit?.pair).toBe('cb-savings|deposits:combank');
    expect(deposit?.sides).toHaveLength(1);
    expect(transferPairs(ledger, range).map((pair) => `${pair.from}|${pair.to}`)).toContain(
      deposit?.pair,
    );
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

describe('searchTransfers', () => {
  it('finds deposit transfers by the name the pairs table uses', () => {
    const rows = transferRows(ledger, range);
    expect(searchTransfers(rows, 'fixed deposits').map((row) => row.date)).toEqual(['2026-02-01']);
  });

  it('finds transfers by account name or either side of the bank text', () => {
    const rows = transferRows(ledger, range);
    expect(searchTransfers(rows, 'aml').map((row) => row.date)).toEqual(['2026-01-21']);
    expect(searchTransfers(rows, 'hnb usd')).toHaveLength(1);
    expect(searchTransfers(rows, '  ')).toHaveLength(4);
  });
});

describe('pairLabel', () => {
  it('names both ends of a pair, deposits per bank and unknown ends too', () => {
    expect(pairLabel(ledger, 'cb-savings|deposits:combank')).toBe(
      'ComBank Savings to ComBank fixed deposits',
    );
    expect(pairLabel(ledger, 'boc-main|')).toBe('BOC Main to Unknown');
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

describe('transaction categories', () => {
  const rows = transactionRows(ledger);
  const feeTransfer = rows.find(
    (row) => row.accountId === 'boc-main' && row.date === '2026-01-10' && row.kind === 'transfer',
  );

  it('finds fees carried inside transfers, so the list adds up to the cash flow total', () => {
    const fees = filterTransactions(rows, { category: 'Fees' });
    expect(fees.filter((row) => row.kind === 'transfer').map((row) => row.date)).toEqual([
      '2026-01-21',
      '2026-01-10',
    ]);
    const total = fees
      .flatMap((row) => row.parts)
      .filter((part) => part.category === 'Fees')
      .reduce((sum, part) => sum - part.amount, 0);
    expect(total).toBe(11000);
  });

  it('can hold to the income or spending side of a category', () => {
    const spent = filterTransactions(rows, { category: 'Fees', origin: 'spending' });
    expect(
      spent
        .flatMap((row) => row.parts)
        .filter((part) => part.category === 'Fees')
        .reduce((sum, part) => sum - part.amount, 0),
    ).toBe(11000);
    expect(filterTransactions(rows, { category: 'Fees', origin: 'income' })).toEqual([]);
  });

  it('searches the categories carried inside a transaction', () => {
    expect(filterTransactions(rows, { search: 'fees', kind: 'transfer' })).toHaveLength(2);
  });

  it('names the category, or what a transfer carried', () => {
    expect(feeTransfer && categoryLabel(feeTransfer, 'en-LK')).toBe('Fees 25.00 LKR');
    const salary = rows.find((row) => row.category === 'Salary');
    expect(salary && categoryLabel(salary, 'en-LK')).toBe('Salary');
  });

  it('offers each category once, including ones carried inside transfers', () => {
    expect(categoryOptions(rows.filter((row) => row.kind === 'transfer'))).toEqual(['Fees']);
    const all = categoryOptions(rows);
    expect(all).toEqual([...new Set(all)].sort());
    expect(all).toContain('Salary');
    expect(all).not.toContain('');
  });
});

describe('depositRows', () => {
  it('reads a discovered deposit from its moves', () => {
    expect(depositRows(ledger)).toEqual([
      {
        account: ledger.accounts.at(-1),
        status: 'active',
        balance: 12000000,
        principal: 12000000,
        start: '2026-02-01',
        earliest: '2026-03-01',
        interest: 0,
      },
    ]);
  });

  it('shows a withdrawn deposit with its interest from either kind of bank line', () => {
    const deposit = ledger.accounts.at(-1);
    const sample = ledger.transactions.find((row) => row.account === 'cb-savings');
    if (!deposit || !sample) throw new Error('fixture deposit missing');
    const credit = {
      ...sample,
      id: 'efd-interest',
      date: '2026-02-15',
      amount: 30000,
      description: 'Interest from eFD:3099999999 / - / -',
      kind: 'income' as const,
      category: 'Interest',
      tags: ['deposit-interest' as const],
      deposit: '3099999999',
      parts: [{ kind: 'income' as const, category: 'Interest', amount: 30000 }],
    };
    const closing = {
      ...sample,
      id: 'closing',
      date: '2026-02-15',
      amount: 12016027,
      description: 'Principal from eFD:3099999999 / - / -',
      kind: 'transfer' as const,
      category: '',
      parts: [
        { kind: 'transfer' as const, category: '', amount: 12000000 },
        { kind: 'income' as const, category: 'Interest', amount: 16027 },
      ],
    };
    const withdrawn: Ledger = {
      ...ledger,
      transactions: [...ledger.transactions, credit, closing],
      depositMoves: [
        ...ledger.depositMoves,
        { account: deposit.id, date: '2026-02-15', amount: -12000000 },
      ],
      transfers: [
        ...ledger.transfers,
        {
          id: 'closing-transfer',
          from: deposit.id,
          to: 'cb-savings',
          date: '2026-02-15',
          amountOut: 12000000,
          currencyOut: 'LKR',
          amountIn: 12000000,
          currencyIn: 'LKR',
          fee: 0,
          rule: 'deposit',
          status: 'one-sided',
          in: 'closing',
        },
      ],
    };
    const row = depositRows(withdrawn)[0];
    expect(row).toMatchObject({
      status: 'withdrawn',
      balance: 0,
      principal: 12000000,
      start: '2026-02-01',
      closed: '2026-02-15',
      returned: 12000000,
      held: 14,
      interest: 46027,
    });
    expect(row?.yearlyRate).toBeCloseTo(10, 1);
  });

  it('leaves the yearly rate blank when no payout was seen', () => {
    const deposit = ledger.accounts.at(-1);
    if (!deposit) throw new Error('fixture deposit missing');
    const closed: Ledger = {
      ...ledger,
      today: '2026-03-01',
      accounts: [...ledger.accounts.slice(0, -1), { ...deposit, closed: '2026-02-20' }],
    };
    const row = depositRows(closed)[0];
    expect(row?.status).toBe('withdrawn');
    expect(row?.returned).toBeUndefined();
    expect(row?.yearlyRate).toBeUndefined();
  });

  it('never counts days held below zero', () => {
    const deposit = ledger.accounts.at(-1);
    if (!deposit) throw new Error('fixture deposit missing');
    const closed: Ledger = {
      ...ledger,
      accounts: [...ledger.accounts.slice(0, -1), { ...deposit, closed: '2026-01-15' }],
    };
    expect(depositRows(closed)[0]?.held).toBeUndefined();
  });

  it('ignores interest paid in another currency', () => {
    const sample = ledger.transactions.find((row) => row.account === 'hnb-usd');
    if (!sample) throw new Error('fixture USD row missing');
    const credit = {
      ...sample,
      id: 'usd-credit',
      date: '2026-02-15',
      amount: 100,
      kind: 'income' as const,
      category: 'Interest',
      deposit: '3099999999',
      parts: [{ kind: 'income' as const, category: 'Interest', amount: 100 }],
    };
    const mixed: Ledger = { ...ledger, transactions: [...ledger.transactions, credit] };
    expect(depositRows(mixed)[0]?.interest).toBe(0);
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

describe('depositRows for deposits that ended', () => {
  const later = depositWorld();
  const rows = depositRows(later);
  const row = (list: DepositRow[], number: string) =>
    list.find((item) => item.account.number?.endsWith(number));
  const ids = (accounts: Account[] | undefined) => accounts?.map((account) => account.id);

  it('says how each one ended and works the rate out over the term', () => {
    expect(row(rows, '9999')).toMatchObject({
      status: 'withdrawn',
      ended: 'matured',
      months: 1,
      held: 29,
      interest: 70932,
    });
    expect(row(rows, '9999')?.yearlyRate).toBeCloseTo(7.71, 2);
    expect(row(rows, '7777')).toMatchObject({ status: 'withdrawn', ended: 'early', held: 4 });
    expect(row(rows, '7777')?.months).toBeUndefined();
  });

  it('links a deposit and the one that replaced it, both ways', () => {
    expect(ids(row(rows, '9999')?.replacedBy)).toEqual(['deposit-combank-3088888888']);
    expect(ids(row(rows, '8888')?.replaced)).toEqual(['deposit-combank-3099999999']);
    expect(row(rows, '7777')?.replacedBy).toBeUndefined();
    expect(row(rows, '7777')?.replaced).toBeUndefined();
  });

  it('gives the earliest date a deposit without a term can mature', () => {
    expect(row(rows, '8888')).toMatchObject({ status: 'active', earliest: '2026-04-02' });
    expect(row(rows, '8888')?.maturity).toBeUndefined();
    const coverage = later.coverage['cb-savings'];
    if (!coverage) throw new Error('fixture coverage missing');
    const seenLater: Ledger = {
      ...later,
      coverage: { ...later.coverage, 'cb-savings': { ...coverage, lastCovered: '2026-04-10' } },
    };
    expect(row(depositRows(seenLater), '8888')?.earliest).toBe('2026-06-02');
  });

  it('counts a term from when the deposit was placed once you set it', () => {
    const termed: Ledger = {
      ...later,
      accounts: later.accounts.map((account) =>
        account.id === 'deposit-combank-3088888888'
          ? { ...account, deposit: { months: 6 } }
          : account,
      ),
    };
    expect(row(depositRows(termed), '8888')).toMatchObject({ maturity: '2026-09-02', months: 6 });
    expect(row(depositRows(termed), '8888')?.earliest).toBeUndefined();
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
