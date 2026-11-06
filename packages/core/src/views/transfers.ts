import type { Ledger } from '../ledger/types';
import { rateBookFor } from './balances';
import type { DateRange } from './range';

export interface TransferCell {
  from: string;
  to: string;
  amount: number;
  count: number;
}

export function transferMatrix(ledger: Ledger, range: DateRange): TransferCell[] {
  const rates = rateBookFor(ledger);
  const cells = new Map<string, TransferCell>();
  for (const transfer of ledger.transfers) {
    if (transfer.date < range.from || transfer.date > range.to) continue;
    let amount: number | undefined;
    if (transfer.currencyIn === ledger.homeCurrency && transfer.amountIn !== undefined) {
      amount = transfer.amountIn;
    } else if (transfer.currencyOut === ledger.homeCurrency) {
      amount =
        transfer.amountIn !== undefined && transfer.currencyIn === transfer.currencyOut
          ? transfer.amountIn
          : transfer.amountOut;
    } else {
      const arrived = transfer.amountIn ?? transfer.amountOut;
      const currency = transfer.currencyIn ?? transfer.currencyOut;
      amount = rates.toHome(arrived, currency, transfer.date)?.value;
    }
    if (amount === undefined) continue;
    const key = `${transfer.from}|${transfer.to}`;
    const cell = cells.get(key) ?? { from: transfer.from, to: transfer.to, amount: 0, count: 0 };
    cell.amount += amount;
    cell.count += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0,
  );
}
