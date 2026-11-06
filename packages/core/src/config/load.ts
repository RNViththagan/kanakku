import { LineCounter, parseDocument } from 'yaml';
import { bankPlugins } from '../banks/registry';
import type { BankPlugin } from '../banks/types';
import { decimalToMinor, majorToMinor, normalizeAmount } from '../model/money';
import type { CurrencyCode } from '../model/types';
import { formatPath, lineOf, type Path } from '../parse/yaml-paths';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_LOCALE,
  DEFAULT_RATE_SOURCE,
  DEFAULT_WINDOW_DAYS,
} from './defaults';
import {
  type Account,
  type Config,
  type ConfigError,
  type RawConfig,
  rawConfigSchema,
  type UserRule,
} from './schema';

type RawAccount = NonNullable<RawConfig['accounts']>[number];
type RawRule = NonNullable<RawConfig['rules']>[number];

function toDecimal(value: number | string): string {
  const decimal = normalizeAmount(String(value));
  if (decimal === undefined) throw new Error(`Not an amount: ${value}`);
  return decimal;
}

function toMinor(value: number | string, currency: CurrencyCode): number {
  return typeof value === 'number'
    ? majorToMinor(value, currency)
    : decimalToMinor(toDecimal(value), currency);
}

function toAccount(raw: RawAccount): Account {
  const account: Account = {
    id: raw.id,
    name: raw.name,
    bank: raw.bank,
    type: raw.type,
    currency: raw.currency,
  };
  if (raw.number !== undefined) account.number = raw.number;
  if (raw.opened !== undefined) account.opened = raw.opened;
  if (raw.closed !== undefined) account.closed = raw.closed;
  if (raw.card) {
    account.card = {
      statementDay: raw.card.statementDay,
      dueDay: raw.card.dueDay,
      openingOwed: toMinor(raw.card.openingOwed ?? 0, raw.currency),
    };
    if (raw.card.limit !== undefined) account.card.limit = toMinor(raw.card.limit, raw.currency);
  }
  if (raw.deposit) {
    const { principal, ...rest } = raw.deposit;
    account.deposit = { ...rest };
    if (principal !== undefined) account.deposit.principal = toMinor(principal, raw.currency);
  }
  return account;
}

function toRule(raw: RawRule): UserRule {
  const rule: UserRule = { match: typeof raw.match === 'string' ? { text: raw.match } : raw.match };
  if (raw.account !== undefined) rule.account = raw.account;
  if (raw.direction !== undefined) rule.direction = raw.direction;
  if (raw.min !== undefined) rule.min = toDecimal(raw.min);
  if (raw.max !== undefined) rule.max = toDecimal(raw.max);
  if (raw.kind !== undefined) rule.kind = raw.kind;
  if (raw.category !== undefined) rule.category = raw.category;
  return rule;
}

function mergeFees(
  configured: Record<CurrencyCode, Array<number | string>>,
  banks: BankPlugin[],
): Record<CurrencyCode, number[]> {
  const fees = new Map<CurrencyCode, Set<number>>();
  const add = (currency: CurrencyCode, minor: number) => {
    const set = fees.get(currency) ?? new Set<number>();
    set.add(minor);
    fees.set(currency, set);
  };
  for (const [currency, amounts] of Object.entries(configured)) {
    for (const amount of amounts) add(currency, toMinor(amount, currency));
  }
  for (const bank of banks) {
    for (const [currency, amounts] of Object.entries(bank.transferFees ?? {})) {
      for (const amount of amounts ?? []) add(currency, decimalToMinor(amount, currency));
    }
  }
  return Object.fromEntries(
    [...fees].map(([currency, set]) => [currency, [...set].sort((a, b) => a - b)]),
  );
}

function crossCheck(
  raw: RawConfig,
  banks: BankPlugin[],
  report: (path: Path, message: string) => void,
) {
  const known = new Set(banks.map((bank) => bank.id));
  const unknownBank = (id: string) =>
    `unknown bank '${id}'. Known banks: ${[...known].sort().join(', ')}`;
  raw.folders?.forEach((folder, index) => {
    if (!known.has(folder.bank)) report(['folders', index, 'bank'], unknownBank(folder.bank));
  });
  const seen = new Set<string>();
  raw.accounts?.forEach((account, index) => {
    if (!known.has(account.bank)) report(['accounts', index, 'bank'], unknownBank(account.bank));
    if (seen.has(account.id)) report(['accounts', index, 'id'], 'is used by another account');
    seen.add(account.id);
    if (account.type === 'credit-card' && !account.card) {
      report(
        ['accounts', index, 'card'],
        'credit-card accounts need card: { statementDay, dueDay }',
      );
    }
    if (account.type !== 'credit-card' && account.card) {
      report(['accounts', index, 'card'], 'only credit-card accounts have card settings');
    }
    if (account.type !== 'fixed-deposit' && account.deposit) {
      report(['accounts', index, 'deposit'], 'only fixed-deposit accounts have deposit settings');
    }
    if (account.opened && account.closed && account.closed < account.opened) {
      report(['accounts', index, 'closed'], 'is before opened');
    }
  });
  const categories = raw.categories ?? DEFAULT_CATEGORIES;
  const allCategories = new Set([...categories.income, ...categories.spending]);
  raw.rules?.forEach((rule, index) => {
    if (rule.account !== undefined && !seen.has(rule.account)) {
      report(['rules', index, 'account'], `no account has the id '${rule.account}'`);
    }
    if (rule.category !== undefined && !allCategories.has(rule.category)) {
      report(['rules', index, 'category'], `'${rule.category}' is not in your categories`);
    }
  });
}

export function loadConfig(
  text: string,
  banks: BankPlugin[] = bankPlugins,
): { config?: Config; errors: ConfigError[] } {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      errors: doc.errors.map((error) => ({
        line: lines.linePos(error.pos[0]).line,
        path: '',
        message: error.message.split('\n')[0] ?? error.message,
      })),
    };
  }
  const errors: ConfigError[] = [];
  const report = (path: Path, message: string) => {
    const line = lineOf(doc, lines, path);
    errors.push({ ...(line !== undefined && { line }), path: formatPath(path), message });
  };
  const parsed = rawConfigSchema.safeParse(doc.toJS() ?? {});
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) report([...issue.path, key], 'is not a known setting');
      } else {
        report(issue.path, issue.message);
      }
    }
    return { errors };
  }
  const raw = parsed.data;
  crossCheck(raw, banks, report);
  if (errors.length > 0) return { errors };
  const manual = Object.fromEntries(
    Object.entries(raw.rates?.manual ?? {}).map(([currency, rate]) => [currency, toDecimal(rate)]),
  );
  return {
    config: {
      version: 1,
      homeCurrency: raw.homeCurrency,
      locale: raw.locale ?? DEFAULT_LOCALE,
      folders: raw.folders ?? [],
      accounts: (raw.accounts ?? []).map(toAccount),
      you: { names: raw.you?.names ?? [] },
      transfers: {
        windowDays: raw.transfers?.windowDays ?? DEFAULT_WINDOW_DAYS,
        fees: mergeFees(raw.transfers?.fees ?? {}, banks),
      },
      rates: {
        source: raw.rates?.source ?? DEFAULT_RATE_SOURCE,
        options: raw.rates?.options ?? {},
        manual,
      },
      categories: raw.categories ?? {
        income: [...DEFAULT_CATEGORIES.income],
        spending: [...DEFAULT_CATEGORIES.spending],
      },
      rules: (raw.rules ?? []).map(toRule),
    },
    errors: [],
  };
}
