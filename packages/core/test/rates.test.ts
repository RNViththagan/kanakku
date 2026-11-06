import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Config } from '../src/config/schema';
import { checkRateSource, findRateSource, RateSourceError } from '../src/rates/registry';
import { worldConfig } from './helpers/world';

const sample = (name: string) =>
  readFileSync(new URL(`./fixtures/rates/${name}`, import.meta.url), 'utf8');
const source = (id: string) => {
  const found = findRateSource(id);
  if (!found) throw new Error(`missing source ${id}`);
  return found;
};

describe('HNB rates', () => {
  it('asks for the rates and their date', () => {
    expect(source('hnb').requests({})).toEqual([
      'https://venus.hnb.lk/api/get_exchange_rates_contents_web',
      'https://venus.hnb.lk/api/get_exchange_rate_last_update_date_contents',
    ]);
  });

  it('reads buying and selling rates for each currency', () => {
    const quotes = source('hnb').parse([sample('hnb-rates.json'), sample('hnb-date.json')], {});
    expect(quotes).toContainEqual({
      currency: 'USD',
      date: '2026-11-06',
      buying: '328.75',
      selling: '336',
      source: 'hnb',
    });
    expect(quotes.find((quote) => quote.currency === 'GBP')?.buying).toBe('440.9434');
    expect(quotes).toHaveLength(3);
  });

  it('fails clearly without a date', () => {
    expect(() => source('hnb').parse([sample('hnb-rates.json'), '[]'], {})).toThrow(
      RateSourceError,
    );
  });
});

describe('numbers.lk rates', () => {
  it("reads the chosen bank's row with its own date", () => {
    expect(source('numbers-lk').parse([sample('numbers-lk.html')], { bank: 'HNB' })).toEqual([
      {
        currency: 'USD',
        date: '2026-11-05',
        buying: '328.7500',
        selling: '336.0000',
        source: 'numbers-lk:HNB',
      },
    ]);
  });

  it('handles a missing selling rate and encoded names', () => {
    const [quote] = source('numbers-lk').parse([sample('numbers-lk.html')], { bank: "People's" });
    expect(quote).toEqual({
      currency: 'USD',
      date: '2026-11-06',
      buying: '328.6900',
      source: "numbers-lk:People's",
    });
  });

  it('fails clearly for an unknown bank or a changed page', () => {
    expect(() =>
      source('numbers-lk').parse([sample('numbers-lk.html')], { bank: 'Nowhere' }),
    ).toThrow(RateSourceError);
    expect(() => source('numbers-lk').parse(['<html>changed</html>'], { bank: 'HNB' })).toThrow(
      'table not found',
    );
  });
});

describe('checkRateSource', () => {
  const config = worldConfig();
  const withRates = (homeCurrency: string, source: string): Config => ({
    ...config,
    homeCurrency,
    rates: { ...config.rates, source },
  });

  it('accepts a source that quotes in the home currency', () => {
    expect(checkRateSource(withRates('LKR', 'hnb'))).toBeUndefined();
    expect(checkRateSource(withRates('USD', 'manual'))).toBeUndefined();
  });

  it('flags a source for another home currency, or an unknown one', () => {
    expect(checkRateSource(withRates('USD', 'hnb'))?.code).toBe('rate-source-currency');
    expect(checkRateSource(withRates('LKR', 'nowhere'))?.code).toBe('unknown-rate-source');
  });
});
