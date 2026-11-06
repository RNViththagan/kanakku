import {
  type Account,
  type AccountCoverage,
  addDays,
  addMonths,
  balanceOn,
  type CurrencyCode,
  cashFlowByMonth,
  type DateRange,
  findBank,
  type IsoDate,
  type Kind,
  type Ledger,
  monthKey,
  type NeedsItem,
  netWorthSeries,
  rateBookFor,
  startOfMonth,
} from '@kanakku/core';

export interface OverviewStats {
  netWorth: number;
  netWorthChange?: number;
  inAccounts: number;
  inDeposits: number;
  owedOnCards: number;
  hasCards: boolean;
  spentThisMonth: number;
  spentLastMonth: number;
  unknown: string[];
  unvalued: CurrencyCode[];
}

export function overviewStats(ledger: Ledger): OverviewStats {
  const today = ledger.today;
  const lastMonthEnd = addDays(startOfMonth(today), -1);
  const [now] = netWorthSeries(ledger, { from: today, to: today, step: 'day' });
  const [before] = netWorthSeries(ledger, { from: lastMonthEnd, to: lastMonthEnd, step: 'day' });
  let inAccounts = 0;
  let inDeposits = 0;
  let owedOnCards = 0;
  for (const account of ledger.accounts) {
    const value = now?.byAccount[account.id];
    if (value === undefined) continue;
    if (account.type === 'fixed-deposit') inDeposits += value;
    else if (account.type === 'credit-card') owedOnCards -= value;
    else inAccounts += value;
  }
  const months = cashFlowByMonth(ledger, { from: startOfMonth(lastMonthEnd), to: today });
  const spentIn = (month: string) => months.find((row) => row.month === month)?.spending ?? 0;
  const stats: OverviewStats = {
    netWorth: now?.total ?? 0,
    inAccounts,
    inDeposits,
    owedOnCards,
    hasCards: ledger.accounts.some((account) => account.type === 'credit-card'),
    spentThisMonth: spentIn(monthKey(today)),
    spentLastMonth: spentIn(monthKey(lastMonthEnd)),
    unknown: now?.unknown ?? [],
    unvalued: now?.unvalued ?? [],
  };
  const comparable =
    ledger.accounts.length > 0 && before?.unknown.length === 0 && before.unvalued.length === 0;
  if (comparable) stats.netWorthChange = stats.netWorth - before.total;
  return stats;
}

export interface AccountRow {
  account: Account;
  asOf: IsoDate;
  balance?: number;
  homeValue?: number;
  coverage?: AccountCoverage;
  lastStatement?: IsoDate;
}

export interface BankGroup {
  bank: string;
  name: string;
  accounts: AccountRow[];
}

export function accountRow(
  ledger: Ledger,
  account: Account,
  rates = rateBookFor(ledger),
): AccountRow {
  const coverage = ledger.coverage[account.id];
  const covered = coverage?.lastCovered;
  const asOf = covered && covered < ledger.today ? covered : ledger.today;
  const row: AccountRow = { account, asOf };
  if (coverage) row.coverage = coverage;
  const balance = balanceOn(ledger, account.id, asOf);
  if (balance !== undefined) {
    row.balance = balance;
    const valued = rates.toHome(balance, account.currency, asOf);
    if (valued) row.homeValue = valued.value;
  }
  const lastStatement = ledger.files
    .filter((file) => file.account === account.id && file.status === 'ok')
    .flatMap((file) => (file.period ? [file.period.to] : []))
    .sort()
    .at(-1);
  if (lastStatement) row.lastStatement = lastStatement;
  return row;
}

export function accountsByBank(ledger: Ledger): BankGroup[] {
  const rates = rateBookFor(ledger);
  const groups = new Map<string, BankGroup>();
  for (const account of ledger.accounts) {
    const group = groups.get(account.bank) ?? {
      bank: account.bank,
      name: findBank(account.bank)?.name ?? account.bank,
      accounts: [],
    };
    group.accounts.push(accountRow(ledger, account, rates));
    groups.set(account.bank, group);
  }
  return [...groups.values()];
}

export type RangePreset = 'this-month' | '3m' | '6m' | '12m' | 'this-year' | 'all';

export const RANGE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: 'this-month', label: 'This month' },
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: '12m', label: 'Last 12 months' },
  { id: 'this-year', label: 'This year' },
  { id: 'all', label: 'All' },
];

