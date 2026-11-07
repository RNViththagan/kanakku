import {
  type Account,
  addDays,
  balanceOn,
  type CoverageSegment,
  type CurrencyCode,
  currentLife,
  type DateRange,
  diffDays,
  type FileProblem,
  findBank,
  type IsoDate,
  type Ledger,
  maturityOf,
  minorUnits,
  numberKey,
  type RateUse,
  rateBookFor,
  type Transfer,
  transferMatrix,
} from '@kanakku/core';
import { money } from './format';
import type { TransactionRow } from './model';

export const UNKNOWN_ACCOUNT = 'Unknown';

export type TransferStatus = Transfer['status'] | 'waiting' | 'possible' | 'ambiguous';
export type TransferTab = 'needs' | 'waiting' | 'all' | 'deposits';

export interface TransferSide {
  id: string;
  accountId: string;
  accountName: string;
  date: IsoDate;
  description: string;
  amount: number;
  currency: CurrencyCode;
}

export interface TransferRow {
  id: string;
  date: IsoDate;
  pair: string;
  pairLabel: string;
  rule?: Transfer['rule'];
  sides: TransferSide[];
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

function nodeName(accounts: Map<string, Account>, key: string): string {
  if (!key) return UNKNOWN_ACCOUNT;
  if (key.startsWith('deposits:')) {
    const bank = key.slice('deposits:'.length);
    return `${findBank(bank)?.shortName ?? bank} fixed deposits`;
  }
  return accounts.get(key)?.name ?? key;
}

export function pairLabel(ledger: Ledger, key: string): string {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  const [from = '', to = ''] = key.split('|');
  return `${nodeName(accounts, from)} to ${nodeName(accounts, to)}`;
}

function pairNode(accounts: Map<string, Account>, id: string): [string, string] {
  const account = accounts.get(id);
  if (account?.type !== 'fixed-deposit') return [id, account?.name ?? id];
  const bank = findBank(account.bank)?.shortName ?? account.bank;
  return [`deposits:${account.bank}`, `${bank} fixed deposits`];
}

export function transferRows(ledger: Ledger, range: DateRange): TransferRow[] {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  const name = (id: string) => accounts.get(id)?.name ?? id;
  const node = (id: string) => pairNode(accounts, id)[0];
  const transactions = new Map(ledger.transactions.map((row) => [row.id, row]));
  const side = (id: string | undefined): TransferSide[] => {
    const row = id ? transactions.get(id) : undefined;
    if (!row) return [];
    return [
      {
        id: row.id,
        accountId: row.account,
        accountName: name(row.account),
        date: row.date,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
      },
    ];
  };
  const isDeposit = (id: string) => accounts.get(id)?.type === 'fixed-deposit';
  const inRange = (date: IsoDate) => date >= range.from && date <= range.to;
  const rows: TransferRow[] = [];
  for (const transfer of ledger.transfers) {
    if (!inRange(transfer.date)) continue;
    const row: TransferRow = {
      id: transfer.id,
      date: transfer.date,
      pair: `${node(transfer.from)}|${node(transfer.to)}`,
      pairLabel: `${nodeName(accounts, node(transfer.from))} to ${nodeName(accounts, node(transfer.to))}`,
      rule: transfer.rule,
      sides: [...side(transfer.out), ...side(transfer.in)],
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
      pair: out ? `${node(transaction.account)}|` : `|${node(transaction.account)}`,
      pairLabel: out
        ? `${nodeName(accounts, node(transaction.account))} to ${UNKNOWN_ACCOUNT}`
        : `${UNKNOWN_ACCOUNT} to ${nodeName(accounts, node(transaction.account))}`,
      sides: side(transaction.id),
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

export function searchTransfers(rows: TransferRow[], search: string): TransferRow[] {
  const text = search.trim().toLowerCase();
  if (!text) return rows;
  return rows.filter((row) =>
    [row.fromName, row.toName, row.pairLabel, ...row.sides.map((side) => side.description)].some(
      (value) => value.toLowerCase().includes(text),
    ),
  );
}

export function neededTransfers(ledger: Ledger): Set<string> {
  return new Set(
    ledger.needs
      .filter((need) => need.type === 'possible-transfer' || need.type === 'ambiguous-transfer')
      .flatMap((need) => need.refs.txns ?? []),
  );
}

export function isOpenTransfer(row: TransferRow): boolean {
  return row.status === 'possible' || row.status === 'ambiguous';
}

export function transfersOnTab(
  rows: TransferRow[],
  tab: TransferTab,
  needed?: ReadonlySet<string>,
): TransferRow[] {
  switch (tab) {
    case 'needs':
      return rows.filter((row) => isOpenTransfer(row) && (!needed || needed.has(row.id)));
    case 'waiting':
      return rows.filter((row) => row.status === 'waiting');
    case 'deposits':
      return rows.filter((row) => row.deposit);
    case 'all':
      return rows;
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
  const node = (id: string) => pairNode(accounts, id);
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
  origin?: string;
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
      (!filter.category ||
        (filter.origin
          ? row.parts.some(
              (part) => part.kind === filter.origin && part.category === filter.category,
            )
          : row.category === filter.category ||
            row.parts.some((part) => part.category === filter.category))) &&
      (!filter.from || row.date >= filter.from) &&
      (!filter.to || row.date <= filter.to) &&
      (!search ||
        [
          row.description,
          row.accountName,
          row.category,
          row.transferWith ?? '',
          ...row.parts.map((part) => part.category),
        ].some((text) => text.toLowerCase().includes(search))),
  );
}

export function categoryLabel(row: TransactionRow, locale: string): string {
  if (row.category) return row.category;
  return row.parts
    .filter((part) => part.kind === 'income' || part.kind === 'spending')
    .map((part) => `${part.category} ${money(Math.abs(part.amount), row.currency, locale)}`)
    .join(', ');
}

export function categoryOptions(rows: TransactionRow[]): string[] {
  const names = new Set(
    rows.flatMap((row) => [row.category, ...row.parts.map((part) => part.category)]),
  );
  names.delete('');
  return [...names].sort();
}

export interface DepositRow {
  account: Account;
  status: 'active' | 'withdrawn';
  balance: number;
  interest: number;
  principal?: number;
  start?: IsoDate;
  maturity?: IsoDate;
  rate?: number;
  daysLeft?: number;
  closed?: IsoDate;
  returned?: number;
  held?: number;
  yearlyRate?: number;
  ended?: 'matured' | 'early';
  months?: number;
  earliest?: IsoDate;
  replaced?: Account[];
  replacedBy?: Account[];
  placed: boolean;
}

const STANDARD_TERMS = [1, 3, 6, 12, 24, 36, 48, 60];

function paidOn(due: IsoDate): IsoDate {
  const weekday = new Date(`${due}T00:00:00Z`).getUTCDay();
  return weekday === 6 ? addDays(due, 2) : weekday === 0 ? addDays(due, 1) : due;
}

export function earliestMaturity(start: IsoDate, seen: IsoDate): IsoDate | undefined {
  return STANDARD_TERMS.map((months) => maturityOf({ start, months })).find(
    (due) => due !== undefined && paidOn(due) > seen,
  );
}

function depositInterest(ledger: Ledger): Map<string, number> {
  const deposits = ledger.accounts.filter((account) => account.type === 'fixed-deposit');
  const ids = new Set(deposits.map((account) => account.id));
  const currencies = new Map(deposits.map((account) => [account.id, account.currency]));
  const byNumber = new Map<string, string>();
  for (const account of deposits) {
    if (account.number) byNumber.set(numberKey(account.number), account.id);
  }
  const linked = new Map<string, string>();
  for (const transfer of ledger.transfers) {
    const deposit = ids.has(transfer.from)
      ? transfer.from
      : ids.has(transfer.to)
        ? transfer.to
        : '';
    if (!deposit) continue;
    for (const id of [transfer.out, transfer.in]) if (id) linked.set(id, deposit);
  }
  const totals = new Map<string, number>();
  for (const row of ledger.transactions) {
    const deposit =
      linked.get(row.id) ?? (row.deposit ? byNumber.get(numberKey(row.deposit)) : undefined);
    if (!deposit || row.currency !== currencies.get(deposit)) continue;
    const earned = row.parts
      .filter((part) => part.kind === 'income')
      .reduce((sum, part) => sum + part.amount, 0);
    if (earned !== 0) totals.set(deposit, (totals.get(deposit) ?? 0) + earned);
  }
  return totals;
}

export function depositRows(ledger: Ledger): DepositRow[] {
  const interest = depositInterest(ledger);
  const byId = new Map(ledger.accounts.map((account) => [account.id, account]));
  const resolve = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  return ledger.accounts
    .filter((account) => account.type === 'fixed-deposit')
    .map((account) => {
      const endings = ledger.depositEndings.filter((item) => item.account === account.id);
      const ending = endings.at(-1);
      const moves = ledger.depositMoves
        .filter((move) => move.account === account.id)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const life = currentLife(ledger.depositMoves, account.id);
      const out = moves.filter((move) => move.amount < 0);
      const balance = balanceOn(ledger, account.id, ledger.today) ?? 0;
      const withdrawn =
        (account.closed !== undefined && account.closed <= ledger.today) ||
        (balance === 0 && out.length > 0);
      const row: DepositRow = {
        account,
        status: withdrawn ? 'withdrawn' : 'active',
        balance,
        interest: interest.get(account.id) ?? 0,
        placed: ledger.transfers.some(
          (transfer) => transfer.rule === 'deposit' && transfer.to === account.id,
        ),
      };
      const principal = account.deposit?.principal ?? life.principal;
      if (principal !== undefined) row.principal = principal;
      const start = account.deposit?.start ?? life.start;
      if (start) row.start = start;
      const months = withdrawn
        ? ending?.how === 'matured'
          ? ending.months
          : undefined
        : account.deposit?.months;
      if (months) row.months = months;
      const maturity = maturityOf(account.deposit && { ...account.deposit, start });
      if (maturity) row.maturity = maturity;
      if (maturity && !withdrawn) row.daysLeft = Math.max(0, diffDays(ledger.today, maturity));
      if (account.deposit?.rate !== undefined) row.rate = account.deposit.rate;
      const replaced = resolve(
        ledger.depositEndings
          .filter((item) => item.replacedBy.includes(account.id))
          .map((item) => item.account),
      );
      if (replaced.length > 0) row.replaced = replaced;
      const replacedBy = resolve(endings.flatMap((item) => item.replacedBy));
      if (replacedBy.length > 0) row.replacedBy = replacedBy;
      if (!withdrawn && !maturity && start) {
        const source = ledger.transfers.find(
          (transfer) => transfer.rule === 'deposit' && transfer.to === account.id,
        )?.from;
        const seen = source ? ledger.coverage[source]?.lastCovered : undefined;
        const earliest = seen ? earliestMaturity(start, seen) : undefined;
        if (earliest) row.earliest = earliest;
      }
      if (withdrawn) {
        const closed = out.at(-1)?.date ?? account.closed;
        if (closed) row.closed = closed;
        if (ending && ending.how !== 'unknown') row.ended = ending.how;
        if (out.length > 0) row.returned = -out.reduce((sum, move) => sum + move.amount, 0);
        const held = start && closed ? diffDays(start, closed) : -1;
        if (held >= 0) row.held = held;
        const due = row.ended === 'matured' ? ending?.due : undefined;
        const days = due && start ? diffDays(start, due) : held;
        const paidOut = row.returned !== undefined || row.interest > 0;
        if (days > 0 && principal && paidOut) {
          row.yearlyRate = (row.interest / principal) * (365 / days) * 100;
        }
      }
      return row;
    });
}
