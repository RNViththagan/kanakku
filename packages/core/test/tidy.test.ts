import { describe, expect, it } from 'vitest';
import type { Ledger } from '../src/ledger/types';
import { parseTidyName } from '../src/tidy/names';
import { planTidy } from '../src/tidy/plan';
import { loadWorld, worldConfig } from './helpers/world';

const ledger = loadWorld();
const folders = worldConfig().folders;
const existing = new Set(ledger.files.map((file) => file.path));

describe('planTidy', () => {
  it('renames, moves and leaves files as they should be', () => {
    expect(planTidy({ ledger, folders, existing })).toEqual([
      {
        file: 'boc/BOC_RECEIPT_overlap.csv',
        action: 'rename',
        to: 'boc/BOC_0011111111_2026-01-20_to_2026-02-15.csv',
        reason: 'improper-name',
      },
      {
        file: 'boc/HNB_44444XXXXX44_USD_2026-01-01_to_2026-01-31.csv',
        action: 'move',
        to: 'hnb/HNB_44444XXXXX44_USD_2026-01-01_to_2026-01-31.csv',
        reason: 'wrong-folder',
      },
      {
        file: 'combank/transaction_history_0022222222_20260216.csv',
        action: 'rename',
        to: 'combank/ComBank_0022222222_2026-01-12_to_2026-02-16.csv',
        reason: 'improper-name',
      },
      {
        file: 'combank/transactions_history_current_period.csv',
        action: 'rename',
        to: 'combank/ComBank_CreditCard_2026-01-06_to_2026-02-05.csv',
        reason: 'improper-name',
      },
    ]);
  });

  it('never overwrites an existing file', () => {
    const taken = new Set([...existing, 'combank/ComBank_CreditCard_2026-01-06_to_2026-02-05.csv']);
    const card = planTidy({ ledger, folders, existing: taken }).find(
      (proposal) => proposal.file === 'combank/transactions_history_current_period.csv',
    );
    expect(card?.to).toBe('combank/ComBank_CreditCard_2026-01-06_to_2026-02-05_2.csv');
  });

  it('sends duplicates to the bin', () => {
    const withDuplicate: Ledger = {
      ...ledger,
      files: ledger.files.map((file) =>
        file.path === 'boc/BOC_RECEIPT_overlap.csv' ? { ...file, problems: ['duplicate'] } : file,
      ),
    };
    expect(planTidy({ ledger: withDuplicate, folders, existing })[0]).toEqual({
      file: 'boc/BOC_RECEIPT_overlap.csv',
      action: 'bin',
      reason: 'duplicate',
    });
  });

  it('accepts a numbered copy as a tidy name', () => {
    expect(parseTidyName('ComBank_CreditCard_2026-01-06_to_2026-02-05_2.csv')).toEqual({
      bank: 'ComBank',
      label: 'CreditCard',
      from: '2026-01-06',
      to: '2026-02-05',
      partial: false,
    });
  });
});
