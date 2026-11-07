import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileInput } from '../../src/banks/types';
import { loadConfig } from '../../src/config/load';
import type { Decision } from '../../src/decisions/load';
import { buildLedger } from '../../src/ledger/build';

const root =
  process.env.KANAKKU_WORLD ?? fileURLToPath(new URL('../fixtures/ledger', import.meta.url));

export const WORLD_TODAY = '2026-02-20';

export function worldConfig() {
  const { config, errors } = loadConfig(readFileSync(join(root, 'kanakku/config.yaml'), 'utf8'));
  if (!config) throw new Error(`fixture config is invalid: ${JSON.stringify(errors)}`);
  return config;
}

export function worldFiles(): FileInput[] {
  return worldConfig().folders.flatMap((folder) =>
    readdirSync(join(root, folder.path))
      .sort()
      .map((name) => ({
        path: `${folder.path}/${name}`,
        name,
        text: readFileSync(join(root, folder.path, name), 'utf8'),
        folderBank: folder.bank,
      })),
  );
}

export function loadWorld(decisions: Decision[] = [], today = WORLD_TODAY) {
  return buildLedger({ files: worldFiles(), config: worldConfig(), decisions, rates: [], today });
}

export const MARCH_FILE: FileInput = {
  path: 'combank/transaction_history_0022222222_20260320.csv',
  name: 'transaction_history_0022222222_20260320.csv',
  folderBank: 'combank',
  text: [
    ',,,,Transaction History,,,,,,,',
    ',,,,,,,,,,e-Receipt,',
    ',Transaction Date,,Description,,Currency,Debit,Credit,Running Balance,,,',
    ',09/03/2026,,IB Time Redemption Deposit / - / -,,LKR,,"5,000.01","10,696.83",,,',
    ',05/03/2026,,TRF TO: 003077777777 / IBT0000000011 / -,,LKR,"5,000.00",,"5,696.82",,,',
    ',02/03/2026,,TRF TO: 003088888888 / IBT0000000010 / -,,LKR,"120,000.00",,"10,696.82",,,',
    ',02/03/2026,,Interest from eFD:3099999999 / - / -,,LKR,,709.32,"130,696.82",,,',
    ',02/03/2026,,Principal from eFD:3099999999 / - / -,,LKR,,"120,000.00","129,987.50",,,',
    ',,Generated at 3/20/26 10:00 AM,,,,,,, Page 1 of ,, 1',
  ].join('\n'),
};
