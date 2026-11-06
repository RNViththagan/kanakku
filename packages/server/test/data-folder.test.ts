import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appFilePath, readAppFile, writeAppFile } from '../src/app-file';
import { resolveDataFolder } from '../src/data-folder';

const temp: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanakku-'));
  temp.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('appFilePath', () => {
  it('uses the user config folder on each platform', () => {
    expect(appFilePath({}, 'darwin', '/Users/a')).toBe('/Users/a/.config/kanakku/app.yaml');
    expect(appFilePath({ XDG_CONFIG_HOME: '/x' }, 'linux', '/home/a')).toBe('/x/kanakku/app.yaml');
    expect(
      appFilePath({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32', 'C:\\Users\\a'),
    ).toBe('C:\\Users\\a\\AppData\\Roaming\\kanakku\\app.yaml');
  });
});

describe('app file', () => {
  it('writes and reads the data folder', () => {
    const file = join(tempDir(), 'nested', 'app.yaml');
    writeAppFile(file, { dataFolder: '/data/finance' });
    expect(readFileSync(file, 'utf8')).toContain('dataFolder: /data/finance');
    expect(readAppFile(file)).toEqual({ dataFolder: '/data/finance' });
  });

  it('reads nothing from a missing or broken file', () => {
    const dir = tempDir();
    expect(readAppFile(join(dir, 'missing.yaml'))).toBeUndefined();
    writeAppFile(join(dir, 'odd.yaml'), { dataFolder: '' });
    expect(readAppFile(join(dir, 'odd.yaml'))).toEqual({});
  });
});

describe('resolveDataFolder', () => {
  it('prefers the option, then the environment, then the app file', () => {
    const appFile = join(tempDir(), 'app.yaml');
    writeAppFile(appFile, { dataFolder: '/from/app' });
    const base = { appFile, cwd: '/work', home: '/Users/a' };
    expect(
      resolveDataFolder({ ...base, option: 'data', env: { KANAKKU_DATA: '/from/env' } }),
    ).toEqual({
      folder: '/work/data',
      source: 'option',
    });
    expect(resolveDataFolder({ ...base, env: { KANAKKU_DATA: '/from/env' } })).toEqual({
      folder: '/from/env',
      source: 'env',
    });
    expect(resolveDataFolder({ ...base, env: {} })).toEqual({
      folder: '/from/app',
      source: 'app-file',
    });
  });

  it('expands a leading tilde', () => {
    const base = { appFile: join(tempDir(), 'none.yaml'), cwd: '/work', home: '/Users/a', env: {} };
    expect(resolveDataFolder({ ...base, option: '~/Finance' })?.folder).toBe('/Users/a/Finance');
  });

  it('finds nothing when no source is set', () => {
    expect(
      resolveDataFolder({ appFile: join(tempDir(), 'none.yaml'), cwd: '/w', home: '/h', env: {} }),
    ).toBeUndefined();
  });
});
