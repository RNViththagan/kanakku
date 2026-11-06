import { describe, expect, it } from 'vitest';
import { buildLedger } from '../src/ledger/build';
import { balanceOn } from '../src/views/balances';
import { loadWorld, WORLD_TODAY, worldConfig, worldFiles } from './helpers/world';

const ledger = loadWorld();
const DEPOSIT = 'deposit-combank-3099999999';

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

  it('marks a file it cannot read safely as unreadable instead of failing', () => {
    const boc = worldFiles().find((file) => file.name.startsWith('BOC_0011111111'));
    if (!boc) throw new Error('fixture missing');
    const broken = {
      ...boc,
      path: 'boc/broken.csv',
      name: 'broken.csv',
      text: boc.text.replace('"3,500.00"', '"99999999999999999.00"'),
    };
    const result = buildLedger({
      files: [...worldFiles(), broken],
      config: worldConfig(),
      decisions: [],
      rates: [],
      today: WORLD_TODAY,
    });
    expect(result.files.find((file) => file.path === 'boc/broken.csv')?.status).toBe('unreadable');
    expect(result.accounts).toHaveLength(6);
  });

  const withFiles = (
    extra: ReturnType<typeof worldFiles>,
    decisions: Parameters<typeof loadWorld>[0] = [],
  ) =>
    buildLedger({
      files: [...worldFiles(), ...extra],
      config: worldConfig(),
      decisions,
      rates: [],
      today: WORLD_TODAY,
    });

  it('does not trust a tidy name whose period misses the rows', () => {
    const misnamed = {
      path: 'hnb/HNB_33333XXXXX33_LKR_2026-01-01_to_2026-01-31_2.csv',
      name: 'HNB_33333XXXXX33_LKR_2026-01-01_to_2026-01-31_2.csv',
      folderBank: 'hnb',
      text: [
        'Date, Ref.No, Particulars, Debits, Credits, Balance',
        '05/02/2026,DC000009,Finacle Alert Charges,25,,54928.10',
        '28/02/2026,,BALANCE AS AT DATE,,,54928.10',
      ].join('\n'),
    };
    const result = withFiles([misnamed]);
    const status = result.files.find((file) => file.path === misnamed.path);
    expect(status?.period).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(status?.problems).toContain('improper-name');
    expect(status?.tidyName).toBe('HNB_33333XXXXX33_LKR_2026-02-01_to_2026-02-28.csv');
    expect(result.coverage['hnb-lkr']?.lastCovered).toBe('2026-02-28');
  });

  it('keeps one of two identical copies and offers the other for the bin', () => {
    const original = worldFiles().find(
      (file) => file.name === 'BOC_0011111111_2026-01-01_to_2026-01-31.csv',
    );
    if (!original) throw new Error('fixture missing');
    const copy = { ...original, path: 'boc/copy (1).csv', name: 'copy (1).csv' };
    const result = withFiles([copy]);
    const problems = (path: string) =>
      result.files.find((file) => file.path === path)?.problems ?? [];
    expect(problems(original.path)).not.toContain('duplicate');
    expect(problems(copy.path)).toContain('duplicate');
  });

  it('keeps need ids stable when files move and new when the situation changes', () => {
    const junk = worldFiles().find((file) => file.name === 'notes.csv');
    if (!junk) throw new Error('fixture missing');
    const moved = { ...junk, path: 'boc/old/notes-renamed.csv', name: 'notes-renamed.csv' };
    const before = ledger.needs.find((need) => need.type === 'unreadable-file')?.id;
    const files = worldFiles().map((file) => (file.name === 'notes.csv' ? moved : file));
    const after = buildLedger({
      files,
      config: worldConfig(),
      decisions: [],
      rates: [],
      today: WORLD_TODAY,
    }).needs.find((need) => need.type === 'unreadable-file')?.id;
    expect(after).toBe(before);

    const uncategorised = ledger.needs.find((need) => need.type === 'uncategorised');
    const dismissed = [
      { id: 'd1', at: 'x', type: 'dismiss' as const, item: uncategorised?.id ?? '' },
    ];
    expect(loadWorld(dismissed).needs.map((need) => need.type)).not.toContain('uncategorised');
    const boc = worldFiles().find((file) => file.name === 'BOC_RECEIPT_overlap.csv');
    if (!boc) throw new Error('fixture missing');
    const newer = {
      ...boc,
      path: 'boc/BOC_0011111111_2026-02-15_to_2026-02-18.csv',
      name: 'BOC_0011111111_2026-02-15_to_2026-02-18.csv',
      text: boc.text
        .replace(
          'Statement Period,2026-01-20 to 2026-02-15',
          'Statement Period,2026-02-15 to 2026-02-18',
        )
        .replace('2026-02-03,POS       CAFE THREE', '2026-02-17,POS       CAFE FOUR'),
    };
    expect(withFiles([newer], dismissed).needs.map((need) => need.type)).toContain('uncategorised');
  });

  it('tells you when some rows of a file could not be read', () => {
    const boc = worldFiles().find((file) => file.name === 'BOC_RECEIPT_overlap.csv');
    if (!boc) throw new Error('fixture missing');
    const damaged = { ...boc, text: boc.text.replace('2026-02-03,POS', '2026-02-31,POS') };
    const files = worldFiles().map((file) => (file.path === boc.path ? damaged : file));
    const result = buildLedger({
      files,
      config: worldConfig(),
      decisions: [],
      rates: [],
      today: WORLD_TODAY,
    });
    const need = result.needs.find((item) => item.type === 'bad-rows');
    expect(need?.refs.file).toBe(boc.path);
  });

  it('is plain data', () => {
    expect(JSON.parse(JSON.stringify(ledger))).toEqual(ledger);
  });
});
