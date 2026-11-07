import { type Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { AccountType } from '../model/types';
import { loadConfig } from './load';
import type { Config, ConfigError, UserRule } from './schema';

export interface AccountEdit {
  id: string;
  name?: string;
  bank?: string;
  type?: AccountType;
  currency?: string;
  number?: string | null;
  opened?: string | null;
  closed?: string | null;
  card?: { statementDay?: number; dueDay?: number; limit?: number | null };
  deposit?: {
    principal?: number | null;
    start?: string | null;
    months?: number | null;
    rate?: number | null;
    maturity?: string | null;
  };
}

export interface RuleEdit {
  match: string;
  kind?: 'income' | 'spending' | 'other';
  category?: string;
  direction?: 'in' | 'out';
}

export interface RuleChange {
  match?: string;
  kind?: 'income' | 'spending' | 'other' | null;
  category?: string | null;
  direction?: 'in' | 'out' | null;
}

export type ConfigEditResult = { text: string } | { errors: ConfigError[] };
export type EditResult = ConfigEditResult | { stale: true };

const BOM = '﻿';

export const ENGINE_CATEGORIES = [
  'Interest',
  'Fees',
  'Tax',
  'Cash',
  'Other income',
  'Uncategorised',
  'Refunds',
];

type Path = Array<string | number>;

function refuse(path: string, message: string): { errors: ConfigError[] } {
  return { errors: [{ path, message }] };
}

function loaded(text: string): { config?: Config; errors: ConfigError[] } {
  return loadConfig(text.startsWith(BOM) ? text.slice(BOM.length) : text);
}

function editConfig(
  text: string,
  change: (doc: Document, config: Config) => ConfigError[] | undefined,
): ConfigEditResult {
  const bom = text.startsWith(BOM);
  const body = bom ? text.slice(BOM.length) : text;
  const before = loadConfig(body);
  if (!before.config) return { errors: before.errors };
  const doc = parseDocument(body);
  const problems = change(doc, before.config);
  if (problems) return { errors: problems };
  const written = doc.toString({ lineWidth: 0 });
  const after = loadConfig(written);
  if (after.errors.length > 0) return { errors: after.errors };
  const endings = body.includes('\r\n') ? written.replace(/\r?\n/g, '\r\n') : written;
  return { text: bom ? `${BOM}${endings}` : endings };
}

function blockList(doc: Document, key: string): void {
  const list = doc.get(key);
  if (isSeq(list)) list.flow = false;
  else doc.set(key, doc.createNode([]));
}

function setOrDelete(doc: Document, path: Path, value: unknown): void {
  if (value === null) doc.deleteIn(path);
  else if (value !== undefined) doc.setIn(path, value);
}

function present<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, inner]) => inner !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`)
    .join(',')}}`;
}

function ruleAt(
  text: string,
  index: number,
  expect: UserRule,
): { errors: ConfigError[] } | { stale: true } | { rules: UserRule[] } {
  const { config, errors } = loaded(text);
  if (!config) return { errors };
  const rule = config.rules[index];
  if (!rule || canonical(rule) !== canonical(expect)) return { stale: true };
  return { rules: config.rules };
}

export function upsertAccount(text: string, account: AccountEdit): ConfigEditResult {
  return editConfig(text, (doc) => {
    const list = doc.get('accounts');
    const items = isSeq(list) ? list.items : [];
    const index = items.findIndex((item) => isMap(item) && item.get('id') === account.id);
    const { id, deposit, card, ...fields } = account;
    const hasCard = index >= 0 && isMap(doc.getIn(['accounts', index, 'card']));
    if (card && !hasCard && (card.statementDay === undefined || card.dueDay === undefined)) {
      return refuse(
        `accounts[${index < 0 ? items.length : index}].card`,
        'statementDay and dueDay are needed for a card',
      ).errors;
    }
    if (index < 0) {
      if (!fields.name || !fields.bank || !fields.type || !fields.currency) {
        return refuse('accounts', 'name, bank, type and currency are needed for a new account')
          .errors;
      }
      blockList(doc, 'accounts');
      doc.addIn(
        ['accounts'],
        doc.createNode({
          id,
          ...present(fields),
          ...(card && { card: present(card) }),
          ...(deposit && { deposit: present(deposit) }),
        }),
      );
      return undefined;
    }
    for (const [key, value] of Object.entries(fields)) {
      setOrDelete(doc, ['accounts', index, key], value);
    }
    for (const [key, value] of Object.entries(card ?? {})) {
      setOrDelete(doc, ['accounts', index, 'card', key], value);
    }
    for (const [key, value] of Object.entries(deposit ?? {})) {
      setOrDelete(doc, ['accounts', index, 'deposit', key], value);
    }
    return undefined;
  });
}

export function addRule(text: string, rule: RuleEdit): ConfigEditResult {
  const match = rule.match.trim();
  if (match.length < 3) return refuse('rules', 'the text to match needs at least 3 characters');
  return editConfig(text, (doc) => {
    blockList(doc, 'rules');
    doc.addIn(
      ['rules'],
      doc.createNode({
        match,
        direction: rule.direction,
        kind: rule.kind,
        category: rule.category,
      }),
    );
    return undefined;
  });
}

export function updateRule(
  text: string,
  index: number,
  expect: UserRule,
  change: RuleChange,
): EditResult {
  const found = ruleAt(text, index, expect);
  if (!('rules' in found)) return found;
  if (change.match !== undefined) {
    if ('regex' in expect.match) {
      return refuse(`rules[${index}].match`, 'a pattern can only be changed in config.yaml');
    }
    if (change.match.trim().length < 3) {
      return refuse(`rules[${index}].match`, 'the text to match needs at least 3 characters');
    }
  }
  return editConfig(text, (doc) => {
    if (change.match !== undefined) doc.setIn(['rules', index, 'match'], change.match.trim());
    setOrDelete(doc, ['rules', index, 'kind'], change.kind);
    setOrDelete(doc, ['rules', index, 'category'], change.category);
    setOrDelete(doc, ['rules', index, 'direction'], change.direction);
    return undefined;
  });
}

