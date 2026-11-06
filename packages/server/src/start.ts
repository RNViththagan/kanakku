import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { type AddressInfo, createServer } from 'node:net';
import type { IsoDate } from '@kanakku/core';
import { createApp } from './app';

export const DEFAULT_PORT = 5170;

export interface StartOptions {
  dataFolder: string;
  webRoot: string;
  port?: number;
  open?: boolean;
  token?: string;
  today?: () => IsoDate;
}

export interface RunningApp {
  url: string;
  close(): Promise<void>;
}

export function localToday(now = new Date()): IsoDate {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function tryPort(port: number, host: string): Promise<number | undefined> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') done(undefined);
      else fail(error);
    });
    probe.listen(port, host, () => {
      const bound = (probe.address() as AddressInfo).port;
      probe.close(() => done(bound));
    });
  });
}

export async function findPort(preferred: number, host = '127.0.0.1', tries = 50): Promise<number> {
  for (let offset = 0; offset < tries && preferred + offset <= 65535; offset += 1) {
    const free = await tryPort(preferred === 0 ? 0 : preferred + offset, host);
    if (free !== undefined) return free;
  }
  throw new Error(`No free port from ${preferred} to ${preferred + tries - 1}`);
}

export function browserCommand(
  url: string,
  platform: NodeJS.Platform,
): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '""', `"${url}"`] };
  return { command: 'xdg-open', args: [url] };
}

export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const { command, args } = browserCommand(url, platform);
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: platform === 'win32',
  });
  child.on('error', () => undefined);
  child.unref();
}

export async function startApp(options: StartOptions): Promise<RunningApp> {
  const app = createApp({
    dataFolder: options.dataFolder,
    webRoot: options.webRoot,
    token: options.token ?? randomBytes(32).toString('hex'),
    today: options.today ?? (() => localToday()),
    watch: true,
  });
  try {
    const port = await findPort(options.port ?? DEFAULT_PORT);
    await new Promise<void>((done, fail) => {
      app.server.once('error', fail);
      app.server.listen(port, '127.0.0.1', () => {
        app.server.off('error', fail);
        done();
      });
    });
    const url = `http://127.0.0.1:${port}/`;
    if (options.open) openBrowser(url);
    return { url, close: () => app.close() };
  } catch (problem) {
    await app.close();
    throw problem;
  }
}
