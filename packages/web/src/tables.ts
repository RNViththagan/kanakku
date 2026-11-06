import {
  type Account,
  addDays,
  balanceOn,
  type CoverageSegment,
  type CurrencyCode,
  type DateRange,
  diffDays,
  type FileProblem,
  findBank,
  type IsoDate,
  type Ledger,
  maturityOf,
  minorUnits,
  type RateUse,
  rateBookFor,
  type Transfer,
  transferMatrix,
} from '@kanakku/core';
import type { TransactionRow } from './model';

export const UNKNOWN_ACCOUNT = 'Unknown';

export type TransferStatus = Transfer['status'] | 'waiting' | 'possible' | 'ambiguous';
export type TransferTab = 'needs' | 'waiting' | 'all' | 'deposits';

export interface TransferRow {
  id: string;
  date: IsoDate;
  from?: string;
  fromName: string;
  to?: string;
  toName: string;
  amount: number;
  currency: CurrencyCode;
  amountIn?: number;
  currencyIn?: CurrencyCode;
  fee: number;
  status: TransferStatus;
  deposit: boolean;
}

export function transferRows(ledger: Ledger, range: DateRange): TransferRow[] {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  const name = (id: string) => accounts.get(id)?.name ?? id;
  const isDeposit = (id: string) => accounts.get(id)?.type === 'fixed-deposit';
  const inRange = (date: IsoDate) => date >= range.from && date <= range.to;
  const rows: TransferRow[] = [];
  for (const transfer of ledger.transfers) {
    if (!inRange(transfer.date)) continue;
    const row: TransferRow = {
      id: transfer.id,
      date: transfer.date,
      from: transfer.from,
      fromName: name(transfer.from),
      to: transfer.to,
      toName: name(transfer.to),
      amount: transfer.amountOut,
      currency: transfer.currencyOut,
      fee: transfer.fee,
      status: transfer.status,
      deposit: isDeposit(transfer.from) || isDeposit(transfer.to),
    };
    if (transfer.amountIn !== undefined && transfer.currencyIn !== undefined) {
      row.amountIn = transfer.amountIn;
      row.currencyIn = transfer.currencyIn;
    }
    rows.push(row);
  }
  for (const transaction of ledger.transactions) {
    if (!transaction.flag || !inRange(transaction.date)) continue;
    const out = transaction.amount < 0;
    const row: TransferRow = {
      id: transaction.id,
      date: transaction.date,
      fromName: out ? name(transaction.account) : UNKNOWN_ACCOUNT,
      toName: out ? UNKNOWN_ACCOUNT : name(transaction.account),
      amount: Math.abs(transaction.amount),
      currency: transaction.currency,
      fee: 0,
      status: transaction.flag,
      deposit: transaction.deposit !== undefined,
    };
    if (out) row.from = transaction.account;
    else row.to = transaction.account;
    rows.push(row);
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function transfersOnTab(rows: TransferRow[], tab: TransferTab): TransferRow[] {
  switch (tab) {
    case 'needs':
      return rows.filter((row) => row.status === 'possible' || row.status === 'ambiguous');
    case 'waiting':
      return rows.filter((row) => row.status === 'waiting');
    case 'deposits':
      return rows.filter((row) => row.deposit);
    case 'all':
      return rows.filter(
        (row) =>
          row.status === 'matched' || row.status === 'confirmed' || row.status === 'one-sided',
      );
  }
}

export interface TransferPair {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
  count: number;
}

export function transferPairs(ledger: Ledger, range: DateRange): TransferPair[] {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  const node = (id: string): [string, string] => {
    const account = accounts.get(id);
    if (account?.type !== 'fixed-deposit') return [id, account?.name ?? id];
    const bank = findBank(account.bank)?.shortName ?? account.bank;
    return [`deposits:${account.bank}`, `${bank} fixed deposits`];
  };
  const pairs = new Map<string, TransferPair>();
  for (const cell of transferMatrix(ledger, range)) {
    const [from, fromName] = node(cell.from);
    const [to, toName] = node(cell.to);
    const pair = pairs.get(`${from}|${to}`) ?? { from, fromName, to, toName, amount: 0, count: 0 };
    pair.amount += cell.amount;
    pair.count += cell.count;
    pairs.set(`${from}|${to}`, pair);
  }
  return [...pairs.values()].sort((a, b) => b.amount - a.amount);
}

export interface CurrencySummary {
  currency: CurrencyCode;
  conversions: number;
  foreignTotal: number;
  homeTotal: number;
  averageMicro?: number;
  held: number;
  heldValue?: number;
  rate?: RateUse;
}

export function conversionSummary(ledger: Ledger): CurrencySummary[] {
  const home = ledger.homeCurrency;
  const rates = rateBookFor(ledger);
  const currencies = [...new Set(ledger.accounts.map((account) => account.currency))].filter(
    (currency) => currency !== home,
  );
  return currencies.map((currency) => {
    const summary: CurrencySummary = {
      currency,
      conversions: 0,
      foreignTotal: 0,
      homeTotal: 0,
      held: 0,
    };
    for (const conversion of ledger.conversions) {
      if (conversion.currencyOut === currency && conversion.currencyIn === home) {
        summary.foreignTotal += conversion.amountOut;
        summary.homeTotal += conversion.amountIn;
      } else if (conversion.currencyIn === currency && conversion.currencyOut === home) {
        summary.foreignTotal += conversion.amountIn;
        summary.homeTotal += conversion.amountOut;
      } else continue;
      summary.conversions += 1;
    }
    for (const account of ledger.accounts) {
      if (account.currency === currency)
        summary.held += balanceOn(ledger, account.id, ledger.today) ?? 0;
    }
    if (summary.foreignTotal > 0) {
      const homeMajor = summary.homeTotal / 10 ** minorUnits(home);
      const foreignMajor = summary.foreignTotal / 10 ** minorUnits(currency);
      summary.averageMicro = Math.round((homeMajor / foreignMajor) * 1_000_000);
    }
    const rate = rates.rateOn(currency, ledger.today);
    if (rate) summary.rate = rate;
    const valued = rates.toHome(summary.held, currency, ledger.today);
    if (valued) summary.heldValue = valued.value;
    return summary;
  });
}

export interface BarPart {
  state: CoverageSegment['state'] | 'none';
  from: IsoDate;
  to: IsoDate;
  share: number;
}

export function coverageBar(segments: CoverageSegment[], from: IsoDate, to: IsoDate): BarPart[] {
  const total = diffDays(from, to) + 1;
  const parts: Array<Omit<BarPart, 'share'>> = [];
  let cursor = from;
  const ordered = [...segments].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  for (const segment of ordered) {
    if (cursor > to || segment.from > to) break;
    if (segment.to < cursor) continue;
    const start = segment.from > cursor ? segment.from : cursor;
    if (start > cursor) parts.push({ state: 'none', from: cursor, to: addDays(start, -1) });
    const end = segment.to < to ? segment.to : to;
    parts.push({ state: segment.state, from: start, to: end });
    cursor = addDays(end, 1);
  }
  if (cursor <= to) parts.push({ state: 'none', from: cursor, to });
  return parts.map((part) => ({ ...part, share: (diffDays(part.from, part.to) + 1) / total }));
}

const PROBLEMS: Record<FileProblem, string> = {
  duplicate: 'Duplicate',
  overlapping: 'Overlapping',
  'improper-name': 'Improper name',
  'wrong-folder': 'Wrong folder',
};

export interface FileRow {
  path: string;
  name: string;
  bankName: string;
  accountName: string;
  from?: IsoDate;
  to?: IsoDate;
  rows: number;
  status: string[];
  issues: string[];
}

export function fileRows(ledger: Ledger): FileRow[] {
  const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));
  return ledger.files.map((file) => {
    const status =
      file.status === 'unreadable'
        ? ['Unreadable']
        : file.status === 'unassigned'
          ? ['No account']
          : file.problems.map((problem) => PROBLEMS[problem]);
    const row: FileRow = {
      path: file.path,
      name: file.path.slice(file.path.lastIndexOf('/') + 1),
      bankName: file.bank ? (findBank(file.bank)?.name ?? file.bank) : '',
      accountName: file.account ? (names.get(file.account) ?? file.account) : '',
      rows: file.rows,
      status: status.length > 0 ? status : ['OK'],
      issues: file.issues.map((issue) => issue.message),
    };
    if (file.period) {
      row.from = file.period.from;
      row.to = file.period.to;
    }
    return row;
  });
}

