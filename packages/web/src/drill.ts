import {
  type DateRange,
  type Ledger,
  monthKey,
  type Part,
  rateBookFor,
  type Transaction,
} from '@kanakku/core';
import type { FlowItem, MoneyFlow } from './flow';
import { monthLabel } from './format';

export type DrillBy = 'payee' | 'month' | 'account';

export const DRILL_BY: DrillBy[] = ['payee', 'month', 'account'];

export interface DrillEntry {
  transaction: Transaction;
  value: number;
}

export interface DrillGroup {
  key: string;
  label: string;
  value: number;
  count: number;
}

const MONTHS = new Set([
  ...'jan feb mar apr may jun jul aug sep sept oct nov dec'.split(' '),
  ...'january february march april june july august september october november december'.split(' '),
]);

export function payeeOf({
  description,
  counterparty,
}: Pick<Transaction, 'description' | 'counterparty'>): string {
  const source = counterparty ?? description.split(' / ')[0] ?? '';
  const words = source
    .replace(/[:/|]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/\d+/g, '').replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, ''))
    .filter(
      (word) => /\p{L}/u.test(word) && !/^x+$/i.test(word) && !MONTHS.has(word.toLowerCase()),
    );
  return words.length > 0 ? words.join(' ').toUpperCase() : 'No description';
}

export function findItem(flow: MoneyFlow, key: string): FlowItem | undefined {
  for (const item of [...flow.sources, ...flow.uses]) {
    if (item.key === key) return item;
    const folded = item.folded.find((part) => part.key === key);
    if (folded) return folded;
  }
  return undefined;
}

export function resolveItem(flow: MoneyFlow, key: string): FlowItem | undefined {
  const found = findItem(flow, key);
  if (found) return found;
  const mark = key.indexOf(':');
  const origin = key.slice(0, Math.max(mark, 0));
  const category = key.slice(mark + 1);
  if (origin !== 'income' && origin !== 'spending') return undefined;
  if (!category) return undefined;
  return {
    key,
    label: category,
    value: 0,
    kind: 'category',
    side: origin === 'income' ? 'in' : 'out',
    origin,
    category,
    folded: [],
  };
}

function counts(part: Part, item: FlowItem): boolean {
  if (part.kind !== 'income' && part.kind !== 'spending') return false;
  return item.kind !== 'category' || (part.kind === item.origin && part.category === item.category);
}

function signOf(item: FlowItem): number {
  if (item.kind === 'savings') return item.side === 'out' ? 1 : -1;
  return item.side === 'in' ? 1 : -1;
}

export function drillEntries(ledger: Ledger, range: DateRange, item: FlowItem): DrillEntry[] {
  if (item.kind === 'other') {
    return item.folded.flatMap((part) => drillEntries(ledger, range, part));
  }
  const rates = rateBookFor(ledger);
  const sign = signOf(item);
  const entries: DrillEntry[] = [];
  for (const transaction of ledger.transactions) {
    if (transaction.date < range.from || transaction.date > range.to) continue;
    let value = 0;
    let counted = false;
    for (const part of transaction.parts) {
      if (!counts(part, item)) continue;
      const valued = rates.toHome(part.amount, transaction.currency, transaction.date);
      if (!valued) continue;
      value += valued.value;
      counted = true;
    }
    if (counted) entries.push({ transaction, value: sign * value });
  }
  return entries;
}

export function groupKey(transaction: Transaction, by: DrillBy): string {
  if (by === 'month') return monthKey(transaction.date);
  if (by === 'account') return transaction.account;
  return payeeOf(transaction);
}

export function groupEntries(
  entries: DrillEntry[],
  by: DrillBy,
  names: Map<string, string>,
  locale: string,
): DrillGroup[] {
  const groups = new Map<string, DrillGroup>();
  for (const entry of entries) {
    const key = groupKey(entry.transaction, by);
    const label =
      by === 'month' ? monthLabel(key, locale) : by === 'account' ? (names.get(key) ?? key) : key;
    const group = groups.get(key) ?? { key, label, value: 0, count: 0 };
    group.value += entry.value;
    group.count += 1;
    groups.set(key, group);
  }
  const list = [...groups.values()];
  if (by === 'month') return list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return list.sort(
    (a, b) => b.value - a.value || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  );
}
