import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeDataFile } from '../src/save';
import { cleanup, tempDir } from './helpers/http';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: vi.fn(() => {
      throw new Error('no space left on device');
    }),
  };
});

afterEach(cleanup);

describe('writeDataFile when the rename fails', () => {
  it('keeps the original and the backup when the rename fails', () => {
    const folder = tempDir();
    mkdirSync(join(folder, 'kanakku'));
    const original = join(folder, 'kanakku', 'config.yaml');
    writeFileSync(original, 'version: 1\nhomeCurrency: LKR\n');
    expect(() =>
      writeDataFile(folder, 'config.yaml', 'changed\n', new Date(Date.UTC(2026, 10, 7))),
    ).toThrow('no space left on device');
    expect(readFileSync(original, 'utf8')).toBe('version: 1\nhomeCurrency: LKR\n');
    expect(readdirSync(join(folder, 'kanakku', 'backups'))).toEqual([
      'config-2026-11-07T00-00-00-000Z.yaml',
    ]);
    expect(readdirSync(join(folder, 'kanakku')).filter((name) => name.endsWith('.tmp'))).toEqual(
      [],
    );
    expect(existsSync(original)).toBe(true);
  });
});