export function removeRule(text: string, index: number, expect: UserRule): EditResult {
  const found = ruleAt(text, index, expect);
  if (!('rules' in found)) return found;
  return editConfig(text, (doc) => {
    doc.deleteIn(['rules', index]);
    return undefined;
  });
}

export function moveRule(text: string, index: number, expect: UserRule, to: number): EditResult {
  const found = ruleAt(text, index, expect);
  if (!('rules' in found)) return found;
  const target = Math.min(Math.max(to, 0), found.rules.length - 1);
  if (target === index) return { text };
  return editConfig(text, (doc) => {
    const list = doc.get('rules');
    if (!isSeq(list)) return refuse('rules', 'must be a list').errors;
    const [rule] = list.items.splice(index, 1);
    list.items.splice(target, 0, rule);
    return undefined;
  });
}

export function setNames(text: string, names: string[]): ConfigEditResult {
  const kept: string[] = [];
  for (const name of names.map((item) => item.trim()).filter(Boolean)) {
    if (!kept.some((item) => item.toLowerCase() === name.toLowerCase())) kept.push(name);
  }
  if (kept.some((name) => name.length < 3)) {
    return refuse('you.names', 'each name needs at least 3 characters');
  }
  return editConfig(text, (doc) => {
    const list = doc.getIn(['you', 'names']);
    if (kept.length === 0) {
      doc.deleteIn(['you', 'names']);
      const you = doc.get('you');
      if (isMap(you) && you.items.length === 0) doc.delete('you');
    } else if (isSeq(list)) {
      list.items = kept.map((name) => doc.createNode(name));
    } else {
      doc.setIn(['you', 'names'], doc.createNode(kept));
    }
    return undefined;
  });
}

function usualLocale(locale: string): string | undefined {
  try {
    const [found] = Intl.NumberFormat.supportedLocalesOf(locale.trim());
    return found && found.toLowerCase() === locale.trim().toLowerCase() ? found : undefined;
  } catch {
    return undefined;
  }
}

export function setGeneral(
  text: string,
  change: { homeCurrency?: string; locale?: string },
): ConfigEditResult {
  const locale = change.locale === undefined ? undefined : usualLocale(change.locale);
  if (change.locale !== undefined && locale === undefined) {
    return refuse('locale', 'must be a locale like en-LK');
  }
  return editConfig(text, (doc, config) => {
    const home = change.homeCurrency;
    if (home !== undefined && home !== config.homeCurrency) {
      if (Object.keys(config.rates.manual).length > 0) {
        return refuse(
          'homeCurrency',
          `clear the manual rates first, they are in ${config.homeCurrency}`,
        ).errors;
      }
      doc.set('homeCurrency', home);
    }
    if (locale !== undefined) doc.set('locale', locale);
    return undefined;
  });
}

export function setRates(
  text: string,
  change: { manual: Record<string, string | null> },
): ConfigEditResult {
  for (const [currency, value] of Object.entries(change.manual)) {
    if (value !== null && !(/^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0)) {
      return refuse(`rates.manual.${currency}`, 'must be a rate above 0');
    }
  }
  return editConfig(text, (doc) => {
    for (const [currency, value] of Object.entries(change.manual)) {
      setOrDelete(doc, ['rates', 'manual', currency], value === null ? null : Number(value));
    }
    const manual = doc.getIn(['rates', 'manual']);
    if (isMap(manual) && manual.items.length === 0) doc.deleteIn(['rates', 'manual']);
    return undefined;
  });
}

export function addCategory(
  text: string,
  kind: 'income' | 'spending',
  name: string,
): ConfigEditResult {
  const wanted = name.trim();
  if (wanted === '') return refuse('categories', 'the name must not be empty');
  return editConfig(text, (doc, config) => {
    const { income, spending } = config.categories;
    const existing = [...income, ...spending].find(
      (item) => item.toLowerCase() === wanted.toLowerCase(),
    );
    if (existing) return refuse('categories', `${existing} is already a category`).errors;
    if (!isMap(doc.get('categories'))) {
      doc.set('categories', doc.createNode({ income: [...income], spending: [...spending] }));
    }
    doc.addIn(['categories', kind], wanted);
    return undefined;
  });
}

export function removeCategory(text: string, name: string): ConfigEditResult {
  return editConfig(text, (doc, config) => {
    if (ENGINE_CATEGORIES.includes(name)) {
      return refuse('categories', `Kanakku itself uses ${name}`).errors;
    }
    if (config.rules.some((rule) => rule.category === name)) {
      return refuse('categories', `${name} is used by a rule`).errors;
    }
    const { income, spending } = config.categories;
    const kind = income.includes(name)
      ? 'income'
      : spending.includes(name)
        ? 'spending'
        : undefined;
    if (!kind) return refuse('categories', `${name} is not a category`).errors;
    if (!isMap(doc.get('categories'))) {
      doc.set(
        'categories',
        doc.createNode({
          income: income.filter((item) => item !== name),
          spending: spending.filter((item) => item !== name),
        }),
      );
      return undefined;
    }
    const list = doc.getIn(['categories', kind]);
    const index = isSeq(list)
      ? list.items.findIndex((item) => (isScalar(item) ? item.value : item) === name)
      : -1;
    if (index >= 0) doc.deleteIn(['categories', kind, index]);
    return undefined;
  });
}