export function rangeEndingAt(today: IsoDate, months: number): DateRange {
  const start = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1 - months);
  return { from: `${start.year}-${String(start.month).padStart(2, '0')}-01`, to: today };
}

export function rangeFor(
  preset: RangePreset,
  today: IsoDate,
  ledger: Pick<Ledger, 'coverage' | 'transactions'>,
): DateRange {
  switch (preset) {
    case 'this-month':
      return rangeEndingAt(today, 1);
    case '3m':
      return rangeEndingAt(today, 3);
    case '6m':
      return rangeEndingAt(today, 6);
    case '12m':
      return rangeEndingAt(today, 12);
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'all': {
      const first = [
        ...Object.values(ledger.coverage).map((coverage) => coverage.firstKnown),
        ...ledger.transactions.map((row) => row.date),
      ]
        .filter((date): date is IsoDate => date !== undefined && date <= today)
        .sort()[0];
      return first ? { from: first, to: today } : rangeEndingAt(today, 1);
    }
  }
}

export function latestMonth(ledger: Ledger): string {
  let latest: string | undefined;
  for (const row of ledger.transactions) {
    if (row.date > ledger.today || !row.parts.some((part) => part.kind === 'spending')) continue;
    const month = monthKey(row.date);
    if (!latest || month > latest) latest = month;
  }
  return latest ?? monthKey(ledger.today);
}

export interface TransactionRow {
  id: string;
  date: IsoDate;
  accountId: string;
  accountName: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  kind: Kind | '';
  category: string;
  files: string;
  flag?: string;
  transfer?: string;
  transferWith?: string;
}

export function transactionRows(ledger: Ledger): TransactionRow[] {
  const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));
  const transfers = new Map(ledger.transfers.map((transfer) => [transfer.id, transfer]));
  const rows = ledger.transactions.map((row) => {
    const result: TransactionRow = {
      id: row.id,
      date: row.date,
      accountId: row.account,
      accountName: names.get(row.account) ?? row.account,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      kind: row.kind,
      category: row.category,
      files: [...new Set(row.sources.map((source) => source.file))].join(', '),
    };
    if (row.flag) result.flag = row.flag;
    const transfer = row.transfer ? transfers.get(row.transfer) : undefined;
    if (row.transfer) result.transfer = row.transfer;
    if (transfer) {
      const other = transfer.from === row.account ? transfer.to : transfer.from;
      result.transferWith = names.get(other) ?? other;
    }
    return result;
  });
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

const NEED_LABELS: Record<string, string> = {
  'new-account': 'New accounts found',
  'pick-account': 'Files with no account',
  'missing-period': 'Missing statements',
  'broken-chain': 'Balances that do not follow on',
  'card-overdue': 'Card payments overdue',
  'card-due': 'Card payments due',
  'unreadable-file': 'Files Kanakku cannot read',
  'totals-mismatch': 'Statement totals that do not add up',
  'bad-rows': 'Rows Kanakku could not read',
  'possible-transfer': 'Possible transfers',
  'ambiguous-transfer': 'Transfers with more than one match',
  counterparty: 'Is this your account?',
  'deposit-principal': 'Fixed deposit amounts',
  'deposit-before-statements': 'Fixed deposits older than your statements',
  'deposit-maturity': 'Fixed deposits maturing',
  'no-rate': 'Missing exchange rates',
  'deposit-details': 'Fixed deposit details',
  uncategorised: 'Uncategorised spending',
  tidy: 'Files to tidy up',
};

const URGENCY: Record<NeedsItem['severity'], number> = { high: 0, normal: 1, low: 2 };

export interface NeedsGroup {
  type: string;
  label: string;
  severity: NeedsItem['severity'];
  items: NeedsItem[];
}

export function needsByType(ledger: Pick<Ledger, 'needs'>): NeedsGroup[] {
  const groups = new Map<string, NeedsGroup>();
  for (const need of ledger.needs) {
    const group = groups.get(need.type) ?? {
      type: need.type,
      label: NEED_LABELS[need.type] ?? need.type,
      severity: need.severity,
      items: [],
    };
    group.items.push(need);
    if (URGENCY[need.severity] < URGENCY[group.severity]) group.severity = need.severity;
    groups.set(need.type, group);
  }
  return [...groups.values()].sort((a, b) => URGENCY[a.severity] - URGENCY[b.severity]);
}
