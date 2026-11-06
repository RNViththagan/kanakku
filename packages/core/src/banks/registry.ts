import { boc } from './boc';
import { combank } from './combank';
import type { BankPlugin } from './types';

export const bankPlugins: BankPlugin[] = [boc, combank];

export function findBank(id: string): BankPlugin | undefined {
  return bankPlugins.find((plugin) => plugin.id === id);
}
