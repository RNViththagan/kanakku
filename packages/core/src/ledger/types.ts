import type { BankPlugin, FileInput, Issue, Period, WordingTag } from '../banks/types';
import type { Account, Config } from '../config/schema';
import type { Decision } from '../decisions/load';
import type { CurrencyCode, IsoDate, Kind } from '../model/types';
import type { RateQuote } from '../rates/types';
import type { CardCycle } from './cards';
import type { AccountCoverage } from './coverage';
import type { DepositMove, NeedDraft } from './deposits';
import type { Conversion } from './valuation';

export interface Part {
  kind: Kind;
  category: string;
  amount: number;
}

export interface Transaction {
  id: string;
  account: string;
  date: IsoDate;
  amount: number;
  currency: CurrencyCode;
  balance?: number;
  description: string;
  reference?: string;
  counterparty?: string;
  sources: Array<{ file: string; line: number }>;
  kind: Kind | '';
  category: string;
  tags: WordingTag[];
  deposit?: string;
  decidedBy?: 'answer' | 'rule' | 'wording' | 'match' | 'default';
  parts: Part[];
  transfer?: string;
  flag?: 'waiting' | 'possible' | 'ambiguous';
}

export interface ChainBreak {
  account: string;
  before: { date: IsoDate; file: string; balance: number };
  after: { date: IsoDate; file: string; amount: number; balance: number };
}

export interface Transfer {
  id: string;
  out?: string;
  in?: string;
  from: string;
  to: string;
  date: IsoDate;
  amountOut: number;
  currencyOut: CurrencyCode;
  amountIn?: number;
  currencyIn?: CurrencyCode;
  fee: number;
  rule: 'reference' | 'exact' | 'fee' | 'answer' | 'wording' | 'deposit' | 'counterparty';
  status: 'matched' | 'confirmed' | 'one-sided';
}

export interface LedgerInput {
  files: FileInput[];
  config: Config;
  decisions: Decision[];
  rates: RateQuote[];
  today: IsoDate;
  plugins?: BankPlugin[];
}

export type FileProblem = 'duplicate' | 'overlapping' | 'improper-name' | 'wrong-folder';

export interface FileStatus {
  path: string;
  hash: string;
  bank?: string;
  format?: string;
  account?: string;
  period?: Period;
  generatedAt?: IsoDate;
  rows: number;
  status: 'ok' | 'unreadable' | 'unassigned';
  problems: FileProblem[];
  tidyName?: string;
  issues: Issue[];
}

export interface NeedsItem {
  id: string;
  type: string;
  message: string;
  severity: 'high' | 'normal' | 'low';
  refs: NeedDraft['refs'];
  data?: Record<string, unknown>;
  actions: string[];
}

export interface Ledger {
  today: IsoDate;
  homeCurrency: CurrencyCode;
  locale: string;
  accounts: Account[];
  files: FileStatus[];
  transactions: Transaction[];
  transfers: Transfer[];
  conversions: Conversion[];
  coverage: Record<string, AccountCoverage>;
  cards: Record<string, CardCycle[]>;
  closings: Record<string, Array<{ date: IsoDate; balance: number }>>;
  depositMoves: DepositMove[];
  needs: NeedsItem[];
  issues: Issue[];
  rates: { source: string; stored: RateQuote[]; manual: Record<CurrencyCode, string> };
  unusedDecisions: string[];
}
