import { describe, expect, it } from 'vitest';
import type { Account } from '../src/config/schema';
import { cardCycles, cycleFor, dueDateFor, owedOn, statementDateIn } from '../src/ledger/cards';
import type { Transaction } from '../src/ledger/types';

const card: Account = {
  id: 'card',
  name: 'Card',
  bank: 'combank',
  type: 'credit-card',
  currency: 'LKR',
  card: { statementDay: 5, dueDay: 26, openingOwed: 0 },
};

let count = 0;
const tx = (date: string, amount: number): Transaction => {
  count += 1;
  return {
    id: `c${count}`,
    account: 'card',
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
};

const charges = [tx('2026-10-08', -1000000), tx('2026-10-20', -250000)];
const octoberFile = { period: { from: '2026-10-08', to: '2026-11-06' }, generatedAt: '2026-11-06' };

const cycleOn = (txns: Transaction[], today: string, files = [octoberFile]) => {
  const found = cardCycles(card, txns, files, today).find((cycle) => cycle.from === '2026-10-06');
  if (!found) throw new Error('no October cycle');
  return found;
};

describe('cycle dates', () => {
  it('finds the cycle a day falls in', () => {
    expect(cycleFor('2026-10-08', 5)).toEqual({ from: '2026-10-06', to: '2026-11-05' });
    expect(cycleFor('2026-11-05', 5)).toEqual({ from: '2026-10-06', to: '2026-11-05' });
    expect(cycleFor('2026-11-06', 5)).toEqual({ from: '2026-11-06', to: '2026-12-05' });
  });

  it('clamps statement days in short months', () => {
    expect(statementDateIn(2026, 2, 30)).toBe('2026-02-28');
    expect(cycleFor('2026-02-15', 31)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(cycleFor('2026-02-28', 30)).toEqual({ from: '2026-01-31', to: '2026-02-28' });
    expect(cycleFor('2026-03-01', 30)).toEqual({ from: '2026-03-01', to: '2026-03-30' });
  });

  it('puts the due date in the right month', () => {
    expect(dueDateFor('2026-11-05', 5, 26)).toBe('2026-11-26');
    expect(dueDateFor('2026-11-25', 25, 10)).toBe('2026-12-10');
    expect(dueDateFor('2026-01-31', 31, 30)).toBe('2026-02-28');
  });
});

describe('cardCycles', () => {
  it('is open until the statement date', () => {
    expect(cycleOn(charges, '2026-11-01').status).toBe('open');
  });

  it('bills the cycle and tracks payment', () => {
    expect(cycleOn(charges, '2026-11-06')).toMatchObject({
      statementDate: '2026-11-05',
      dueDate: '2026-11-26',
      charges: 1250000,
      credits: 0,
      billed: 1250000,
      paid: 0,
      status: 'unpaid',
    });
    expect(cycleOn([...charges, tx('2026-11-20', 500000)], '2026-11-21').status).toBe('part-paid');
    expect(cycleOn([...charges, tx('2026-11-20', 1250000)], '2026-11-21').status).toBe('paid');
    expect(cycleOn(charges, '2026-11-27').status).toBe('overdue');
  });

  it('counts a late payment as paid', () => {
    const cycle = cycleOn([...charges, tx('2026-11-28', 1250000)], '2026-11-29');
    expect(cycle).toMatchObject({ status: 'paid', paid: 1250000, paidByDue: 0 });
  });

  it('lowers the bill for refunds and adds the opening amount owed', () => {
    const refunded = [...charges, tx('2026-10-25', 50000)];
    expect(cycleOn(refunded, '2026-11-06')).toMatchObject({ credits: 50000, billed: 1200000 });
    const opening = { ...card, card: { statementDay: 5, dueDay: 26, openingOwed: 100000 } };
    expect(owedOn(opening, charges, '2026-11-05')).toBe(1350000);
    expect(owedOn(card, charges, '2026-10-10')).toBe(1000000);
  });

  it('judges coverage per cycle', () => {
    expect(cycleOn(charges, '2026-11-06').coverage).toBe('full');
    const early = {
      ...octoberFile,
      generatedAt: '2026-11-03',
      period: { from: '2026-10-08', to: '2026-11-03' },
    };
    expect(cycleOn(charges, '2026-11-06', [early]).coverage).toBe('partial');

    const august = { period: { from: '2026-08-07', to: '2026-09-05' }, generatedAt: '2026-09-06' };
    const cycles = cardCycles(
      card,
      [tx('2026-08-07', -1000), ...charges],
      [august, octoberFile],
      '2026-11-06',
    );
    expect(cycles.map((cycle) => [cycle.from, cycle.coverage])).toEqual([
      ['2026-08-06', 'full'],
      ['2026-09-06', 'missing'],
      ['2026-10-06', 'full'],
      ['2026-11-06', 'partial'],
    ]);
  });
});
