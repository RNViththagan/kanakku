import { join, resolve } from 'node:path';
import { readAppFile } from './app-file';

export interface DataFolder {
  folder: string;
  source: 'option' | 'env' | 'app-file';
}

export function expandHome(path: string, home: string): string {
  if (path === '~') return home;
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2));
  return path;
}

export function resolveDataFolder(input: {
  option?: string;
  env: NodeJS.ProcessEnv;
  appFile: string;
  cwd: string;
  home: string;
}): DataFolder | undefined {
  const absolute = (path: string) => resolve(input.cwd, expandHome(path.trim(), input.home));
  if (input.option && input.option.trim() !== '')
    return { folder: absolute(input.option), source: 'option' };
  const fromEnv = input.env.KANAKKU_DATA;
  if (fromEnv && fromEnv.trim() !== '') return { folder: absolute(fromEnv), source: 'env' };
  const fromFile = readAppFile(input.appFile)?.dataFolder;
  if (fromFile) return { folder: absolute(fromFile), source: 'app-file' };
  return undefined;
}
