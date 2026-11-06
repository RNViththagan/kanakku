import { boc } from './boc';
import { combank } from './combank';
import { hnb } from './hnb';
import type { BankPlugin } from './types';

export const bankPlugins: BankPlugin[] = [boc, combank, hnb];

export function findBank(id: string): BankPlugin | undefined {
  return bankPlugins.find((plugin) => plugin.id === id);
}
