import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { type IncomingHttpHeaders, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/app';

export const world = fileURLToPath(new URL('../../../core/test/fixtures/ledger', import.meta.url));
export const TOKEN = 'a'.repeat(64);

const cleanups: Array<() => void | Promise<void>> = [];

export function onCleanup(cleanup: () => void | Promise<void>): void {
  cleanups.push(cleanup);
}

export async function cleanup(): Promise<void> {
  for (const next of cleanups.splice(0).reverse()) await next();
}

export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kanakku-app-'));
  onCleanup(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function copyWorld(): string {
  const folder = tempDir();
  cpSync(world, folder, { recursive: true });
  return folder;
}

export function makeWebRoot(): string {
  const base = tempDir();
  const root = join(base, 'web');
  mkdirSync(root);
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><html><head><title>Kanakku</title></head><body><div id="root"></div></body></html>',
  );
  writeFileSync(join(root, 'app.js'), 'console.log("kanakku");');
  writeFileSync(join(base, 'package.json'), '{"secret":"outside the web root"}');
  return root;
}

export async function serve(options: { dataFolder?: string; watch?: boolean } = {}) {
  const app = createApp({
    dataFolder: options.dataFolder ?? world,
    webRoot: makeWebRoot(),
    token: TOKEN,
    today: () => '2026-02-20',
    watch: options.watch,
  });
  await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
  onCleanup(() => app.close());
  return { app, port: (app.server.address() as AddressInfo).port };
}

export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export function send(
  port: number,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    token?: boolean;
    setHost?: boolean;
  } = {},
): Promise<Reply> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        setHost: options.setHost ?? true,
        headers: {
          ...(options.token === false ? {} : { 'x-kanakku-token': TOKEN }),
          ...options.headers,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', fail);
    req.end();
  });
}

export interface Stream {
  status: number;
  headers: IncomingHttpHeaders;
  count(text: string): number;
  waitFor(text: string): Promise<void>;
}

export function openStream(port: number, path: string): Promise<Stream> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      let received = '';
      const waiting: Array<() => void> = [];
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        received += chunk;
        for (const check of waiting.splice(0)) check();
      });
      done({
        status: res.statusCode ?? 0,
        headers: res.headers,
        count: (text) => received.split(text).length - 1,
        waitFor: (text) =>
          new Promise((found, missing) => {
            const timer = setTimeout(() => missing(new Error(`no "${text}" in the stream`)), 2000);
            const check = () => {
              if (received.includes(text)) {
                clearTimeout(timer);
                found();
              } else waiting.push(check);
            };
            check();
          }),
      });
    });
    req.on('error', fail);
    onCleanup(() => {
      req.destroy();
    });
    req.end();
  });
}

export function settle(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

export async function until(check: () => boolean | Promise<boolean>, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${ms} ms`);
    await settle(25);
  }
}
