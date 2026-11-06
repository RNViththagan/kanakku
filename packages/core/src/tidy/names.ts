import type { Period } from '../banks/types';
import type { Account } from '../config/schema';
import { parseYmd } from '../model/dates';
import type { AccountType, CurrencyCode, IsoDate } from '../model/types';

const TYPE_LABELS: Record<AccountType, string> = {
  savings: 'Savings',
  current: 'Current',
  'credit-card': 'CreditCard',
  'fixed-deposit': 'FixedDeposit',
};

const TIDY =
  /^([A-Za-z][A-Za-z0-9]*)_([^_]+)(?:_([A-Z]{3}))?_(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})(_partial)?(?:_\d+)?\.([A-Za-z0-9]+)$/;

export interface TidyNameParts {
  bank: string;
  label: string;
  currency?: CurrencyCode;
  from: IsoDate;
  to: IsoDate;
  partial: boolean;
}

export function parseTidyName(name: string): TidyNameParts | undefined {
  const match = TIDY.exec(name);
  if (!match) return undefined;
  const [, bank = '', label = '', currency, fromText = '', toText = '', partial] = match;
  const from = parseYmd(fromText);
  const to = parseYmd(toText);
  if (!from || !to || to < from) return undefined;
  const parts: TidyNameParts = { bank, label, from, to, partial: partial !== undefined };
  if (currency) parts.currency = currency;
  return parts;
}

export function accountLabel(account: Account, accountsAtBank: Account[]): string {
  if (account.number) return account.number.replace(/[\s-]/g, '');
  const label = TYPE_LABELS[account.type];
  const shared = accountsAtBank.some(
    (other) => other.id !== account.id && !other.number && other.type === account.type,
  );
  return shared ? `${label}-${account.id}` : label;
}

export function tidyName(input: {
  bankShort: string;
  account: Account;
  accountsAtBank: Account[];
  period: Period;
  partial?: boolean;
  ext: string;
}): string {
  const { bankShort, account, accountsAtBank, period, partial, ext } = input;
  const currencies = new Set([account.currency, ...accountsAtBank.map((other) => other.currency)]);
  const currency = currencies.size > 1 ? `_${account.currency}` : '';
  const label = accountLabel(account, accountsAtBank);
  return `${bankShort}_${label}${currency}_${period.from}_to_${period.to}${partial ? '_partial' : ''}.${ext}`;
}
