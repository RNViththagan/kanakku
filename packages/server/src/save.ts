import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type DataFileName = 'config.yaml' | 'decisions.yaml';

export const KEEP_BACKUPS = 20;

const BACKUP_NAME = /^(config|decisions)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.yaml$/;

export function readDataFile(dataFolder: string, name: DataFileName): string {
  try {
    return readFileSync(join(dataFolder, 'kanakku', name), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

function prune(backups: string, stem: string): void {
  const ours = readdirSync(backups)
    .filter((entry) => BACKUP_NAME.test(entry) && entry.startsWith(`${stem}-`))
    .sort();
  for (const entry of ours.slice(0, Math.max(0, ours.length - KEEP_BACKUPS))) {
    rmSync(join(backups, entry), { force: true });
  }
}

export function writeDataFile(
  dataFolder: string,
  name: DataFileName,
  text: string,
  now: Date,
): void {
  const folder = join(dataFolder, 'kanakku');
  mkdirSync(folder, { recursive: true });
  const leftover = new RegExp(`^\\.${name.replace(/\./g, '\\.')}\\.[0-9a-f]+\\.tmp$`);
  for (const entry of readdirSync(folder)) {
    if (leftover.test(entry)) rmSync(join(folder, entry), { force: true });
  }
  const target = join(folder, name);
  if (existsSync(target)) {
    const backups = join(folder, 'backups');
    mkdirSync(backups, { recursive: true });
    const stem = name.replace(/\.yaml$/, '');
    copyFileSync(target, join(backups, `${stem}-${now.toISOString().replace(/[:.]/g, '-')}.yaml`));
    prune(backups, stem);
  }
  const temporary = join(folder, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
