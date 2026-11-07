import type { Issue } from '../banks/types';
import type { Account } from '../config/schema';
import type { Decision } from '../decisions/load';
import { addMonths, clampDate, diffDays } from '../model/dates';
import { hashText } from '../model/hash';
import { decimalToMinor, minorToDecimal } from '../model/money';
import type { IsoDate } from '../model/types';
import { maskFits } from './assign';
import type { Part, Transaction, Transfer } from './types';

export interface NeedDraft {
  type: string;
  key: string;
  message: string;
  refs: { file?: string; account?: string; txns?: string[]; date?: IsoDate };
  data?: Record<string, unknown>;
}

export interface DepositMove {
  account: string;
  date: IsoDate;
  amount: number;
}

export interface DepositEnding {
  account: string;
  date: IsoDate;
  how: 'matured' | 'early' | 'unknown';
  months?: number;
  due?: IsoDate;
  replacedBy: string[];
}

export interface DepositLife {
  start?: IsoDate;
  principal?: number;
}

type Event =
  | { kind: 'seed'; date: IsoDate; account: Account; principal: number }
  | { kind: 'row'; date: IsoDate; index: number; row: Transaction };

interface Closing {
  ending: DepositEnding;
  day: string;
  principal: number;
  numbered: boolean;
}

interface Placement {
  deposit: string;
  day: string;
  amount: number;
  numbered: boolean;
}

const EVENT_TAGS = ['deposit-placement', 'deposit-return', 'deposit-closure'] as const;

const REDEMPTION_INTEREST_SHARE = 0.25;

// A maturity on a weekend or holiday is paid a few days late, or on the working day before.
const PAYOUT_WINDOW = { before: 2, after: 4 };

export function maturityOf(
  deposit: { start?: IsoDate; months?: number; maturity?: IsoDate } | undefined,
) {
  if (!deposit) return undefined;
  if (deposit.maturity) return deposit.maturity;
  if (!deposit.start || !deposit.months) return undefined;
  const year = Number(deposit.start.slice(0, 4));
  const month = Number(deposit.start.slice(5, 7));
  const target = addMonths(year, month, deposit.months);
  return clampDate(target.year, target.month, Number(deposit.start.slice(8, 10)));
}

export function numberKey(number: string): string {
  return number.replace(/[\s-]/g, '').replace(/^0+/, '');
}

function paidOnTime(due: IsoDate, paid: IsoDate): boolean {
  const late = diffDays(due, paid);
  return late >= -PAYOUT_WINDOW.before && late <= PAYOUT_WINDOW.after;
}

function wholeMonths(start: IsoDate, paid: IsoDate): number | undefined {
  for (let months = 1; months <= 120; months += 1) {
    const due = maturityOf({ start, months });
    if (!due || diffDays(due, paid) < -PAYOUT_WINDOW.before) return undefined;
    if (paidOnTime(due, paid)) return months;
  }
  return undefined;
}

export function currentLife(moves: DepositMove[], account: string): DepositLife {
  const own = moves
    .filter((move) => move.account === account)
    .sort((a, b) => (a.date === b.date ? a.amount - b.amount : a.date < b.date ? -1 : 1));
  let balance = 0;
  let life: DepositLife = {};
  for (const move of own) {
    if (move.amount > 0 && balance <= 0) life = { start: move.date, principal: move.amount };
    balance += move.amount;
  }
  return life;
}

function namesOwnAccount(row: Transaction, accounts: Account[]): boolean {
  const deposit = row.deposit;
  if (!deposit) return false;
  const bank = accounts.find((account) => account.id === row.account)?.bank;
  return accounts.some(
    (account) =>
      account.type !== 'fixed-deposit' &&
      account.bank === bank &&
      account.number !== undefined &&
      (numberKey(account.number) === numberKey(deposit) || maskFits(account.number, deposit)),
  );
}

function asTransferHint(row: Transaction): Transaction {
  const tags = row.tags.filter((tag) => !(EVENT_TAGS as readonly string[]).includes(tag));
  const hinted: Transaction = {
    ...row,
    tags: tags.includes('transfer-hint') ? tags : [...tags, 'transfer-hint'],
  };
  delete hinted.deposit;
  return hinted;
}

