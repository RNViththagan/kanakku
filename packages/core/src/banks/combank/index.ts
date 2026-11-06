import type { BankPlugin } from '../types';
import { combankAccountCsv } from './account-csv';
import { combankCardCsv } from './card-csv';
import { combankWording } from './wording';

export const combank: BankPlugin = {
  id: 'combank',
  name: 'Commercial Bank of Ceylon',
  shortName: 'ComBank',
  country: 'LK',
  formats: [combankAccountCsv, combankCardCsv],
  wording: combankWording,
};
