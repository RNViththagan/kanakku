import { boc } from './boc';
import type { BankPlugin } from './types';

export const bankPlugins: BankPlugin[] = [boc];

export function findBank(id: string): BankPlugin | undefined {
  return bankPlugins.find((plugin) => plugin.id === id);
}
