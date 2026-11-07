import {
  type Account,
  type Decision,
  diffDays,
  type IsoDate,
  type Ledger,
  matchesRule,
  type RuleEdit,
  type Transaction,
  type UserRule,
} from '@kanakku/core';
import { money, shortDate } from './format';

const GONE = 'a transaction no longer in your statements';

function rowOf(ledger: Ledger, txnId: string): Transaction | undefined {
  return ledger.transactions.find((row) => row.id === txnId);
}

export function otherAccounts(ledger: Ledger, txnId: string): Account[] {
  const row = rowOf(ledger, txnId);
  if (!row) return [];
  return ledger.accounts.filter(
    (account) =>
      account.id !== row.account &&
      account.type !== 'fixed-deposit' &&
      (account.closed === undefined || account.closed >= row.date),
  );
}

export function transferCandidates(
  ledger: Ledger,
  txnId: string,
  accountId: string,
  days = 10,
): Transaction[] {
  const row = rowOf(ledger, txnId);
  if (!row) return [];
  const size = Math.abs(row.amount);
  const apart = (other: Transaction) => Math.abs(diffDays(row.date, other.date));
  return ledger.transactions
    .filter(
      (other) =>
        other.account === accountId &&
        other.id !== row.id &&
        other.transfer === undefined &&
        Math.sign(other.amount) === -Math.sign(row.amount) &&
        apart(other) <= days,
    )
    .sort(
      (a, b) =>
        Math.abs(Math.abs(a.amount) - size) - Math.abs(Math.abs(b.amount) - size) ||
        apart(a) - apart(b),
    )
    .slice(0, 8);
}

export function coversDate(ledger: Ledger, accountId: string, date: IsoDate): boolean {
  return (ledger.coverage[accountId]?.segments ?? []).some(
    (segment) => segment.state === 'covered' && segment.from <= date && date <= segment.to,
  );
}

function rowText(ledger: Ledger, txnId: string, locale: string): string | undefined {
  const row = rowOf(ledger, txnId);
  if (!row) return undefined;
  const description = row.description.replace(/\s+/g, ' ').trim();
  return `${description}, ${money(row.amount, row.currency, locale)} on ${shortDate(row.date, locale)},`;
}

function subject(text: string | undefined): string {
  return text ?? `${GONE.charAt(0).toUpperCase()}${GONE.slice(1)}`;
}

export function answerLabel(decision: Decision, ledger: Ledger, locale: string): string {
  const name = (id: string) => ledger.accounts.find((account) => account.id === id)?.name ?? id;
  switch (decision.type) {
    case 'pair':
      return `${subject(rowText(ledger, decision.out, locale))} and ${rowText(ledger, decision.in, locale) ?? GONE} are one transfer.`;
    case 'not-transfer':
      return decision.with === undefined
        ? `${subject(rowText(ledger, decision.txn, locale))} is not a transfer.`
        : `${subject(rowText(ledger, decision.txn, locale))} and ${rowText(ledger, decision.with, locale) ?? GONE} are not one transfer.`;
    case 'transfer': {
      const outgoing = (rowOf(ledger, decision.txn)?.amount ?? -1) < 0;
      return `${subject(rowText(ledger, decision.txn, locale))} ${outgoing ? 'went to' : 'came from'} ${name(decision.account)}.`;
    }
    case 'set': {
      const what = [decision.kind, decision.category].filter(Boolean).join(': ');
      return `${subject(rowText(ledger, decision.txn, locale))} is ${what}.`;
    }
    case 'counterparty':
      return decision.mine
        ? `"${decision.text}" is your account${decision.account ? ` ${name(decision.account)}` : ''}.`
        : `"${decision.text}" is not one of your accounts.`;
    case 'fd-principal':
      return `${name(decision.deposit)} was placed with ${decision.principal}.`;
    case 'file-account':
      return `A statement file belongs to ${name(decision.account)}.`;
    case 'dismiss':
      return 'You hid an item in Needs you.';
  }
}

export function ruleText(descriptions: string[]): string {
  const [first] = descriptions;
  if (first === undefined) return '';
  const lower = descriptions.map((description) => description.toLowerCase());
  const words = [...first.matchAll(/[^\s:/]+/g)]
    .filter((match) => /\p{L}/u.test(match[0]))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
  let best = '';
  words.forEach((from, index) => {
    for (const to of words.slice(index).reverse()) {
      const span = first.slice(from.start, to.end);
      if (span.length <= best.length) return;
      if (lower.every((description) => description.includes(span.toLowerCase()))) {
        best = span;
        return;
      }
    }
  });
  const trimmed = best.trim();
  return trimmed.length >= 3 ? trimmed : '';
}

export function transfersTaken(ledger: Ledger, rule: UserRule): number {
  return ledger.transactions.filter((row) => row.kind === 'transfer' && matchesRule(rule, row))
    .length;
}

export function ruleCount(ledger: Ledger, rule: RuleEdit): number {
  const text = rule.match.trim();
  if (text === '') return 0;
  const match: UserRule = { match: { text }, ...(rule.direction && { direction: rule.direction }) };
  return ledger.transactions.filter((row) => matchesRule(match, row)).length;
}
