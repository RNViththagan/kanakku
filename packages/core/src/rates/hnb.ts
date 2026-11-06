import { parseYmd } from '../model/dates';
import { normalizeAmount } from '../model/money';
import { type RateQuote, type RateSource, RateSourceError } from './types';

const BASE = 'https://venus.hnb.lk/api';

function readJson(body: string, what: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new RateSourceError(`HNB ${what} is not valid JSON`);
  }
}

function decimal(value: unknown): string | undefined {
  return typeof value === 'number' && value > 0 ? normalizeAmount(String(value)) : undefined;
}

export const hnbRates: RateSource = {
  id: 'hnb',
  name: 'Hatton National Bank',
  quoteCurrency: 'LKR',
  currencies: 'any',
  requests: () => [
    `${BASE}/get_exchange_rates_contents_web`,
    `${BASE}/get_exchange_rate_last_update_date_contents`,
  ],
  parse: ([ratesBody = '', dateBody = '']) => {
    const rates = readJson(ratesBody, 'rates');
    const dates = readJson(dateBody, 'date');
    const date = Array.isArray(dates)
      ? parseYmd(String(dates[0]?.lastUpdatedDate ?? ''))
      : undefined;
    if (!date) throw new RateSourceError('HNB did not say which day its rates are for');
    if (!Array.isArray(rates)) throw new RateSourceError('HNB rates are not a list');
    const quotes: RateQuote[] = [];
    for (const item of rates) {
      const currency = String(item?.currencyCode ?? '');
      const buying = decimal(item?.buyingRate);
      if (!/^[A-Z]{3}$/.test(currency) || buying === undefined) continue;
      const quote: RateQuote = { currency, date, buying, source: 'hnb' };
      const selling = decimal(item?.sellingRate);
      if (selling !== undefined) quote.selling = selling;
      quotes.push(quote);
    }
    return quotes;
  },
};
