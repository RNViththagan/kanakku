import { owedOn } from '../ledger/cards';
import type { Ledger } from '../ledger/types';
import { makeRateBook, type RateBook } from '../ledger/valuation';
import type { IsoDate } from '../model/types';

export function rateBookFor(
  ledger: Pick<Ledger, 'homeCurrency' | 'rates' | 'conversions'>,
): RateBook {
  return makeRateBook({
    home: ledger.homeCurrency,
    source: ledger.rates.source,
    stored: ledger.rates.stored,
    conversions: ledger.conversions,
    manual: ledger.rates.manual,
  });
}

export type BalanceSource = Pick<
  Ledger,
  'accounts' | 'coverage' | 'transactions' | 'closings' | 'depositMoves'
>;

export function balanceOn(
  ledger: BalanceSource,
  accountId: string,
  date: IsoDate,
): number | undefined {
  const account = ledger.accounts.find((candidate) => candidate.id === accountId);
  if (!account) return undefined;
  if (account.closed && date > account.closed) return 0;
  if (account.type === 'fixed-deposit') {
    return ledger.depositMoves
      .filter((move) => move.account === accountId && move.date <= date)
      .reduce((sum, move) => sum + move.amount, 0);
  }
  const firstKnown = ledger.coverage[accountId]?.firstKnown;
  if (!firstKnown || date < firstKnown) return undefined;
  const rows = ledger.transactions.filter((row) => row.account === accountId);
  if (account.type === 'credit-card') return -owedOn(account, rows, date);

  let best: { date: IsoDate; balance: number } | undefined;
  for (const row of rows) {
    if (row.date > date) break;
    if (row.balance !== undefined) best = { date: row.date, balance: row.balance };
  }
  for (const closing of ledger.closings[accountId] ?? []) {
    if (closing.date <= date && (!best || closing.date > best.date)) best = closing;
  }
  if (best) return best.balance;
  const next = rows.find((row) => row.date > date && row.balance !== undefined);
  if (next?.balance !== undefined) return next.balance - next.amount;
  const laterClosing = (ledger.closings[accountId] ?? [])
    .filter((closing) => closing.date > date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return laterClosing?.balance;
}
