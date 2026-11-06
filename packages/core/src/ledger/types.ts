import type { WordingTag } from '../banks/types';
import type { CurrencyCode, IsoDate, Kind } from '../model/types';

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
