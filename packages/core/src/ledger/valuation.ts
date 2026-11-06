import { diffDays } from '../model/dates';
import { hashText } from '../model/hash';
import { decimalToScaled, minorUnits } from '../model/money';
import type { CurrencyCode, IsoDate } from '../model/types';
import type { RateQuote } from '../rates/types';
import type { Transaction, Transfer } from './types';

const MICRO = 1_000_000;

export interface RateUse {
  micro: number;
  date: IsoDate;
  source: string;
}

export interface Conversion {
  id: string;
  transfer: string;
  date: IsoDate;
  from: string;
  to: string;
  amountOut: number;
  currencyOut: CurrencyCode;
  amountIn: number;
  currencyIn: CurrencyCode;
  micro: number;
  reference?: string;
}

export interface RateBook {
  rateOn(currency: CurrencyCode, date: IsoDate): RateUse | undefined;
  toHome(
    minor: number,
    currency: CurrencyCode,
    date: IsoDate,
  ): { value: number; rate?: RateUse } | undefined;
}

export function decimalToMicro(decimal: string): number {
  return decimalToScaled(decimal, 6);
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const top = numerator < 0n ? -numerator : numerator;
  const bottom = denominator < 0n ? -denominator : denominator;
  const quotient = (top * 2n + bottom) / (bottom * 2n);
  return negative ? -quotient : quotient;
}

function scale(places: number): bigint {
  return 10n ** BigInt(places);
}

export function buildConversions(
  transfers: Transfer[],
  txns: Map<string, Transaction>,
): Conversion[] {
  const conversions: Conversion[] = [];
  for (const transfer of transfers) {
    const { amountIn, currencyIn } = transfer;
    if (amountIn === undefined || currencyIn === undefined || currencyIn === transfer.currencyOut)
      continue;
    if (transfer.amountOut === 0) continue;
    const micro = divideRounded(
      BigInt(amountIn) * scale(minorUnits(transfer.currencyOut)) * BigInt(MICRO),
      BigInt(transfer.amountOut) * scale(minorUnits(currencyIn)),
    );
    const conversion: Conversion = {
      id: hashText(`c|${transfer.id}`),
      transfer: transfer.id,
      date: transfer.date,
      from: transfer.from,
      to: transfer.to,
      amountOut: transfer.amountOut,
      currencyOut: transfer.currencyOut,
      amountIn,
      currencyIn,
      micro: Number(micro),
    };
    const reference = transfer.out ? txns.get(transfer.out)?.reference : undefined;
    if (reference) conversion.reference = reference;
    conversions.push(conversion);
  }
  return conversions;
}

export function makeRateBook(ctx: {
  home: CurrencyCode;
  source: string;
  stored: RateQuote[];
  conversions: Conversion[];
  manual: Record<CurrencyCode, string>;
}): RateBook {
  const fromSource = (quote: RateQuote) =>
    quote.source === ctx.source || quote.source.startsWith(`${ctx.source}:`);
  const use = (quote: RateQuote): RateUse => ({
    micro: decimalToMicro(quote.buying),
    date: quote.date,
    source: quote.source,
  });
  const latestOnOrBefore = (quotes: RateQuote[], date: IsoDate) =>
    quotes
      .filter((quote) => quote.date <= date)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const manualRate = (currency: CurrencyCode, date: IsoDate): RateUse | undefined => {
    const value = ctx.manual[currency];
    return value === undefined
      ? undefined
      : { micro: decimalToMicro(value), date, source: 'manual' };
  };

  const rateOn = (currency: CurrencyCode, date: IsoDate): RateUse | undefined => {
    if (currency === ctx.home) return undefined;
    if (ctx.source === 'manual') {
      const manual = manualRate(currency, date);
      if (manual) return manual;
    }
    const quotes = ctx.stored.filter((quote) => quote.currency === currency);
    const selected = quotes.filter(fromSource);
    const exact = selected.find((quote) => quote.date === date);
    if (exact) return use(exact);
    const earlierSelected = latestOnOrBefore(selected, date);
    if (earlierSelected) return use(earlierSelected);
    const earlierAny = latestOnOrBefore(quotes, date);
    if (earlierAny) return use(earlierAny);
    const nearest = ctx.conversions
      .filter(
        (conversion) => conversion.currencyOut === currency && conversion.currencyIn === ctx.home,
      )
      .sort(
        (a, b) =>
          Math.abs(diffDays(date, a.date)) - Math.abs(diffDays(date, b.date)) ||
          (a.date < b.date ? -1 : 1),
      )[0];
    if (nearest) return { micro: nearest.micro, date: nearest.date, source: 'conversion' };
    return manualRate(currency, date);
  };

  const toHome = (minor: number, currency: CurrencyCode, date: IsoDate) => {
    if (currency === ctx.home) return { value: minor };
    const rate = rateOn(currency, date);
    if (!rate) return undefined;
    const homePlaces = minorUnits(ctx.home);
    const foreignPlaces = minorUnits(currency);
    const value = divideRounded(
      BigInt(minor) * BigInt(rate.micro) * scale(Math.max(0, homePlaces - foreignPlaces)),
      BigInt(MICRO) * scale(Math.max(0, foreignPlaces - homePlaces)),
    );
    return { value: Number(value), rate };
  };

  return { rateOn, toHome };
}