export function trackDeposits(
  input: Transaction[],
  ctx: { accounts: Account[]; decisions: Decision[] },
): {
  txns: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
  issues: Issue[];
  needs: NeedDraft[];
  moves: DepositMove[];
  endings: DepositEnding[];
} {
  const txns = input.map((row) =>
    row.decidedBy === undefined && namesOwnAccount(row, ctx.accounts) ? asTransferHint(row) : row,
  );
  const owners = new Map(ctx.accounts.map((account) => [account.id, account]));
  const configured = ctx.accounts.filter((account) => account.type === 'fixed-deposit');
  const answers = new Map<string, string>();
  for (const decision of ctx.decisions) {
    if (decision.type === 'fd-principal') answers.set(decision.deposit, decision.principal);
  }

  const eligible = (row: Transaction) =>
    row.transfer === undefined &&
    row.decidedBy === undefined &&
    EVENT_TAGS.some((tag) => row.tags.includes(tag));
  const bankOf = (row: Transaction) => owners.get(row.account)?.bank ?? '';
  const configFor = (bank: string, number: string) =>
    configured.find(
      (account) =>
        account.bank === bank && account.number && numberKey(account.number) === numberKey(number),
    );

  const placedConfig = new Set<string>();
  for (const row of txns) {
    if (!eligible(row) || !row.tags.includes('deposit-placement') || !row.deposit) continue;
    const found = configFor(bankOf(row), row.deposit);
    if (found) placedConfig.add(found.id);
  }

  const events: Event[] = txns
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => eligible(row))
    .map(({ row, index }) => ({ kind: 'row' as const, date: row.date, index, row }));
  for (const account of configured) {
    const { principal, start } = account.deposit ?? {};
    if (principal !== undefined && start && !placedConfig.has(account.id)) {
      events.push({ kind: 'seed', date: start, account, principal });
    }
  }
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'seed' ? -1 : 1;
    return (a.kind === 'row' ? a.index : 0) - (b.kind === 'row' ? b.index : 0);
  });

  const discovered = new Map<string, Account>();
  const outstanding = new Map<string, number>();
  const started = new Map<string, IsoDate>();
  const moves: DepositMove[] = [];
  const transfers: Transfer[] = [];
  const issues: Issue[] = [];
  const needs: NeedDraft[] = [];
  const settled = new Map<string, Transaction>();

  const move = (account: string, date: IsoDate, amount: number) => {
    if (amount === 0) return;
    moves.push({ account, date, amount });
    outstanding.set(account, (outstanding.get(account) ?? 0) + amount);
  };

  const depositFor = (row: Transaction, number: string | undefined): Account => {
    const bank = bankOf(row);
    if (number) {
      const found = configFor(bank, number);
      if (found) return found;
    }
    const key = number ? `${bank}|${numberKey(number)}` : `${bank}|${row.currency}|pool`;
    const id = number
      ? `deposit-${bank}-${numberKey(number)}`
      : `deposit-${bank}-${row.currency.toLowerCase()}-pool`;
    let account = discovered.get(key);
    if (!account) {
      account = {
        id,
        name: number ? `Deposit ${number}` : `Unnamed ${row.currency} deposits`,
        bank,
        type: 'fixed-deposit',
        currency: row.currency,
        discovered: true,
      };
      if (number) account.number = number;
      discovered.set(key, account);
    }
    return account;
  };

  const oldestWithPrincipal = (row: Transaction, amount: number): Account | undefined => {
    const bank = bankOf(row);
    const candidates = [...configured, ...discovered.values()].filter(
      (account) =>
        account.bank === bank &&
        account.currency === row.currency &&
        account.number !== undefined &&
        outstanding.get(account.id) === amount,
    );
    candidates.sort((a, b) => ((started.get(a.id) ?? '') < (started.get(b.id) ?? '') ? -1 : 1));
    return candidates[0];
  };

  const closestBelow = (row: Transaction): { deposit: Account; principal: number } | undefined => {
    const bank = bankOf(row);
    const candidates = [...configured, ...discovered.values()]
      .filter(
        (account) =>
          account.bank === bank &&
          account.currency === row.currency &&
          account.number !== undefined,
      )
      .map((account) => ({ deposit: account, principal: outstanding.get(account.id) ?? 0 }))
      .filter(
        ({ principal }) =>
          principal > 0 &&
          principal <= row.amount &&
          row.amount - principal <= principal * REDEMPTION_INTEREST_SHARE,
      );
    candidates.sort((a, b) => {
      if (a.principal !== b.principal) return b.principal - a.principal;
      return (started.get(a.deposit.id) ?? '') < (started.get(b.deposit.id) ?? '') ? -1 : 1;
    });
    return candidates[0];
  };

  const link = (
    row: Transaction,
    deposit: Account,
    outgoing: boolean,
    amount: number,
    parts: Part[],
  ) => {
    const transfer: Transfer = {
      id: hashText(`d|${row.id}`),
      from: outgoing ? row.account : deposit.id,
      to: outgoing ? deposit.id : row.account,
      date: row.date,
      amountOut: amount,
      currencyOut: row.currency,
      amountIn: amount,
      currencyIn: row.currency,
      fee: 0,
      rule: 'deposit',
      status: 'one-sided',
    };
    if (outgoing) transfer.out = row.id;
    else transfer.in = row.id;
    transfers.push(transfer);
    settled.set(row.id, {
      ...row,
      kind: 'transfer',
      category: '',
      decidedBy: 'wording',
      transfer: transfer.id,
      parts,
    });
  };

  const takeOut = (deposit: Account, row: Transaction, principal: number) => {
    const available = outstanding.get(deposit.id) ?? 0;
    move(deposit.id, row.date, -Math.min(principal, available));
    if (principal > available) {
      needs.push({
        type: 'deposit-before-statements',
        key: row.id,
        message: `${minorToDecimal(principal, row.currency)} came back from a deposit Kanakku never saw placed. Add the deposit to your config so it counts from when it started.`,
        refs: { account: deposit.id, txns: [row.id], date: row.date },
      });
    }
  };

  const endingOf = (
    row: Transaction,
    deposit: Account,
  ): Pick<DepositEnding, 'how' | 'months' | 'due'> => {
    const start = deposit.deposit?.start ?? started.get(deposit.id);
    const agreed = start && deposit.deposit ? maturityOf({ ...deposit.deposit, start }) : undefined;
    if (agreed && paidOnTime(agreed, row.date)) {
      const months = deposit.deposit?.months;
      return months ? { how: 'matured', months, due: agreed } : { how: 'matured', due: agreed };
    }
    if (row.tags.includes('deposit-early')) return { how: 'early' };
    const months = start && deposit.number ? wholeMonths(start, row.date) : undefined;
    const fitted = start && months ? maturityOf({ start, months }) : undefined;
    if (row.tags.includes('deposit-matured') || (!agreed && fitted)) {
      return months && fitted ? { how: 'matured', months, due: fitted } : { how: 'matured' };
    }
    if (agreed && diffDays(agreed, row.date) < 0) return { how: 'early' };
    return { how: 'unknown' };
  };

  const placements: Placement[] = [];
  const closings: Closing[] = [];
  const dayOf = (row: Transaction) => `${row.account}|${row.date}`;
  const recordEnding = (row: Transaction, deposit: Account, principal: number) => {
    closings.push({
      ending: { account: deposit.id, date: row.date, ...endingOf(row, deposit), replacedBy: [] },
      day: dayOf(row),
      principal,
      numbered: deposit.number !== undefined,
    });
  };

  for (const event of events) {
    if (event.kind === 'seed') {
      started.set(event.account.id, event.date);
      move(event.account.id, event.date, event.principal);
      continue;
    }
    const { row } = event;
    if (row.tags.includes('deposit-placement') && row.amount < 0) {
      const deposit = depositFor(row, row.deposit);
      const amount = -row.amount;
      if ((outstanding.get(deposit.id) ?? 0) <= 0) started.set(deposit.id, row.date);
      const configuredPrincipal = deposit.deposit?.principal;
      if (configuredPrincipal !== undefined && configuredPrincipal !== amount) {
        issues.push({
          level: 'warning',
          code: 'deposit-principal-mismatch',
          message: `Deposit ${deposit.number ?? deposit.id} was placed with ${minorToDecimal(amount, row.currency)}, not the ${minorToDecimal(configuredPrincipal, row.currency)} in your config`,
          account: deposit.id,
          date: row.date,
        });
      }
      move(deposit.id, row.date, amount);
      placements.push({
        deposit: deposit.id,
        day: dayOf(row),
        amount,
        numbered: deposit.number !== undefined,
      });
      link(row, deposit, true, amount, [{ kind: 'transfer', category: '', amount: row.amount }]);
    } else if (row.tags.includes('deposit-closure') && row.amount > 0 && row.deposit) {
      const deposit = depositFor(row, row.deposit);
      const available = outstanding.get(deposit.id) ?? 0;
      const answered = answers.get(deposit.id);
      let principal =
        available > 0
          ? available
          : answered !== undefined
            ? decimalToMinor(answered, row.currency)
            : undefined;
      if (principal === undefined) {
        needs.push({
          type: 'deposit-principal',
          key: deposit.id,
          message: `How much was placed in deposit ${deposit.number ?? deposit.id}? It closed on ${row.date} paying ${minorToDecimal(row.amount, row.currency)}.`,
          refs: { account: deposit.id, txns: [row.id], date: row.date },
        });
        principal = row.amount;
      }
      principal = Math.min(principal, row.amount);
      const interest = row.amount - principal;
      move(deposit.id, row.date, -Math.min(principal, available));
      recordEnding(row, deposit, principal);
      const parts: Part[] = [{ kind: 'transfer', category: '', amount: principal }];
      if (interest > 0) parts.push({ kind: 'income', category: 'Interest', amount: interest });
      link(row, deposit, false, principal, parts);
    } else if (
      (row.tags.includes('deposit-return') || row.tags.includes('deposit-closure')) &&
      row.amount > 0
    ) {
      const exact = row.deposit
        ? depositFor(row, row.deposit)
        : oldestWithPrincipal(row, row.amount);
      const close = exact ? undefined : closestBelow(row);
      const deposit = exact ?? close?.deposit ?? depositFor(row, undefined);
      const principal = close?.principal ?? row.amount;
      takeOut(deposit, row, principal);
      recordEnding(row, deposit, principal);
      const parts: Part[] = [{ kind: 'transfer', category: '', amount: principal }];
      if (row.amount > principal) {
        parts.push({ kind: 'income', category: 'Interest', amount: row.amount - principal });
      }
      link(row, deposit, false, principal, parts);
    }
  }

  const linkable = closings.filter((closing) => closing.numbered);
  for (const day of new Set(linkable.map((closing) => closing.day))) {
    const open = placements.filter((placement) => placement.numbered && placement.day === day);
    const unmatched: Closing[] = [];
    for (const closing of linkable.filter((item) => item.day === day)) {
      const index = open.findIndex(
        (placement) =>
          placement.deposit !== closing.ending.account && placement.amount === closing.principal,
      );
      const [placement] = index < 0 ? [] : open.splice(index, 1);
      if (placement) closing.ending.replacedBy.push(placement.deposit);
      else unmatched.push(closing);
    }
    const [lone] = unmatched;
    const [only] = open;
    if (unmatched.length === 1 && open.length === 1 && lone && only) {
      if (only.deposit !== lone.ending.account) lone.ending.replacedBy.push(only.deposit);
    }
  }

  return {
    txns: txns.map((row) => settled.get(row.id) ?? row),
    accounts: [...discovered.values()],
    transfers,
    issues,
    needs,
    moves,
    endings: closings.map((closing) => closing.ending),
  };
}
