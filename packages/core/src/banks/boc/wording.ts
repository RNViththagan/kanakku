import type { WordingRule } from '../types';

export const bocWording: WordingRule[] = [
  { tag: 'tax', pattern: /^INTEREST WITHHELD/i, direction: 'out' },
  { tag: 'interest', pattern: /^INTEREST\b/i, direction: 'in' },
  { tag: 'fee', pattern: /\bCHARGES?\b/i, direction: 'out' },
  { tag: 'fee', pattern: /^SMS ALERT/i, direction: 'out' },
  { tag: 'cash', pattern: /^ATMCASHWDL/i, direction: 'out' },
  { tag: 'cash', pattern: /^SAVINGS DEPOSIT/i, direction: 'in' },
  { tag: 'purchase', pattern: /^(POS|ECOMMERCE)\s/i, direction: 'out' },
  { tag: 'opening-deposit', pattern: /^Initial Deposit/i, direction: 'in' },
  { tag: 'transfer-hint', pattern: /^CEFT/i },
];
