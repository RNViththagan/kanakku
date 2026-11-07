import type { Decision, DecisionContent, Ledger, Transaction } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import {
  answerLabel,
  coversDate,
  otherAccounts,
  ruleCount,
  ruleText,
  transferCandidates,
  transfersTaken,
} from '../src/answers';

const ledger = loadWorld();
const found = ledger.transactions.find((row) => row.description.startsWith('POS       GROCER'));
if (!found) throw new Error('fixture row missing');
const grocer: Transaction = found;

describe('otherAccounts', () => {
  it('offers the other accounts that can take a transfer', () => {
    expect(otherAccounts(ledger, grocer.id).map((account) => account.id)).toEqual([
      'cb-savings',
      'cb-card',
      'hnb-lkr',
      'hnb-usd',
    ]);
  });

  it('leaves out an account closed before the row', () => {
    const closed: Ledger = {
      ...ledger,
      accounts: ledger.accounts.map((account) =>
        account.id === 'hnb-usd' ? { ...account, closed: '2025-12-31' } : account,
      ),
    };
    expect(otherAccounts(closed, grocer.id).map((account) => account.id)).not.toContain('hnb-usd');
  });
});

describe('transferCandidates', () => {
  const base = ledger.transactions.find((row) => row.account === 'hnb-lkr');
  if (!base) throw new Error('fixture row missing');
  const credit: Transaction = {
    ...base,
    id: 'hand-credit',
    date: '2026-01-07',
    amount: 350000,
    description: 'CEFT-A PERERA',
    kind: 'income',
    category: 'Other income',
    parts: [{ kind: 'income', category: 'Other income', amount: 350000 }],
  };
  delete credit.transfer;

  it('finds the likely other side first', () => {
    const withCredit: Ledger = { ...ledger, transactions: [...ledger.transactions, credit] };
    expect(transferCandidates(withCredit, grocer.id, 'hnb-lkr')[0]?.id).toBe('hand-credit');
  });

  it('leaves out rows already in a transfer', () => {
    const paired = ledger.transactions.filter(
      (row) => row.account === 'hnb-lkr' && row.amount > 0 && row.transfer !== undefined,
    );
    expect(paired.length).toBeGreaterThan(0);
    const ids = transferCandidates(ledger, grocer.id, 'hnb-lkr', 400).map((row) => row.id);
    for (const row of paired) expect(ids).not.toContain(row.id);
  });
});

describe('coversDate', () => {
  it("knows when an account's statements cover a date", () => {
    expect(coversDate(ledger, 'hnb-lkr', '2026-01-15')).toBe(true);
    expect(coversDate(ledger, 'hnb-lkr', '2026-02-15')).toBe(false);
    expect(coversDate(ledger, 'no-such-account', '2026-01-15')).toBe(false);
  });
});

describe('answerLabel', () => {
  const label = (content: DecisionContent) =>
    answerLabel({ id: 'x', at: 'y', ...content } as Decision, ledger, 'en-US');
  const row = 'POS GROCER ONE - COLOMBO, -3,500.00 LKR on Jan 5, 2026,';

  it('describes each answer in a sentence', () => {
    expect(label({ type: 'not-transfer', txn: grocer.id })).toBe(`${row} is not a transfer.`);
    expect(label({ type: 'transfer', txn: grocer.id, account: 'hnb-lkr' })).toBe(
      `${row} went to HNB LKR.`,
    );
    expect(label({ type: 'set', txn: grocer.id, kind: 'spending', category: 'Groceries' })).toBe(
      `${row} is spending: Groceries.`,
    );
    expect(label({ type: 'counterparty', text: 'SAVER', mine: false })).toBe(
      '"SAVER" is not one of your accounts.',
    );
    expect(label({ type: 'dismiss', item: 'n1' })).toBe('You hid an item in Needs you.');
    expect(label({ type: 'not-transfer', txn: 'gone' })).toBe(
      'A transaction no longer in your statements is not a transfer.',
    );
  });
});

describe('ruleText', () => {
  it('picks rule text that every description contains', () => {
    expect(ruleText(['Rent Oct / 06 / AM', 'Rent September / 07', 'April Rent 301'])).toBe('Rent');
  });

  it('gives nothing when the descriptions share no word', () => {
    expect(ruleText(['SHOP ONE', 'CAFE TWO'])).toBe('');
    expect(ruleText([])).toBe('');
  });

  it('prefills a rule that matches the row it came from', () => {
    for (const row of ledger.transactions.filter((item) => /\p{L}/u.test(item.description))) {
      const match = ruleText([row.description]);
      expect(ruleCount(ledger, { match }), row.description).toBeGreaterThanOrEqual(1);
    }
  });

  it('counts rows by direction too', () => {
    expect(ruleCount(ledger, { match: 'GROCER', direction: 'in' })).toBe(0);
    expect(ruleCount(ledger, { match: 'GROCER', direction: 'out' })).toBeGreaterThanOrEqual(1);
  });
});

describe('transfersTaken', () => {
  it('counts the transfers a rule would turn into income or spending', () => {
    expect(transfersTaken(ledger, { match: { text: 'TRF TO' } })).toBe(1);
  });

  it('leaves out transfers you paired by hand, which a rule cannot take', () => {
    const paired: Ledger = {
      ...ledger,
      transactions: ledger.transactions.map((row) =>
        row.description.startsWith('TRF TO') ? { ...row, decidedBy: 'answer' as const } : row,
      ),
    };
    expect(transfersTaken(paired, { match: { text: 'TRF TO' } })).toBe(0);
  });
});
