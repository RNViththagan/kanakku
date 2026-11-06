import { hashText } from '../model/hash';
import type { CurrencyCode, IsoDate } from '../model/types';
import { type MoneyRow, orderDays } from './order';
import type { ChainBreak, Transaction } from './types';

export interface AccountFile {
  path: string;
  newness: IsoDate;
  rows: MoneyRow[];
}

function rowKey(row: MoneyRow): string {
  const description = row.description.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${row.date}|${row.amount}|r:${row.reference ?? ''}|d:${description}`;
}

function newestFirst(a: AccountFile, b: AccountFile): number {
  if (a.newness !== b.newness) return a.newness > b.newness ? -1 : 1;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function mergeAccountFiles(
  account: string,
  currency: CurrencyCode,
  files: AccountFile[],
): { transactions: Transaction[]; breaks: ChainBreak[] } {
  const kept = new Map<string, { row: MoneyRow; id: string; sources: Transaction['sources'] }>();
  for (const file of [...files].sort(newestFirst)) {
    const seen = new Map<string, number>();
    for (const row of file.rows) {
      const key = rowKey(row);
      const occurrence = seen.get(key) ?? 0;
      seen.set(key, occurrence + 1);
      const slot = `${key}#${occurrence}`;
      const existing = kept.get(slot);
      if (existing) {
        existing.sources.push({ file: row.file, line: row.line });
      } else {
        kept.set(slot, {
          row,
          id: hashText(`${account}|${slot}`),
          sources: [{ file: row.file, line: row.line }],
        });
      }
    }
  }

  const byRow = new Map([...kept.values()].map((entry) => [entry.row, entry]));
  const { rows } = orderDays([...byRow.keys()]);
  const transactions = rows.map((row) => {
    const entry = byRow.get(row);
    const transaction: Transaction = {
      id: entry?.id ?? '',
      account,
      date: row.date,
      amount: row.amount,
      currency,
      description: row.description,
      sources: entry?.sources ?? [],
      kind: '',
      category: '',
      tags: [],
      parts: [],
    };
    if (row.balance !== undefined) transaction.balance = row.balance;
    if (row.reference !== undefined) transaction.reference = row.reference;
    return transaction;
  });

  const breaks: ChainBreak[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const before = rows[index - 1];
    const after = rows[index];
    if (!before || !after || before.balance === undefined || after.balance === undefined) continue;
    if (after.balance === before.balance + after.amount) continue;
    breaks.push({
      account,
      before: { date: before.date, file: before.file, balance: before.balance },
      after: { date: after.date, file: after.file, amount: after.amount, balance: after.balance },
    });
  }
  return { transactions, breaks };
}
