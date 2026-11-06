import type { Period } from '../banks/types';
import type { Account } from '../config/schema';
import { addDays, addMonths, clampDate } from '../model/dates';
import type { IsoDate } from '../model/types';
import type { Transaction } from './types';

export interface CardCycle {
  from: IsoDate;
  to: IsoDate;
  statementDate: IsoDate;
  dueDate: IsoDate;
  charges: number;
  credits: number;
  billed: number;
  paid: number;
  paidByDue: number;
  status: 'open' | 'paid' | 'part-paid' | 'unpaid' | 'overdue';
  coverage: 'full' | 'partial' | 'missing';
}

const yearMonth = (date: IsoDate) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
});

export function statementDateIn(year: number, month: number, statementDay: number): IsoDate {
  return clampDate(year, month, statementDay);
}

export function cycleFor(date: IsoDate, statementDay: number): Period {
  const { year, month } = yearMonth(date);
  const thisMonth = statementDateIn(year, month, statementDay);
  const endMonth = date <= thisMonth ? { year, month } : addMonths(year, month, 1);
  const startMonth = addMonths(endMonth.year, endMonth.month, -1);
  return {
    from: addDays(statementDateIn(startMonth.year, startMonth.month, statementDay), 1),
    to: statementDateIn(endMonth.year, endMonth.month, statementDay),
  };
}

export function dueDateFor(statementDate: IsoDate, statementDay: number, dueDay: number): IsoDate {
  const { year, month } = yearMonth(statementDate);
  const target = dueDay > statementDay ? { year, month } : addMonths(year, month, 1);
  return clampDate(target.year, target.month, dueDay);
}

function cardTransactions(account: Account, txns: Transaction[]): Transaction[] {
  return txns.filter((transaction) => transaction.account === account.id);
}

export function owedOn(account: Account, txns: Transaction[], date: IsoDate): number {
  let owed = account.card?.openingOwed ?? 0;
  for (const transaction of cardTransactions(account, txns)) {
    if (transaction.date <= date) owed -= transaction.amount;
  }
  return owed;
}

function creditsBetween(rows: Transaction[], after: IsoDate, upTo: IsoDate): number {
  return rows
    .filter((row) => row.amount > 0 && row.date > after && row.date <= upTo)
    .reduce((sum, row) => sum + row.amount, 0);
}

export function cardCycles(
  account: Account,
  txns: Transaction[],
  files: Array<{ period: Period; generatedAt?: IsoDate }>,
  today: IsoDate,
): CardCycle[] {
  const settings = account.card;
  if (!settings) return [];
  const { statementDay, dueDay } = settings;
  const rows = cardTransactions(account, txns);
  const starts = [...rows.map((row) => row.date), ...files.map((file) => file.period.from)].sort();
  const firstDate = starts[0];
  if (!firstDate) return [];

  const cycles: CardCycle[] = [];
  let cycle = cycleFor(firstDate, statementDay);
  const lastCycle = cycleFor(today, statementDay);
  while (cycle.from <= lastCycle.from) {
    const { from, to } = cycle;
    const statementDate = to;
    const next = cycleFor(addDays(to, 1), statementDay);
    const dueDate = dueDateFor(statementDate, statementDay, dueDay);
    const inCycle = rows.filter((row) => row.date >= from && row.date <= to);
    const charges = inCycle
      .filter((row) => row.amount < 0)
      .reduce((sum, row) => sum - row.amount, 0);
    const credits = inCycle
      .filter((row) => row.amount > 0)
      .reduce((sum, row) => sum + row.amount, 0);
    const billed = owedOn(account, rows, statementDate);
    const paidUntil = next.to < today ? next.to : today;
    const paid = creditsBetween(rows, statementDate, paidUntil);
    const paidByDue = creditsBetween(rows, statementDate, dueDate < today ? dueDate : today);

    let status: CardCycle['status'];
    if (today <= statementDate) status = 'open';
    else if (billed <= 0 || paid >= billed) status = 'paid';
    else if (today > dueDate) status = 'overdue';
    else if (paid > 0) status = 'part-paid';
    else status = 'unpaid';

    const touching = files.filter((file) => file.period.from <= to && file.period.to >= from);
    let coverage: CardCycle['coverage'];
    if (touching.length === 0) {
      coverage = today <= statementDate ? 'partial' : 'missing';
    } else {
      const latest =
        touching
          .map((file) => file.generatedAt ?? file.period.to)
          .sort()
          .at(-1) ?? '';
      coverage = latest >= to ? 'full' : 'partial';
    }

    cycles.push({
      from,
      to,
      statementDate,
      dueDate,
      charges,
      credits,
      billed,
      paid,
      paidByDue,
      status,
      coverage,
    });
    cycle = next;
  }
  return cycles;
}
