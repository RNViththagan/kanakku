import type { CurrencyCode, IsoDate } from '../model/types';

export interface RateQuote {
  currency: CurrencyCode;
  date: IsoDate;
  buying: string;
  selling?: string;
  source: string;
}

export interface RateSource {
  id: string;
  name: string;
  quoteCurrency: CurrencyCode;
  currencies: CurrencyCode[] | 'any';
  options?: Array<{ key: string; label: string; choices?: string[] }>;
  requests(options: Record<string, string>): string[];
  parse(bodies: string[], options: Record<string, string>): RateQuote[];
}

export class RateSourceError extends Error {
  override name = 'RateSourceError';
}
