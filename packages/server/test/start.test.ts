import { type AddressInfo, createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { browserCommand, findPort, startApp } from '../src/start';
import { cleanup, makeWebRoot, onCleanup, send, world } from './helpers/http';

afterEach(cleanup);

async function occupy(): Promise<number> {
  const blocker = createServer();
  await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', done));
  onCleanup(() => new Promise<void>((done) => blocker.close(() => done())));
  return (blocker.address() as AddressInfo).port;
}

function tokenOf(html: string): string {
  return /name="kanakku-token" content="([^"]+)"/.exec(html)?.[1] ?? '';
}

async function start(options: { port?: number; token?: string } = {}) {
  const running = await startApp({
    dataFolder: world,
    webRoot: makeWebRoot(),
    port: options.port ?? 0,
    open: false,
    token: options.token,
    today: () => '2026-02-20',
  });
  onCleanup(() => running.close());
  return { ...running, port: Number(new URL(running.url).port) };
}

describe('findPort', () => {
  it('returns the next port when the preferred one is taken', async () => {
    const taken = await occupy();
    const port = await findPort(taken);
    expect(port).toBeGreaterThan(taken);
    expect(port).toBeLessThan(taken + 50);
  });

  it('gives up after its tries', async () => {
    const taken = await occupy();
    await expect(findPort(taken, '127.0.0.1', 1)).rejects.toThrow('No free port');
  });
});

describe('startApp', () => {
  it('serves the app with a fresh token', async () => {
    const running = await start();
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const token = tokenOf((await send(running.port, '/', { token: false })).body);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const status = await send(running.port, '/api/status', {
      token: false,
      headers: { 'x-kanakku-token': token },
    });
    expect(status.status).toBe(200);
  });

  it('uses the token it is given', async () => {
    const running = await start({ token: 'dev-token-0123456789' });
    expect(tokenOf((await send(running.port, '/', { token: false })).body)).toBe(
      'dev-token-0123456789',
    );
  });

  it('moves to the next port when the preferred one is busy', async () => {
    const taken = await occupy();
    const running = await start({ port: taken });
    expect(running.port).toBeGreaterThan(taken);
  });
});

describe('browserCommand', () => {
  it('opens the address with the platform tool', () => {
    const url = 'http://127.0.0.1:5170/';
    expect(browserCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] });
    expect(browserCommand(url, 'linux')).toEqual({ command: 'xdg-open', args: [url] });
    expect(browserCommand(url, 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', `"${url}"`],
    });
  });
});
