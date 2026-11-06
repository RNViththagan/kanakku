import type { BankPlugin } from '../types';
import { bocAccountCsv } from './account-csv';
import { bocWording } from './wording';

export const boc: BankPlugin = {
  id: 'boc',
  name: 'Bank of Ceylon',
  shortName: 'BOC',
  country: 'LK',
  formats: [bocAccountCsv],
  wording: bocWording,
};
