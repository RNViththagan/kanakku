import type { CurrencyCode, IsoDate } from '../model/types';

export interface RateQuote {
  currency: CurrencyCode;
  date: IsoDate;
  buying: string;
  selling?: string;
  source: string;
}
