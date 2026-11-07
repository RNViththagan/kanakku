import { buildLedger, type Ledger } from '@kanakku/core';
import { MARCH_FILE, worldConfig, worldFiles } from '../../../core/test/helpers/world';

export const MARCH_TODAY = '2026-03-20';

export function depositWorld() {
  return buildLedger({
    files: [...worldFiles(), MARCH_FILE],
    config: worldConfig(),
    decisions: [],
    rates: [],
    today: MARCH_TODAY,
  });
}

export function asPool(ledger: Ledger, id: string): Ledger {
  return {
    ...ledger,
    accounts: ledger.accounts.map((account) => {
      if (account.id !== id) return account;
      const { number: _number, ...pool } = account;
      return { ...pool, name: 'Unnamed LKR deposits' };
    }),
  };
}
