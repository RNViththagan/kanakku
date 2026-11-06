import type { ParsedStatement, Period } from '../banks/types';
import type { Account } from '../config/schema';
import { addDays, diffDays } from '../model/dates';
import type { IsoDate } from '../model/types';
import { parseTidyName } from '../tidy/names';
import type { MoneyRow } from './order';
import type { ChainBreak, Transaction } from './types';

export const BEHIND_DAYS = 7;
export const GENERATED_GRACE_DAYS = 7;

export type PeriodSource = 'stated' | 'tidy-name' | 'inferred' | 'rows';

export interface CoverageSegment {
  from: IsoDate;
  to: IsoDate;
  state: 'covered' | 'quiet' | 'missing';
}

export interface AccountCoverage {
  segments: CoverageSegment[];
  firstKnown?: IsoDate;
  lastCovered?: IsoDate;
  behindDays?: number;
  brokenChains: ChainBreak[];
}

export interface CoverageFile {
  path: string;
  period: Period;
  closing?: { date: IsoDate; balance: number };
}

export function filePeriod(
  parsed: ParsedStatement,
  fileName: string,
  rows: MoneyRow[],
): (Period & { source: PeriodSource }) | undefined {
  if (parsed.period && !parsed.period.inferred) {
    return { from: parsed.period.from, to: parsed.period.to, source: 'stated' };
  }
  const tidy = parseTidyName(fileName);
  const dataDates = [
    ...rows.map((row) => row.date),
    ...(parsed.closing ? [parsed.closing.date] : []),
  ].sort();
  const dataFrom = dataDates[0];
  const dataTo = dataDates.at(-1);
  const tidyCoversData =
    tidy !== undefined &&
    (dataFrom === undefined || tidy.from <= dataFrom) &&
    (dataTo === undefined || tidy.to >= dataTo);
  if (tidy && tidyCoversData) return { from: tidy.from, to: tidy.to, source: 'tidy-name' };
  if (parsed.period?.inferred)
    return { from: parsed.period.from, to: parsed.period.to, source: 'inferred' };
  const dates = rows.map((row) => row.date).sort();
  const first = dates[0];
  let last = dates.at(-1);
  if (parsed.closing && (!last || parsed.closing.date > last)) last = parsed.closing.date;
  if (!last) return undefined;
  const generated = parsed.generatedAt;
  if (generated && rows.length > 0) {
    const gap = diffDays(last, generated);
    if (gap > 0 && gap <= GENERATED_GRACE_DAYS) last = generated;
  }
  return { from: first ?? last, to: last, source: 'rows' };
}

function joinPeriods(periods: Period[]): Period[] {
  const sorted = [...periods].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const joined: Period[] = [];
  for (const period of sorted) {
    const last = joined.at(-1);
    if (last && period.from <= addDays(last.to, 1)) {
      if (period.to > last.to) last.to = period.to;
    } else {
      joined.push({ ...period });
    }
  }
  return joined;
}

function closingAt(
  date: IsoDate,
  transactions: Transaction[],
  files: CoverageFile[],
): number | undefined {
  let best: { date: IsoDate; balance: number } | undefined;
  for (const transaction of transactions) {
    if (transaction.date > date || transaction.balance === undefined) continue;
    if (!best || transaction.date >= best.date)
      best = { date: transaction.date, balance: transaction.balance };
  }
  for (const file of files) {
    const closing = file.closing;
    if (!closing || closing.date > date) continue;
    if (!best || closing.date > best.date) best = closing;
  }
  return best?.balance;
}

function openingAt(
  date: IsoDate,
  transactions: Transaction[],
  files: CoverageFile[],
): number | undefined {
  const first = transactions.find(
    (transaction) => transaction.date >= date && transaction.balance !== undefined,
  );
  const closing = files
    .map((file) => file.closing)
    .filter((candidate) => candidate !== undefined && candidate.date >= date)
    .sort((a, b) => ((a?.date ?? '') < (b?.date ?? '') ? -1 : 1))[0];
  if (first?.balance !== undefined && (!closing || first.date <= closing.date)) {
    return first.balance - first.amount;
  }
  return closing?.balance;
}

export function accountCoverage(input: {
  account: Account;
  files: CoverageFile[];
  transactions: Transaction[];
  breaks: ChainBreak[];
  today: IsoDate;
}): AccountCoverage {
  const { account, files, transactions, breaks, today } = input;
  let covered = joinPeriods(files.map((file) => file.period));
  if (account.closed) {
    const closed = account.closed;
    covered = covered
      .filter((period) => period.from <= closed)
      .map((period) => ({ from: period.from, to: period.to > closed ? closed : period.to }));
  }
  const first = covered[0];
  const last = covered.at(-1);
  if (!first || !last) return { segments: [], brokenChains: [] };

  const segments: CoverageSegment[] = [];
  if (account.opened && account.opened < first.from) {
    const opening = openingAt(first.from, transactions, files);
    segments.push({
      from: account.opened,
      to: addDays(first.from, -1),
      state: opening === 0 ? 'quiet' : 'missing',
    });
  }

  const brokenChains: ChainBreak[] = [];
  const insideCovered = (item: ChainBreak) =>
    covered.some((period) => item.before.date >= period.from && item.after.date <= period.to);
  for (const item of breaks) {
    if (insideCovered(item)) brokenChains.push(item);
  }

  covered.forEach((period, index) => {
    const previous = covered[index - 1];
    if (previous) {
      const hole = { from: addDays(previous.to, 1), to: addDays(period.from, -1) };
      const brokenAcross = breaks.some(
        (item) => item.before.date <= previous.to && item.after.date >= period.from,
      );
      const before = closingAt(previous.to, transactions, files);
      const after = openingAt(period.from, transactions, files);
      const holds = !brokenAcross && before !== undefined && before === after;
      segments.push({ ...hole, state: holds ? 'quiet' : 'missing' });
    }
    segments.push({ from: period.from, to: period.to, state: 'covered' });
  });

  const coverage: AccountCoverage = {
    segments,
    firstKnown: first.from,
    lastCovered: last.to,
    brokenChains,
  };
  const behind = diffDays(last.to, today);
  if (!account.closed && behind > BEHIND_DAYS) coverage.behindDays = behind;
  return coverage;
}
