import type { Issue } from '../banks/types';
import type { Config } from '../config/schema';
import { hnbRates } from './hnb';
import { numbersLkRates } from './numbers-lk';
import type { RateSource } from './types';

export { RateSourceError } from './types';

const offline = (id: string, name: string): RateSource => ({
  id,
  name,
  quoteCurrency: '',
  currencies: 'any',
  requests: () => [],
  parse: () => [],
});

export const rateSources: RateSource[] = [
  hnbRates,
  numbersLkRates,
  offline('manual', 'Rates you type in'),
  offline('off', 'No online rates'),
];

export function findRateSource(id: string): RateSource | undefined {
  return rateSources.find((source) => source.id === id);
}

export function checkRateSource(config: Config): Issue | undefined {
  const source = findRateSource(config.rates.source);
  if (!source) {
    return {
      level: 'error',
      code: 'unknown-rate-source',
      message: `Unknown rate source '${config.rates.source}'. Use ${rateSources.map((item) => item.id).join(', ')}.`,
    };
  }
  if (source.quoteCurrency !== '' && source.quoteCurrency !== config.homeCurrency) {
    return {
      level: 'warning',
      code: 'rate-source-currency',
      message: `${source.name} quotes rates in ${source.quoteCurrency}, but your home currency is ${config.homeCurrency}.`,
    };
  }
  return undefined;
}
