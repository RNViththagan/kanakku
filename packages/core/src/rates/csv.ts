import { parseYmd } from '../model/dates';
import { normalizeAmount } from '../model/money';
import type { CurrencyCode } from '../model/types';
import { parseCsv } from '../parse/csv';
import type { RateQuote } from './types';

const HEADER = 'date,buying,selling,source';

export function parseRatesCsv(text: string, currency: CurrencyCode): RateQuote[] {
  const quotes: RateQuote[] = [];
  for (const cells of parseCsv(text)) {
    const [dateCell = '', buyingCell = '', sellingCell = '', source = ''] = cells.map((cell) =>
      cell.trim(),
    );
    const date = parseYmd(dateCell);
    const buying = normalizeAmount(buyingCell);
    if (!date || buying === undefined || source === '') continue;
    const quote: RateQuote = { currency, date, buying, source };
    const selling = normalizeAmount(sellingCell);
    if (selling !== undefined) quote.selling = selling;
    quotes.push(quote);
  }
  return quotes.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.source < b.source ? -1 : 1,
  );
}

export function serializeRatesCsv(quotes: RateQuote[]): string {
  const rows = [...quotes]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source < b.source ? -1 : 1))
    .map((quote) => [quote.date, quote.buying, quote.selling ?? '', quote.source].join(','));
  return `${[HEADER, ...rows].join('\n')}\n`;
}
