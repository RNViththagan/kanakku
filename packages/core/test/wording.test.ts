import { describe, expect, it } from 'vitest';
import type { WordingRule } from '../src/banks/types';
import { matchWording } from '../src/banks/wording';

const rules: WordingRule[] = [
  { tag: 'tax', pattern: /^INTEREST WITHHELD/i, direction: 'out' },
  { tag: 'interest', pattern: /^INTEREST\b/i, direction: 'in' },
  { tag: 'deposit-placement', pattern: /^TRF TO:\s*(?<deposit>\d{9,})/i, direction: 'out' },
  { tag: 'transfer-hint', pattern: /^MB:(?<counterparty>[^/]+)/i },
  { tag: 'transfer-hint', pattern: /^MB:/i },
  { tag: 'fee', pattern: /INTEREST/i, accountTypes: ['credit-card'] },
];

describe('matchWording', () => {
  it('respects the direction of a rule', () => {
    expect(matchWording('INTEREST WITHHELD', 'out', 'savings', rules).tags).toEqual(['tax']);
    expect(matchWording('INTEREST PAY SYS-GEN', 'in', 'savings', rules).tags).toEqual(['interest']);
  });

  it('returns each matching tag once, in rule order', () => {
    const result = matchWording('MB:own account', 'out', 'savings', rules);
    expect(result.tags).toEqual(['transfer-hint']);
  });

  it('respects the account types of a rule', () => {
    expect(matchWording('INTEREST CHARGE', 'out', 'credit-card', rules).tags).toEqual(['fee']);
    expect(matchWording('INTEREST CHARGE', 'out', 'savings', rules).tags).toEqual([]);
  });

  it('captures the deposit number and the counterparty', () => {
    expect(matchWording('TRF TO: 003012345678 / IBT1 / -', 'out', 'savings', rules)).toEqual({
      tags: ['deposit-placement'],
      deposit: '003012345678',
    });
    expect(matchWording('MB:Saman Perera ', 'out', 'savings', rules)).toEqual({
      tags: ['transfer-hint'],
      counterparty: 'Saman Perera',
    });
  });

  it('works with global patterns more than once', () => {
    const global: WordingRule[] = [{ tag: 'fee', pattern: /CHARGE/gi }];
    expect(matchWording('ATM CHARGE', 'out', 'savings', global).tags).toEqual(['fee']);
    expect(matchWording('ATM CHARGE', 'out', 'savings', global).tags).toEqual(['fee']);
  });
});
