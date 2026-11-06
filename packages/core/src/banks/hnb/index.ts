import type { BankPlugin } from '../types';
import { hnbAccountCsv } from './account-csv';
import { hnbWording } from './wording';

export const hnb: BankPlugin = {
  id: 'hnb',
  name: 'Hatton National Bank',
  shortName: 'HNB',
  country: 'LK',
  formats: [hnbAccountCsv],
  wording: hnbWording,
  transferFees: { LKR: ['25'] },
};
