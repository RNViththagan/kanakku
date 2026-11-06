import type { AccountType } from '../model/types';
import type { WordingRule, WordingTag } from './types';

export interface WordingMatch {
  tags: WordingTag[];
  deposit?: string;
  counterparty?: string;
}

export function matchWording(
  description: string,
  direction: 'in' | 'out',
  accountType: AccountType,
  rules: WordingRule[],
): WordingMatch {
  const result: WordingMatch = { tags: [] };
  for (const rule of rules) {
    if (rule.direction && rule.direction !== direction) continue;
    if (rule.accountTypes && !rule.accountTypes.includes(accountType)) continue;
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(description);
    if (!match) continue;
    if (!result.tags.includes(rule.tag)) result.tags.push(rule.tag);
    const deposit = match.groups?.deposit?.trim();
    if (deposit && result.deposit === undefined) result.deposit = deposit;
    const counterparty = match.groups?.counterparty?.trim();
    if (counterparty && result.counterparty === undefined) result.counterparty = counterparty;
  }
  return result;
}
