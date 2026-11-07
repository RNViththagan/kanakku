import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEEP_BACKUPS, readDataFile, writeDataFile } from '../src/save';
import { cleanup, tempDir } from './helpers/http';

afterEach(cleanup);

function dataFolder(): string {
  const folder = tempDir();
  mkdirSync(join(folder, 'kanakku'));
  return folder;
}

const at = (minute: number) => new Date(Date.UTC(2026, 10, 7, 10, minute, 0, 0));
const inside = (folder: string, ...parts: string[]) => join(folder, 'kanakku', ...parts);

describe('writeDataFile', () => {
  it('writes a new file without a backup', () => {
    const folder = dataFolder();
    writeDataFile(folder, 'decisions.yaml', 'one\n', at(0));
    expect(readFileSync(inside(folder, 'decisions.yaml'), 'utf8')).toBe('one\n');
    expect(existsSync(inside(folder, 'backups'))).toBe(false);
  });

  it('backs up the old file before replacing it', () => {
    const folder = dataFolder();
    writeFileSync(inside(folder, 'config.yaml'), 'old\n');
    writeDataFile(folder, 'config.yaml', 'new\n', at(1));
    expect(readFileSync(inside(folder, 'config.yaml'), 'utf8')).toBe('new\n');
    expect(
      readFileSync(inside(folder, 'backups', 'config-2026-11-07T10-01-00-000Z.yaml'), 'utf8'),
    ).toBe('old\n');
  });

  it('keeps the newest 20 backups of each file', () => {
    const folder = dataFolder();
    for (let minute = 0; minute < 25; minute += 1) {
      writeDataFile(folder, 'config.yaml', `config ${minute}\n`, at(minute));
      writeDataFile(folder, 'decisions.yaml', `answers ${minute}\n`, at(minute));
    }
    const backups = readdirSync(inside(folder, 'backups'));
    expect(backups.filter((name) => name.startsWith('config-'))).toHaveLength(KEEP_BACKUPS);
    expect(backups.filter((name) => name.startsWith('decisions-'))).toHaveLength(KEEP_BACKUPS);
    expect(backups).toContain('config-2026-11-07T10-24-00-000Z.yaml');
    expect(backups).not.toContain('config-2026-11-07T10-04-00-000Z.yaml');
  });

  it('never prunes files with other names', () => {
    const folder = dataFolder();
    mkdirSync(inside(folder, 'backups'));
    writeFileSync(inside(folder, 'backups', 'config-old.yaml'), 'mine');
    writeFileSync(inside(folder, 'backups', 'notes.txt'), 'mine');
    for (let minute = 0; minute < 25; minute += 1) {
      writeDataFile(folder, 'config.yaml', `config ${minute}\n`, at(minute));
    }
    expect(existsSync(inside(folder, 'backups', 'config-old.yaml'))).toBe(true);
    expect(existsSync(inside(folder, 'backups', 'notes.txt'))).toBe(true);
  });

  it('leaves no temporary file behind', () => {
    const folder = dataFolder();
    writeFileSync(inside(folder, '.config.yaml.dead.tmp'), 'left by a crash');
    writeDataFile(folder, 'config.yaml', 'fresh\n', at(0));
    expect(readdirSync(inside(folder)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('readDataFile', () => {
  it('reads a missing file as empty', () => {
    expect(readDataFile(dataFolder(), 'decisions.yaml')).toBe('');
  });

  it('reads a file that is there', () => {
    const folder = dataFolder();
    writeFileSync(inside(folder, 'config.yaml'), 'version: 1\n');
    expect(readDataFile(folder, 'config.yaml')).toBe('version: 1\n');
  });
});
