import { cashFlowByMonth } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { drillEntries, findItem, groupEntries, payeeOf, resolveItem } from '../src/drill';
import { type FlowItem, moneyFlow } from '../src/flow';

const ledger = loadWorld();
const range = { from: '2026-01-01', to: '2026-02-20' };
const flow = moneyFlow(cashFlowByMonth(ledger, range), 3);
const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));

function item(key: string): FlowItem {
  const found = findItem(flow, key);
  if (!found) throw new Error(`no ${key} in the flow`);
  return found;
}

describe('payeeOf', () => {
  it('prefers the counterparty the bank wording found', () => {
    expect(payeeOf({ description: 'MB:own-AML1', counterparty: 'own-AML1' })).toBe('OWN-AML1');
  });

  it('drops references, masked account numbers and dates', () => {
    expect(payeeOf({ description: 'SHOP ONE COLOMBO 03 COLK / 000000000011 / -' })).toBe(
      'SHOP ONE COLOMBO COLK',
    );
    expect(payeeOf({ description: '33333XXXXX33:Int.Pd:24-12-2025 to 24-01-2026' })).toBe(
      'INT.PD TO',
    );
    expect(payeeOf({ description: '2026010900000001-ACME LLC' })).toBe('ACME LLC');
    expect(payeeOf({ description: 'POS       GROCER ONE - COLOMBO' })).toBe(
      'POS GROCER ONE COLOMBO',
    );
  });

  it('ignores month names so a monthly payment stays one payee', () => {
    expect(payeeOf({ description: 'APRIL RENT' })).toBe('RENT');
    expect(payeeOf({ description: 'Rent Sept 2026' })).toBe('RENT');
    expect(payeeOf({ description: 'RENT AUGUST / 0001 / -' })).toBe('RENT');
  });

  it('keeps the marks that complete a letter', () => {
    expect(payeeOf({ description: 'இலங்கை வங்கி வாடகை' })).toBe('இலங்கை வங்கி வாடகை');
  });

  it('keeps short numbers that are part of a name', () => {
    expect(payeeOf({ description: '7-ELEVEN COLOMBO 03' })).toBe('7-ELEVEN COLOMBO');
    expect(payeeOf({ description: 'SHOP AML1' })).toBe('SHOP AML1');
  });

  it('keeps a month name when it is all there is', () => {
    expect(payeeOf({ description: 'JAN' })).toBe('JAN');
  });

  it('says so when nothing readable is left', () => {
    expect(payeeOf({ description: '000123 / - / -' })).toBe('No description');
  });
});

describe('findItem', () => {
  it('finds flows on either side and the ones folded into Other', () => {
    expect(item('income:Salary').label).toBe('Salary');
    expect(item('saved').kind).toBe('savings');
    expect(flow.uses.some((use) => use.key === 'spending:Fees')).toBe(false);
    expect(item('spending:Fees').value).toBe(11000);
    expect(findItem(flow, 'spending:Nothing')).toBeUndefined();
  });
});

describe('resolveItem', () => {
  it('still opens a category that is not drawn in the flow', () => {
    expect(resolveItem(flow, 'spending:Groceries')).toMatchObject({
      kind: 'category',
      origin: 'spending',
      category: 'Groceries',
      side: 'out',
      value: 0,
    });
    expect(resolveItem(flow, 'income:Gifts')?.side).toBe('in');
    expect(resolveItem(flow, 'nonsense')).toBeUndefined();
  });

  it('prefers what the flow holds', () => {
    expect(resolveItem(flow, 'income:Salary')?.value).toBe(15000000);
  });
});

describe('drillEntries', () => {
  it('lists every transaction behind a flow, adding up to its value', () => {
    const fees = drillEntries(ledger, range, item('spending:Fees'));
    expect(fees).toHaveLength(5);
    expect(fees.reduce((sum, entry) => sum + entry.value, 0)).toBe(11000);
    expect(fees.map((entry) => entry.transaction.kind)).toContain('transfer');
  });

  it('values foreign money in the home currency', () => {
    const interest = drillEntries(ledger, range, item('income:Interest'));
    expect(interest.reduce((sum, entry) => sum + entry.value, 0)).toBe(16060);
  });

  it('nets income against outgoing for what was saved', () => {
    const saved = drillEntries(ledger, range, item('saved'));
    expect(saved.reduce((sum, entry) => sum + entry.value, 0)).toBe(30885010);
  });

  it('gathers the flows folded into Other', () => {
    const other = item('other-out');
    const entries = drillEntries(ledger, range, other);
    expect(entries.reduce((sum, entry) => sum + entry.value, 0)).toBe(other.value);
  });
});

describe('groupEntries', () => {
  const fees = drillEntries(ledger, range, item('spending:Fees'));

  it('groups by payee, biggest first', () => {
    const groups = groupEntries(fees, 'payee', names, 'en-LK');
    expect(groups).toHaveLength(5);
    expect(groups.at(-1)).toMatchObject({ label: 'ATM SERVICE CHARGE', value: 1000, count: 1 });
  });

  it('groups by account under the account names', () => {
    expect(
      groupEntries(fees, 'account', names, 'en-LK').map((group) => [
        group.key,
        group.value,
        group.count,
      ]),
    ).toEqual([
      ['hnb-lkr', 5000, 2],
      ['boc-main', 3500, 2],
      ['cb-savings', 2500, 1],
    ]);
    expect(groupEntries(fees, 'account', names, 'en-LK')[0]?.label).toBe(names.get('hnb-lkr'));
  });

  it('groups by month in date order', () => {
    const saved = drillEntries(ledger, range, item('saved'));
    expect(
      groupEntries(saved, 'month', names, 'en-LK').map((group) => [group.key, group.value]),
    ).toEqual([
      ['2026-01', 35207260],
      ['2026-02', -4322250],
    ]);
  });
});
