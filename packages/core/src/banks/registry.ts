import type { BankPlugin } from './types';

export const bankPlugins: BankPlugin[] = [];

export function findBank(id: string): BankPlugin | undefined {
  return bankPlugins.find((plugin) => plugin.id === id);
}