export interface TransactionFilter {
  search?: string;
  account?: string;
  kind?: string;
  category?: string;
  from?: IsoDate;
  to?: IsoDate;
}

export function filterTransactions(
  rows: TransactionRow[],
  filter: TransactionFilter,
): TransactionRow[] {
  const search = filter.search?.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!filter.account || row.accountId === filter.account) &&
      (!filter.kind || row.kind === filter.kind) &&
      (!filter.category || row.category === filter.category) &&
      (!filter.from || row.date >= filter.from) &&
      (!filter.to || row.date <= filter.to) &&
      (!search ||
        [row.description, row.accountName, row.category, row.transferWith ?? ''].some((text) =>
          text.toLowerCase().includes(search),
        )),
  );
}

export interface DepositRow {
  account: Account;
  balance: number;
  principal?: number;
  start?: IsoDate;
  maturity?: IsoDate;
  rate?: number;
  daysLeft?: number;
}

export function depositRows(ledger: Ledger): DepositRow[] {
  return ledger.accounts
    .filter((account) => account.type === 'fixed-deposit')
    .map((account) => {
      const placed = ledger.depositMoves
        .filter((move) => move.account === account.id && move.amount > 0)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
      const row: DepositRow = {
        account,
        balance: balanceOn(ledger, account.id, ledger.today) ?? 0,
      };
      const principal = account.deposit?.principal ?? placed?.amount;
      if (principal !== undefined) row.principal = principal;
      const start = account.deposit?.start ?? placed?.date;
      if (start) row.start = start;
      const maturity = maturityOf(account.deposit);
      if (maturity) {
        row.maturity = maturity;
        row.daysLeft = Math.max(0, diffDays(ledger.today, maturity));
      }
      if (account.deposit?.rate !== undefined) row.rate = account.deposit.rate;
      return row;
    });
}
