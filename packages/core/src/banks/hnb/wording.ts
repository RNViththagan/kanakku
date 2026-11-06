import type { WordingRule } from '../types';

export const hnbWording: WordingRule[] = [
  { tag: 'interest', pattern: /^\d+X+\d+:Int\.Pd:/i, direction: 'in' },
  {
    tag: 'fee',
    pattern: /^Finacle Alert Charges|^MB\/IB (FEE|Bi Annual Fee)|\bCHGS\b|\bCHARGES?\b/i,
    direction: 'out',
  },
  {
    tag: 'deposit-placement',
    pattern: /^Dr\.? Tran for funding A\/c\s*(?<deposit>\d+)/i,
    direction: 'out',
  },
  { tag: 'deposit-closure', pattern: /^(?<deposit>\d+)\s*:\s*Closure Proceeds/i, direction: 'in' },
  { tag: 'transfer-hint', pattern: /^MB:(?<counterparty>.+)/i },
  { tag: 'transfer-hint', pattern: /^CEFT-(?<counterparty>.+)/i },
];
