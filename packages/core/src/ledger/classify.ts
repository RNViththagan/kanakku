import type { BankPlugin, WordingTag } from '../banks/types';
import { matchWording } from '../banks/wording';
import type { Account, Config, UserRule } from '../config/schema';
import type { Decision } from '../decisions/load';
import { decimalToMinor } from '../model/money';
import type { Kind } from '../model/types';
import type { Transaction } from './types';

type Categories = Config['categories'];
type Settled = { kind: Kind; category: string };

const WORDING_MEANINGS: Array<{ tag: WordingTag; direction?: 'in' | 'out'; meaning: Settled }> = [
  { tag: 'interest', direction: 'in', meaning: { kind: 'income', category: 'Interest' } },
  { tag: 'interest', direction: 'out', meaning: { kind: 'spending', category: 'Fees' } },
  { tag: 'deposit-interest', direction: 'in', meaning: { kind: 'income', category: 'Interest' } },
  { tag: 'tax', meaning: { kind: 'spending', category: 'Tax' } },
  { tag: 'fee', meaning: { kind: 'spending', category: 'Fees' } },
  { tag: 'cash', direction: 'out', meaning: { kind: 'spending', category: 'Cash' } },
  { tag: 'cash', direction: 'in', meaning: { kind: 'other', category: '' } },
  { tag: 'opening-deposit', meaning: { kind: 'other', category: '' } },
];

function directionOf(amount: number): 'in' | 'out' {
  return amount < 0 ? 'out' : 'in';
}

function defaultCategory(kind: Kind): string {
  if (kind === 'income') return 'Other income';
  if (kind === 'spending') return 'Uncategorised';
  return '';
}

function kindOfCategory(category: string, categories: Categories): Kind | undefined {
  if (categories.income.includes(category)) return 'income';
  if (categories.spending.includes(category)) return 'spending';
  return undefined;
}

function settle(
  transaction: Transaction,
  settled: Settled,
  decidedBy: Transaction['decidedBy'],
): Transaction {
  return {
    ...transaction,
    kind: settled.kind,
    category: settled.category,
    decidedBy,
    parts: [{ kind: settled.kind, category: settled.category, amount: transaction.amount }],
  };
}

function ruleMatches(
  rule: UserRule,
  transaction: Transaction,
  patterns: Map<UserRule, RegExp>,
): boolean {
  if (rule.account !== undefined && rule.account !== transaction.account) return false;
  if (rule.direction !== undefined && rule.direction !== directionOf(transaction.amount))
    return false;
  const size = Math.abs(transaction.amount);
  if (rule.min !== undefined && size < decimalToMinor(rule.min, transaction.currency)) return false;
  if (rule.max !== undefined && size > decimalToMinor(rule.max, transaction.currency)) return false;
  if ('text' in rule.match) {
    return transaction.description.toLowerCase().includes(rule.match.text.toLowerCase());
  }
  const pattern = patterns.get(rule) ?? new RegExp(rule.match.regex, 'i');
  patterns.set(rule, pattern);
  return pattern.test(transaction.description);
}

export function matchesRule(rule: UserRule, transaction: Transaction): boolean {
  return ruleMatches(rule, transaction, new Map());
}

function ruleMeaning(rule: UserRule, categories: Categories): Settled | undefined {
  const kind =
    rule.kind ??
    (rule.category !== undefined ? kindOfCategory(rule.category, categories) : undefined);
  if (!kind) return undefined;
  return { kind, category: rule.category ?? defaultCategory(kind) };
}

export function classify(
  txns: Transaction[],
  ctx: {
    accounts: Account[];
    banks: BankPlugin[];
    rules: UserRule[];
    decisions: Decision[];
    categories: Categories;
  },
): Transaction[] {
  const accounts = new Map(ctx.accounts.map((account) => [account.id, account]));
  const banks = new Map(ctx.banks.map((bank) => [bank.id, bank]));
  const answers = new Map<string, Settled>();
  for (const decision of ctx.decisions) {
    if (decision.type === 'set' && decision.kind !== undefined) {
      answers.set(decision.txn, {
        kind: decision.kind,
        category:
          decision.kind === 'transfer' ? '' : (decision.category ?? defaultCategory(decision.kind)),
      });
    }
  }
  const patterns = new Map<UserRule, RegExp>();

  return txns.map((original) => {
    const account = accounts.get(original.account);
    const direction = directionOf(original.amount);
    const wording = account
      ? matchWording(
          original.description,
          direction,
          account.type,
          banks.get(account.bank)?.wording ?? [],
        )
      : { tags: [] };
    const transaction: Transaction = { ...original, tags: wording.tags };
    if (wording.deposit !== undefined) transaction.deposit = wording.deposit;
    if (wording.counterparty !== undefined) transaction.counterparty = wording.counterparty;

    const answer = answers.get(transaction.id);
    if (answer) return settle(transaction, answer, 'answer');

    for (const [ruleIndex, rule] of ctx.rules.entries()) {
      if (!ruleMatches(rule, transaction, patterns)) continue;
      const meaning = ruleMeaning(rule, ctx.categories);
      if (meaning) return { ...settle(transaction, meaning, 'rule'), ruleIndex };
    }

    for (const tag of transaction.tags) {
      const found = WORDING_MEANINGS.find(
        (entry) =>
          entry.tag === tag && (entry.direction === undefined || entry.direction === direction),
      );
      if (found) return settle(transaction, found.meaning, 'wording');
    }

    if (transaction.amount === 0)
      return settle(transaction, { kind: 'other', category: '' }, 'default');
    return transaction;
  });
}

export function applyDefaults(txns: Transaction[], accounts: Account[]): Transaction[] {
  const types = new Map(accounts.map((account) => [account.id, account.type]));
  return txns.map((transaction) => {
    if (transaction.kind !== '') return transaction;
    if (transaction.amount > 0 && types.get(transaction.account) === 'credit-card') {
      return settle(transaction, { kind: 'spending', category: 'Refunds' }, 'default');
    }
    const kind: Kind = transaction.amount > 0 ? 'income' : 'spending';
    return settle(transaction, { kind, category: defaultCategory(kind) }, 'default');
  });
}

export function applyCategoryAnswers(txns: Transaction[], decisions: Decision[]): Transaction[] {
  const categories = new Map<string, string>();
  for (const decision of decisions) {
    if (decision.type === 'set' && decision.kind === undefined && decision.category !== undefined) {
      categories.set(decision.txn, decision.category);
    }
  }
  if (categories.size === 0) return txns;
  return txns.map((transaction) => {
    const category = categories.get(transaction.id);
    if (category === undefined) return transaction;
    const target = transaction.parts.findIndex((part) => part.kind !== 'transfer');
    if (target < 0) return transaction;
    const parts = transaction.parts.map((part, index) =>
      index === target ? { ...part, category } : part,
    );
    return transaction.kind === 'transfer'
      ? { ...transaction, parts }
      : { ...transaction, category, parts };
  });
}
