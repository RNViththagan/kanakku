import type { Issue, ParsedRow } from '../banks/types';
import { decimalToMinor } from '../model/money';
import type { CurrencyCode } from '../model/types';

export type MoneyRow = Omit<ParsedRow, 'amount' | 'balance'> & {
  amount: number;
  balance?: number;
  file: string;
};

export type Direction = 'oldest-first' | 'newest-first' | 'unknown';

const MAX_PERMUTED_ROWS = 7;

export function toMoneyRows(rows: ParsedRow[], currency: CurrencyCode, file: string): MoneyRow[] {
  return rows.map(({ amount, balance, ...rest }) => {
    const row: MoneyRow = { ...rest, amount: decimalToMinor(amount, currency), file };
    if (balance !== undefined) row.balance = decimalToMinor(balance, currency);
    return row;
  });
}

function vote(rows: MoneyRow[]): Direction {
  let forward = 0;
  let backward = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const a = rows[index - 1];
    const b = rows[index];
    if (!a || !b || a.balance === undefined || b.balance === undefined) continue;
    if (a.amount === 0 || b.amount === 0) continue;
    if (b.balance === a.balance + b.amount) forward += 1;
    if (a.balance === b.balance + a.amount) backward += 1;
  }
  if (forward > backward) return 'oldest-first';
  if (backward > forward) return 'newest-first';
  return 'unknown';
}

function chainHolds(rows: MoneyRow[], start: number | undefined, end: number | undefined): boolean {
  let current = start;
  for (const row of rows) {
    if (row.balance === undefined) return false;
    if (current !== undefined && row.balance !== current + row.amount) return false;
    current = row.balance;
  }
  return end === undefined || current === end;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) yield [items[index] as T, ...tail];
  }
}

function greedy(rows: MoneyRow[], start: number | undefined): MoneyRow[] | undefined {
  const left = [...rows];
  const ordered: MoneyRow[] = [];
  let current = start;
  if (current === undefined) {
    const balances = new Set(left.map((row) => row.balance));
    const first = left.find((row) => !balances.has((row.balance ?? 0) - row.amount));
    if (!first) return undefined;
    left.splice(left.indexOf(first), 1);
    ordered.push(first);
    current = first.balance;
  }
  while (left.length > 0) {
    const next = left.find((row) => row.balance === (current ?? 0) + row.amount);
    if (!next) return undefined;
    left.splice(left.indexOf(next), 1);
    ordered.push(next);
    current = next.balance;
  }
  return ordered;
}

function search(
  rows: MoneyRow[],
  start: number | undefined,
  end: number | undefined,
): MoneyRow[] | undefined {
  if (rows.length > MAX_PERMUTED_ROWS) {
    const found = greedy(rows, start);
    return found && chainHolds(found, start, end) ? found : undefined;
  }
  for (const candidate of permutations(rows)) {
    if (chainHolds(candidate, start, end)) return candidate;
  }
  return undefined;
}

function orderDay(
  rows: MoneyRow[],
  start: number | undefined,
  end: number | undefined,
): MoneyRow[] | undefined {
  const anchors: Array<[number | undefined, number | undefined]> = [
    [start, end],
    [undefined, end],
    [start, undefined],
    [undefined, undefined],
  ];
  for (const [from, to] of anchors) {
    if (chainHolds(rows, from, to)) return rows;
    const found = search(rows, from, to);
    if (found) return found;
  }
  return undefined;
}

export function orderDays(rows: MoneyRow[]): { rows: MoneyRow[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!sorted.every((row) => row.balance !== undefined)) return { rows: sorted, issues };
  const days: MoneyRow[][] = [];
  for (const row of sorted) {
    const day = days.at(-1);
    if (day && day[0]?.date === row.date) day.push(row);
    else days.push([row]);
  }
  days.forEach((day, index) => {
    if (day.length < 2) return;
    const start = days[index - 1]?.at(-1)?.balance;
    const next = days[index + 1]?.[0];
    const end = next?.balance !== undefined ? next.balance - next.amount : undefined;
    const fixed = orderDay(day, start, end);
    if (fixed) {
      days[index] = fixed;
    } else {
      issues.push({
        level: 'info',
        code: 'order-unresolved',
        message: `Rows on ${day[0]?.date} could not be put in order by balance`,
        date: day[0]?.date ?? '',
        file: day[0]?.file ?? '',
      });
    }
  });
  return { rows: days.flat(), issues };
}

export function toChronological(rows: MoneyRow[]): {
  rows: MoneyRow[];
  direction: Direction;
  issues: Issue[];
} {
  const withBalances = rows.length > 0 && rows.every((row) => row.balance !== undefined);
  const direction: Direction = withBalances ? vote(rows) : 'unknown';
  let ordered = direction === 'newest-first' ? [...rows].reverse() : rows;
  if (direction === 'unknown' && withBalances && rows.length > 1) {
    const first = rows[0]?.date ?? '';
    const last = rows.at(-1)?.date ?? '';
    if (first > last) ordered = [...rows].reverse();
  }
  const result = orderDays(ordered);
  return {
    rows: result.rows,
    direction: withBalances ? direction : 'unknown',
    issues: result.issues,
  };
}
