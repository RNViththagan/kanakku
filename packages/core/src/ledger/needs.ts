import type { Config } from '../config/schema';
import { addMonths, clampDate, diffDays } from '../model/dates';
import { hashText } from '../model/hash';
import { formatAmount } from '../model/money';
import type { IsoDate } from '../model/types';
import { balanceOn, rateBookFor } from '../views/balances';
import type { NeedDraft } from './deposits';
import type { Ledger, NeedsItem } from './types';

export const REMINDER_DAYS = 7;

const SEVERITY: Record<string, NeedsItem['severity']> = {
  'new-account': 'high',
  'pick-account': 'high',
  'missing-period': 'high',
  'broken-chain': 'high',
  'card-overdue': 'high',
  'card-due': 'normal',
  'unreadable-file': 'normal',
  'totals-mismatch': 'normal',
  'possible-transfer': 'normal',
  'ambiguous-transfer': 'normal',
  counterparty: 'normal',
  'deposit-principal': 'normal',
  'deposit-before-statements': 'normal',
  'deposit-maturity': 'normal',
  'no-rate': 'normal',
  'deposit-details': 'low',
  uncategorised: 'low',
  tidy: 'low',
};

const ACTIONS: Record<string, string[]> = {
  'new-account': ['add-account'],
  'pick-account': ['pick-account'],
  'missing-period': ['show', 'add-statement', 'ignore'],
  'broken-chain': ['show', 'add-statement', 'ignore'],
  'card-overdue': ['show-cycle'],
  'card-due': ['show-cycle'],
  'unreadable-file': ['show-file', 'ignore'],
  'totals-mismatch': ['show-file'],
  'possible-transfer': ['pick-account', 'not-transfer'],
  'ambiguous-transfer': ['choose'],
  counterparty: ['mine', 'not-mine'],
  'deposit-principal': ['add-details'],
  'deposit-before-statements': ['add-details'],
  'deposit-maturity': ['show'],
  'no-rate': ['set-rate'],
  'deposit-details': ['add-details'],
  uncategorised: ['categorise'],
  tidy: ['tidy-up'],
};

function item(draft: NeedDraft): NeedsItem {
  const need: NeedsItem = {
    id: hashText(`${draft.type}|${draft.key}`),
    type: draft.type,
    message: draft.message,
    severity: SEVERITY[draft.type] ?? 'normal',
    refs: draft.refs,
    actions: ACTIONS[draft.type] ?? [],
  };
  if (draft.data) need.data = draft.data;
  return need;
}

function maturityOf(deposit: { start?: IsoDate; months?: number; maturity?: IsoDate } | undefined) {
  if (!deposit) return undefined;
  if (deposit.maturity) return deposit.maturity;
  if (!deposit.start || !deposit.months) return undefined;
  const year = Number(deposit.start.slice(0, 4));
  const month = Number(deposit.start.slice(5, 7));
  const target = addMonths(year, month, deposit.months);
  return clampDate(target.year, target.month, Number(deposit.start.slice(8, 10)));
}

