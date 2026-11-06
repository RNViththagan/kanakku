import type { WordingRule } from '../types';

export const combankWording: WordingRule[] = [
  { tag: 'tax', pattern: /^ADVANCE INCOME TAX/i, direction: 'out' },
  { tag: 'interest', pattern: /^INTEREST\b(?!\s+from\s+eFD)/i, direction: 'in' },
  { tag: 'fee', pattern: /\bCHGS\b|\bCHARGES?\b/i, direction: 'out' },
  { tag: 'deposit-placement', pattern: /^TRF TO:\s*(?<deposit>\d{9,})/i, direction: 'out' },
  { tag: 'deposit-return', pattern: /^IB Time Redemption Deposit/i, direction: 'in' },
  { tag: 'deposit-return', pattern: /^Principal from eFD:?\s*(?<deposit>\d+)?/i, direction: 'in' },
  { tag: 'deposit-interest', pattern: /^Interest from eFD:?\s*(?<deposit>\d+)?/i, direction: 'in' },
  { tag: 'opening-deposit', pattern: /^INITIAL DEP/i, direction: 'in' },
  {
    tag: 'transfer-hint',
    pattern: /^(?!.*\bCHGS\b).*(\bCEFT\b|\bCEFLKU|\/\s*EF\s+\d{8}\b)/i,
  },
  {
    tag: 'card-payment',
    pattern: /\bPAYMENT\b|\bPYMT\b/i,
    direction: 'in',
    accountTypes: ['credit-card'],
  },
  {
    tag: 'card-payment',
    pattern: /\bCREDIT CARD\b|\bCC PAYMENT\b|\bCARD PAYMENT\b/i,
    direction: 'out',
    accountTypes: ['savings', 'current'],
  },
];
