import type { Ledger } from '../ledger/types';
import { rateBookFor } from './balances';
import type { DateRange } from './range';

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export function spendingByCategory(ledger: Ledger, range: DateRange): CategoryTotal[] {
  const rates = rateBookFor(ledger);
  const totals = new Map<string, CategoryTotal>();
  for (const row of ledger.transactions) {
    if (row.date < range.from || row.date > range.to) continue;
    const counted = new Set<string>();
    for (const part of row.parts) {
      if (part.kind !== 'spending') continue;
      const valued = rates.toHome(part.amount, row.currency, row.date);
      if (!valued) continue;
      const entry = totals.get(part.category) ?? { category: part.category, total: 0, count: 0 };
      entry.total -= valued.value;
      if (!counted.has(part.category)) {
        entry.count += 1;
        counted.add(part.category);
      }
      totals.set(part.category, entry);
    }
  }
  return [...totals.values()].sort(
    (a, b) => b.total - a.total || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
  );
}
