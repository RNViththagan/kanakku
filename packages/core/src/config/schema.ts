import { z } from 'zod';
import { parseYmd } from '../model/dates';
import type { AccountType, CurrencyCode, IsoDate } from '../model/types';

export interface Account {
  id: string;
  name: string;
  bank: string;
  type: AccountType;
  currency: CurrencyCode;
  number?: string;
  opened?: IsoDate;
  closed?: IsoDate;
  card?: { statementDay: number; dueDay: number; limit?: number; openingOwed: number };
  deposit?: {
    principal?: number;
    start?: IsoDate;
    months?: number;
    rate?: number;
    maturity?: IsoDate;
  };
  discovered?: boolean;
}

export interface UserRule {
  match: { text: string } | { regex: string };
  account?: string;
  direction?: 'in' | 'out';
  min?: string;
  max?: string;
  kind?: 'income' | 'spending' | 'other';
  category?: string;
}

export interface Config {
  version: 1;
  homeCurrency: CurrencyCode;
  locale: string;
  folders: Array<{ path: string; bank: string }>;
  accounts: Account[];
  you: { names: string[] };
  transfers: { windowDays: number; fees: Record<CurrencyCode, number[]> };
  rates: { source: string; options: Record<string, string>; manual: Record<CurrencyCode, string> };
  categories: { income: string[]; spending: string[] };
  rules: UserRule[];
}

export interface ConfigError {
  line?: number;
  path: string;
  message: string;
}

const expecting = (message: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? 'is required' : message),
});

const isPattern = (value: string) => {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
};

const text = z.string(expecting('must be text'));
const currency = z
  .string(expecting('must be a 3-letter code'))
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter code');
const date = z
  .string(expecting('must be a date like 2026-01-31'))
  .refine((value) => parseYmd(value) !== undefined, 'must be a date like 2026-01-31');
const amount = z.union(
  [z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)],
  expecting('must be an amount like 1500.00'),
);
const day = z
  .number(expecting('must be a day of the month'))
  .int('must be a whole number')
  .min(1, 'must be from 1 to 31')
  .max(31, 'must be from 1 to 31');

const accountSchema = z.strictObject({
  id: text.regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'must use only letters, digits and dashes'),
  name: text.min(1, 'must not be empty'),
  bank: text,
  type: z.enum(
    ['savings', 'current', 'credit-card', 'fixed-deposit'],
    expecting('must be savings, current, credit-card or fixed-deposit'),
  ),
  currency,
  number: z.string(expecting('must be in quotes, for example "0012345678"')).optional(),
  opened: date.optional(),
  closed: date.optional(),
  card: z
    .strictObject({
      statementDay: day,
      dueDay: day,
      limit: amount.optional(),
      openingOwed: amount.optional(),
    })
    .optional(),
  deposit: z
    .strictObject({
      principal: amount.optional(),
      start: date.optional(),
      months: z.number().int('must be a whole number').positive('must be above 0').optional(),
      rate: z.number().nonnegative('must not be negative').optional(),
      maturity: date.optional(),
    })
    .optional(),
});

const ruleSchema = z.strictObject({
  match: z.union(
    [
      z.string(),
      z.strictObject({ text: z.string() }),
      z.strictObject({ regex: z.string().refine(isPattern, 'is not a valid pattern') }),
    ],
    expecting('must be text, or { regex: "..." }'),
  ),
  account: text.optional(),
  direction: z.enum(['in', 'out'], expecting('must be in or out')).optional(),
  min: amount.optional(),
  max: amount.optional(),
  kind: z
    .enum(['income', 'spending', 'other'], expecting('must be income, spending or other'))
    .optional(),
  category: text.optional(),
});

export const rawConfigSchema = z.strictObject({
  version: z.literal(1, expecting('must be 1')),
  homeCurrency: currency,
  locale: text.optional(),
  folders: z
    .array(z.strictObject({ path: text.min(1, 'must not be empty'), bank: text }))
    .optional(),
  accounts: z.array(accountSchema).optional(),
  you: z.strictObject({ names: z.array(text).optional() }).optional(),
  transfers: z
    .strictObject({
      windowDays: z
        .number()
        .int('must be a whole number')
        .min(0, 'must be from 0 to 30')
        .max(30, 'must be from 0 to 30')
        .optional(),
      fees: z.record(currency, z.array(amount)).optional(),
    })
    .optional(),
  rates: z
    .strictObject({
      source: text.optional(),
      options: z.record(z.string(), text).optional(),
      manual: z.record(currency, amount).optional(),
    })
    .optional(),
  categories: z
    .strictObject({
      income: z.array(text).min(1, 'needs at least one category'),
      spending: z.array(text).min(1, 'needs at least one category'),
    })
    .optional(),
  rules: z.array(ruleSchema).optional(),
});

export type RawConfig = z.infer<typeof rawConfigSchema>;
