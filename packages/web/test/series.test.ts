import { cashFlowByMonth } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { balanceSeries, netWorthPoints, runningTotals, spendingTrend } from '../src/series';

const ledger = loadWorld();
const range = { from: '2026-01-01', to: '2026-02-20' };

describe('netWorthPoints', () => {
  it('gives month ends from the first month anything is known', () => {
    const points = netWorthPoints(ledger, { from: '2025-11-01', to: '2026-02-20' });
    expect(points.map((point) => [point.date, point.month, point.total])).toEqual([
      ['2026-01-31', '2026-01', 86707260],
      ['2026-02-20', '2026-02', 82385010],
    ]);
  });

  it('is empty when nothing is known', () => {
    expect(netWorthPoints({ ...ledger, accounts: [] }, range)).toEqual([]);
  });
});

describe('spendingTrend', () => {
  it('stacks the top categories by month and folds the rest into Other', () => {
    expect(spendingTrend(ledger, range, 2)).toEqual({
      categories: ['Cash', 'Rent', 'Other'],
      months: [
        { month: '2026-01', values: { Cash: 0, Rent: 0, Other: 807550 } },
        { month: '2026-02', values: { Cash: 2000000, Rent: 2000000, Other: 323500 } },
      ],
    });
  });

  it('needs no Other when every category fits', () => {
    expect(spendingTrend(ledger, range).categories).toEqual([
      'Cash',
      'Rent',
      'Uncategorised',
      'Fees',
    ]);
  });
});

describe('balanceSeries', () => {
  it('gives the balance at each month end in the account currency', () => {
    expect(balanceSeries(ledger, 'hnb-usd', range)).toEqual([
      { date: '2026-01-31', month: '2026-01', balance: 120040 },
      { date: '2026-02-20', month: '2026-02', balance: 120040 },
    ]);
  });

  it('leaves out balances from before the first statement', () => {
    expect(balanceSeries(ledger, 'cb-savings', { from: '2025-12-01', to: '2026-01-31' })).toEqual([
      { date: '2025-12-31', month: '2025-12' },
      { date: '2026-01-31', month: '2026-01', balance: 15000000 },
    ]);
  });
});

describe('runningTotals', () => {
  it('adds up income and outgoing month by month', () => {
    const months = cashFlowByMonth(ledger, { from: '2025-12-01', to: '2026-02-20' });
    expect(runningTotals(months)).toEqual([
      { month: '2025-12', income: 0, outgoing: 0 },
      { month: '2026-01', income: 36014810, outgoing: 807550 },
      { month: '2026-02', income: 36016060, outgoing: 5131050 },
    ]);
  });
});
