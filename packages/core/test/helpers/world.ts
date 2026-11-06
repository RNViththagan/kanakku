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
