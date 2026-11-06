import { parseDayMonthName } from '../model/dates';
import { normalizeAmount } from '../model/money';
import { type RateQuote, type RateSource, RateSourceError } from './types';

const PAGE = 'https://numbers.lk/trackers/exrates';
const MARKER = 'Telegraphic Transfer (TT)';
const BANKS = [
  'Amana',
  'BOC',
  'Cargills',
  'China',
  'Citi',
  'ComBank',
  'DFCC',
  'Deutsche',
  'HBL',
  'HNB',
  'IOB',
  'Indian',
  'MCB',
  'NDB',
  'NTB',
  'Pan Asia',
  "People's",
  'Sampath',
  'Seylan',
  'Union',
];

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#x27;': "'",
  '&#39;': "'",
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

function texts(html: string): string[] {
  return html
    .replace(/<!--.*?-->/gs, '')
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map((text) =>
      text.replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity).trim(),
    )
    .filter((text) => text !== '');
}

function rateIn(cell: string): string | undefined {
  const values = texts(cell)
    .map((text) => normalizeAmount(text))
    .filter((value): value is string => value !== undefined);
  return values.sort((a, b) => b.length - a.length)[0];
}

export const numbersLkRates: RateSource = {
  id: 'numbers-lk',
  name: 'numbers.lk (Sri Lankan banks, USD)',
  quoteCurrency: 'LKR',
  currencies: ['USD'],
  options: [{ key: 'bank', label: 'Bank', choices: BANKS }],
  requests: () => [PAGE],
  parse: ([page = ''], options) => {
    const bank = options.bank ?? 'HNB';
    const start = page.indexOf(MARKER);
    const tableStart = start < 0 ? -1 : page.indexOf('<table', start);
    const tableEnd = tableStart < 0 ? -1 : page.indexOf('</table>', tableStart);
    if (tableStart < 0 || tableEnd < 0)
      throw new RateSourceError('numbers.lk rate table not found');
    const table = page
      .slice(tableStart, tableEnd)
      .replace(/<style[^>]*>.*?<\/style>/gs, '')
      .replace(/<svg[^>]*>.*?<\/svg>/gs, '');
    const body = table.slice(Math.max(0, table.indexOf('<tbody')));
    for (const row of body.split(/<tr\b[^>]*>/).slice(1)) {
      const cells = row.split(/<td\b[^>]*>/).slice(1);
      const [name, dateText] = texts(cells[1] ?? '');
      if (name?.toLowerCase() !== bank.toLowerCase()) continue;
      const date = parseDayMonthName(dateText ?? '');
      const buying = rateIn(cells[2] ?? '');
      if (!date || buying === undefined)
        throw new RateSourceError(`numbers.lk row for ${bank} could not be read`);
      const quote: RateQuote = { currency: 'USD', date, buying, source: `numbers-lk:${bank}` };
      const selling = rateIn(cells[3] ?? '');
      if (selling !== undefined) quote.selling = selling;
      return [quote];
    }
    throw new RateSourceError(`numbers.lk has no rate for ${bank}`);
  },
};
