import { describe, expect, it } from 'vitest';
import { balanceOn } from '../src/views/balances';
import { loadWorld } from './helpers/world';

const ledger = loadWorld();
const DEPOSIT = 'deposit-combank-003099999999';

describe('buildLedger on the fixture world', () => {
  it('finds every account, including the discovered deposit', () => {
    expect(ledger.accounts.map((account) => account.id)).toEqual([
      'boc-main',
      'cb-savings',
      'cb-card',
      'hnb-lkr',
      'hnb-usd',
      DEPOSIT,
    ]);
  });

  it('ends each account at the right balance', () => {
    expect(balanceOn(ledger, 'boc-main', '2026-02-15')).toBe(28529000);
    expect(balanceOn(ledger, 'cb-savings', '2026-02-16')).toBe(998750);
    expect(balanceOn(ledger, 'cb-card', '2026-02-20')).toBe(-650050);
    expect(balanceOn(ledger, 'hnb-lkr', '2026-01-31')).toBe(5495310);
    expect(balanceOn(ledger, 'hnb-usd', '2026-01-31')).toBe(120040);
    expect(balanceOn(ledger, DEPOSIT, '2026-02-20')).toBe(12000000);
  });

  it('opens each account at the balance before its first row', () => {
    expect(balanceOn(ledger, 'boc-main', '2026-01-01')).toBe(20000000);
    expect(balanceOn(ledger, 'boc-main', '2025-12-31')).toBeUndefined();
  });

  it('counts the overlapping BOC statements once', () => {
    expect(ledger.transactions.filter((row) => row.account === 'boc-main')).toHaveLength(7);
  });

  it('matches the transfers and the deposit', () => {
    expect(ledger.transfers.map((t) => `${t.from}->${t.to}:${t.rule}:${t.status}`).sort()).toEqual([
      'boc-main->cb-savings:fee:matched',
      `cb-savings->${DEPOSIT}:deposit:one-sided`,
      'hnb-lkr->cb-savings:fee:matched',
      'hnb-usd->hnb-lkr:reference:matched',
    ]);
  });

  it('records the conversion rate', () => {
    expect(ledger.conversions).toEqual([
      expect.objectContaining({ from: 'hnb-usd', to: 'hnb-lkr', micro: 300000000 }),
    ]);
  });

  it('classifies rows by rule, wording and default', () => {
    const find = (text: string) =>
      ledger.transactions.find((row) => row.description.startsWith(text));
    expect(find('SLIPS IN - ACME')).toMatchObject({ kind: 'income', category: 'Salary' });
    expect(find('Rent February')).toMatchObject({ kind: 'spending', category: 'Rent' });
    expect(find('ATMCASHWDL')).toMatchObject({ kind: 'spending', category: 'Cash' });
    expect(find('2026010900000001-ACME LLC')).toMatchObject({
      kind: 'income',
      category: 'Other income',
    });
  });

  it('bills the card and reminds about the due date', () => {
    expect(ledger.cards['cb-card']?.find((cycle) => cycle.from === '2026-01-06')).toMatchObject({
      to: '2026-02-05',
      billed: 650050,
      dueDate: '2026-02-26',
      status: 'unpaid',
    });
    expect(ledger.needs.map((need) => need.type)).toContain('card-due');
  });

  it('reports files that need attention', () => {
    const file = (path: string) => ledger.files.find((status) => status.path === path);
    expect(file('boc/notes.csv')?.status).toBe('unreadable');
    expect(file('boc/HNB_44444XXXXX44_USD_2026-01-01_to_2026-01-31.csv')).toMatchObject({
      account: 'hnb-usd',
      problems: ['wrong-folder'],
    });
    expect(file('boc/BOC_RECEIPT_overlap.csv')).toMatchObject({
      problems: ['improper-name', 'overlapping'],
      tidyName: 'BOC_0011111111_2026-01-20_to_2026-02-15.csv',
    });
    expect(file('combank/transactions_history_current_period.csv')?.tidyName).toBe(
      'ComBank_CreditCard_2026-01-06_to_2026-02-05.csv',
    );
    expect(file('boc/BOC_0011111111_2026-01-01_to_2026-01-31.csv')?.problems).toEqual([
      'overlapping',
    ]);
    const types = ledger.needs.map((need) => need.type);
    expect(types).toContain('unreadable-file');
    expect(types).toContain('tidy');
  });

  it('hides a need that was dismissed and lists unused answers', () => {
    const due = ledger.needs.find((need) => need.type === 'card-due');
    const again = loadWorld([
      { id: 'a1', at: 'x', type: 'dismiss', item: due?.id ?? '' },
      { id: 'a2', at: 'x', type: 'dismiss', item: 'no-such-need' },
    ]);
    expect(again.needs.map((need) => need.type)).not.toContain('card-due');
    expect(again.unusedDecisions).toEqual(['a2']);
  });

  it('is plain data', () => {
    expect(JSON.parse(JSON.stringify(ledger))).toEqual(ledger);
  });
});
