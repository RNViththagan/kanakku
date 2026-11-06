import type { AccountType, CurrencyCode, IsoDate } from '../model/types';

export interface FileInput {
  path: string;
  name: string;
  text: string;
  folderBank?: string;
}

export interface Period {
  from: IsoDate;
  to: IsoDate;
}

export interface Issue {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  file?: string;
  line?: number;
  account?: string;
  date?: IsoDate;
}

export interface ParsedRow {
  line: number;
  date: IsoDate;
  description: string;
  amount: string;
  balance?: string;
  reference?: string;
  raw: string[];
}

export interface ParsedStatement {
  account: {
    number?: string;
    masked?: string;
    numberHint?: string;
    currency?: CurrencyCode;
    type?: AccountType;
  };
  period?: Period & { inferred?: boolean };
  closing?: { date: IsoDate; balance: string };
  generatedAt?: IsoDate;
  rows: ParsedRow[];
  checks?: { credits?: string; debits?: string; creditCount?: number; debitCount?: number };
  issues: Issue[];
}

export interface StatementFormat {
  id: string;
  fileTypes: string[];
  accountTypes: AccountType[];
  detect(file: FileInput): number | null;
  parse(file: FileInput): ParsedStatement;
}

export type WordingTag =
  | 'interest'
  | 'tax'
  | 'fee'
  | 'cash'
  | 'purchase'
  | 'opening-deposit'
  | 'card-payment'
  | 'transfer-hint'
  | 'deposit-placement'
  | 'deposit-return'
  | 'deposit-interest'
  | 'deposit-closure';

export interface WordingRule {
  tag: WordingTag;
  pattern: RegExp;
  direction?: 'in' | 'out';
  accountTypes?: AccountType[];
}

export interface BankPlugin {
  id: string;
  name: string;
  shortName: string;
  country?: string;
  formats: StatementFormat[];
  wording: WordingRule[];
  transferFees?: Partial<Record<CurrencyCode, string[]>>;
}
