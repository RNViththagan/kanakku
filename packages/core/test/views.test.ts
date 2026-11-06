import { describe, expect, it } from 'vitest';
import { cashFlowByMonth } from '../src/views/cash-flow';
import { netWorthSeries } from '../src/views/net-worth';
import { spendingByCategory } from '../src/views/spending';
import { transferMatrix } from '../src/views/transfers';
import { loadWorld } from './helpers/world';

const ledger = loadWorld();
const range = { from: '2026-01-01', to: '2026-02-28' };

describe('netWorthSeries', () => {
  it('values every account in home currency at month end', () => {
    const [january] = netWorthSeries(ledger, { ...range, step: 'month' });
    expect(january?.date).toBe('2026-01-31');
    expect(january?.byAccount).toEqual({
      'boc-main': 30650000,
      'cb-savings': 15000000,
      'cb-card': -450050,
      'hnb-lkr': 5495310,
      'hnb-usd': 36012000,
      'deposit-combank-3099999999': 0,
    });
    expect(january?.total).toBe(86707260);
    expect(january?.unknown).toEqual([]);
    expect(january?.unvalued).toEqual([]);
  });

  it('lists accounts not known yet', () => {
    const [first] = netWorthSeries(ledger, { from: '2026-01-05', to: '2026-01-05', step: 'day' });
    expect(first?.unknown).toEqual(['cb-savings', 'cb-card']);
    expect(first?.byAccount['cb-savings']).toBeUndefined();
  });

  it('caps the last point at the end of the range', () => {
    const points = netWorthSeries(ledger, { from: '2026-01-01', to: '2026-02-20', step: 'month' });
    expect(points.map((point) => point.date)).toEqual(['2026-01-31', '2026-02-20']);
  });
});

describe('cashFlowByMonth', () => {
  it('counts income and spending but never transfers', () => {
    const [january, february] = cashFlowByMonth(ledger, range);
    expect(january).toMatchObject({
      month: '2026-01',
      income: 36014810,
      spending: 807550,
      net: 36014810 - 807550,
      incomeBy: { Salary: 15000000, Interest: 14810, 'Other income': 21000000 },
      spendingBy: { Fees: 7500, Uncategorised: 800050 },
    });
    expect(february).toMatchObject({
      month: '2026-02',
      income: 1250,
      spending: 4323500,
      spendingBy: { Uncategorised: 320000, Cash: 2000000, Fees: 3500, Rent: 2000000 },
    });
  });

  it('includes empty months', () => {
    const months = cashFlowByMonth(ledger, { from: '2025-12-01', to: '2026-02-28' });
    expect(months.map((month) => month.month)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(months[0]).toMatchObject({
      income: 0,
      spending: 0,
      net: 0,
      incomeBy: {},
      spendingBy: {},
    });
  });
});

describe('spendingByCategory', () => {
  it('adds up to the cash flow spending', () => {
    const categories = spendingByCategory(ledger, range);
    const total = categories.reduce((sum, category) => sum + category.total, 0);
    const cashFlow = cashFlowByMonth(ledger, range).reduce((sum, month) => sum + month.spending, 0);
    expect(total).toBe(cashFlow);
    expect(categories.find((item) => item.category === 'Uncategorised')).toEqual({
      category: 'Uncategorised',
      total: 1120050,
      count: 5,
    });
    expect(categories.slice(0, 2).map((item) => item.category)).toEqual(['Cash', 'Rent']);
  });
});

describe('transferMatrix', () => {
  it('totals what arrived between each pair of accounts', () => {
    expect(transferMatrix(ledger, range)).toEqual([
      { from: 'boc-main', to: 'cb-savings', amount: 4000000, count: 1 },
      { from: 'cb-savings', to: 'deposit-combank-3099999999', amount: 12000000, count: 1 },
      { from: 'hnb-lkr', to: 'cb-savings', amount: 10000000, count: 1 },
      { from: 'hnb-usd', to: 'hnb-lkr', amount: 15000000, count: 1 },
    ]);
  });
});
