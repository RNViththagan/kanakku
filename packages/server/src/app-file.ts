import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, win32 } from 'node:path';
import { parse, stringify } from 'yaml';

export interface AppFile {
  dataFolder?: string;
}

export function appFilePath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  home: string,
): string {
  if (platform === 'win32') {
    return win32.join(env.APPDATA ?? win32.join(home, 'AppData', 'Roaming'), 'kanakku', 'app.yaml');
  }
  return posix.join(env.XDG_CONFIG_HOME ?? posix.join(home, '.config'), 'kanakku', 'app.yaml');
}

export function readAppFile(path: string): AppFile | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const data: unknown = parse(readFileSync(path, 'utf8'));
    const folder = (data as { dataFolder?: unknown } | null)?.dataFolder;
    return typeof folder === 'string' && folder.trim() !== '' ? { dataFolder: folder } : {};
  } catch {
    return {};
  }
}

export function writeAppFile(path: string, data: AppFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify(data));
}