export function buildNeeds(
  ledger: Omit<Ledger, 'needs' | 'unusedDecisions'>,
  drafts: NeedDraft[],
  config: Config,
): NeedsItem[] {
  const all: NeedDraft[] = [...drafts];
  const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const money = (minor: number, currency: string) =>
    `${formatAmount(minor, currency, config.locale)} ${currency}`;
  const today = ledger.today;

  for (const file of ledger.files) {
    const fileName = file.path.split('/').at(-1) ?? file.path;
    if (file.status === 'unreadable') {
      all.push({
        type: 'unreadable-file',
        key: file.path,
        message: `${fileName} could not be read as a bank statement.`,
        refs: { file: file.path },
      });
    }
    if (file.issues.some((issue) => issue.code === 'totals-mismatch')) {
      all.push({
        type: 'totals-mismatch',
        key: file.path,
        message: `The bank's totals in ${fileName} do not match its rows.`,
        refs: { file: file.path },
      });
    }
  }

  for (const [account, coverage] of Object.entries(ledger.coverage)) {
    for (const segment of coverage.segments) {
      if (segment.state !== 'missing') continue;
      all.push({
        type: 'missing-period',
        key: `${account}|${segment.from}`,
        message: `${nameOf(account)} has no statements from ${segment.from} to ${segment.to}.`,
        refs: { account, date: segment.from },
        data: { from: segment.from, to: segment.to },
      });
    }
    for (const broken of coverage.brokenChains) {
      all.push({
        type: 'broken-chain',
        key: `${account}|${broken.before.date}|${broken.after.date}`,
        message: `${nameOf(account)}: balances do not add up between ${broken.before.date} and ${broken.after.date}.`,
        refs: { account, date: broken.after.date },
        data: { before: broken.before, after: broken.after },
      });
    }
  }

  const counterpartyRows = new Map<string, string[]>();
  for (const row of ledger.transactions) {
    if (row.flag === 'possible' || row.flag === 'ambiguous') {
      const direction = row.amount < 0 ? 'left' : 'arrived in';
      all.push({
        type: row.flag === 'possible' ? 'possible-transfer' : 'ambiguous-transfer',
        key: row.id,
        message:
          row.flag === 'possible'
            ? `${money(Math.abs(row.amount), row.currency)} ${direction} ${nameOf(row.account)} on ${row.date}. Was it a transfer to one of your accounts?`
            : `${money(Math.abs(row.amount), row.currency)} on ${row.date} fits more than one of your accounts. Which one?`,
        refs: { account: row.account, txns: [row.id], date: row.date },
      });
    }
    if (row.flag === 'possible' && row.counterparty) {
      counterpartyRows.set(row.counterparty, [
        ...(counterpartyRows.get(row.counterparty) ?? []),
        row.id,
      ]);
    }
  }
  const youNames = config.you.names.map((name) => name.toLowerCase()).filter((name) => name !== '');
  for (const [text, rows] of counterpartyRows) {
    if (rows.length < 2 && !youNames.some((name) => text.toLowerCase().includes(name))) continue;
    all.push({
      type: 'counterparty',
      key: text,
      message: `Is "${text}" one of your accounts?`,
      refs: { txns: rows },
      data: { text },
    });
  }

  const uncategorised = ledger.transactions.filter((row) =>
    row.parts.some((part) => part.kind === 'spending' && part.category === 'Uncategorised'),
  );
  if (uncategorised.length > 0) {
    all.push({
      type: 'uncategorised',
      key: 'all',
      message: `${uncategorised.length} spending rows have no category.`,
      refs: { txns: uncategorised.map((row) => row.id) },
      data: { count: uncategorised.length },
    });
  }

  for (const account of ledger.accounts) {
    if (account.type !== 'fixed-deposit' || account.closed) continue;
    const balance = balanceOn(ledger, account.id, today) ?? 0;
    if (balance <= 0) continue;
    const maturity = maturityOf(account.deposit);
    if (!maturity) {
      all.push({
        type: 'deposit-details',
        key: account.id,
        message: `Add the term or maturity date of ${account.name} to get reminders.`,
        refs: { account: account.id },
      });
    } else {
      const days = diffDays(today, maturity);
      if (days >= 0 && days <= REMINDER_DAYS) {
        all.push({
          type: 'deposit-maturity',
          key: `${account.id}|${maturity}`,
          message: `${account.name} matures on ${maturity}.`,
          refs: { account: account.id, date: maturity },
        });
      }
    }
  }

  for (const [account, cycles] of Object.entries(ledger.cards)) {
    const currency = ledger.accounts.find((candidate) => candidate.id === account)?.currency ?? '';
    for (const cycle of cycles) {
      const key = `${account}|${cycle.statementDate}`;
      const owed = money(cycle.billed - cycle.paid, currency);
      if (cycle.status === 'overdue') {
        all.push({
          type: 'card-overdue',
          key,
          message: `${nameOf(account)}: ${owed} was due on ${cycle.dueDate}.`,
          refs: { account, date: cycle.dueDate },
        });
      } else if (cycle.status === 'unpaid' || cycle.status === 'part-paid') {
        const days = diffDays(today, cycle.dueDate);
        if (days >= 0 && days <= REMINDER_DAYS) {
          all.push({
            type: 'card-due',
            key,
            message: `${nameOf(account)}: ${owed} is due on ${cycle.dueDate}.`,
            refs: { account, date: cycle.dueDate },
          });
        }
      }
    }
  }

  const rates = rateBookFor(ledger);
  const unvalued = new Set<string>();
  for (const account of ledger.accounts) {
    if (account.currency === ledger.homeCurrency || unvalued.has(account.currency)) continue;
    const balance = balanceOn(ledger, account.id, today);
    if (balance === undefined) continue;
    if (!rates.toHome(balance, account.currency, today)) unvalued.add(account.currency);
  }
  for (const currency of unvalued) {
    all.push({
      type: 'no-rate',
      key: currency,
      message: `There is no ${currency} rate yet, so ${currency} money is not counted in your totals.`,
      refs: {},
      data: { currency },
    });
  }

  const untidy = ledger.files.filter((file) =>
    file.problems.some((problem) => problem !== 'overlapping'),
  );
  if (untidy.length > 0) {
    all.push({
      type: 'tidy',
      key: 'all',
      message: `${untidy.length} statement files have improper names, sit in the wrong folder or repeat other files.`,
      refs: {},
      data: { count: untidy.length, files: untidy.map((file) => file.path) },
    });
  }

  return all.map(item);
}
