import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  cleanup,
  copyWorld,
  makeWebRoot,
  openStream,
  send,
  serve,
  TOKEN,
  tempDir,
  world,
} from './helpers/http';

afterEach(cleanup);

describe('local app', () => {
  it('rejects a foreign Host header', async () => {
    const { port } = await serve();
    const foreign = { host: `evil.example:${port}` };
    expect((await send(port, '/api/status', { headers: foreign })).status).toBe(403);
    expect((await send(port, '/', { headers: foreign, token: false })).status).toBe(403);
    expect(
      (await send(port, '/api/status', { headers: { host: `localhost:${port + 1}` } })).status,
    ).toBe(403);
    expect((await send(port, '/api/status', { setHost: false })).status).toBe(400);
    expect(
      (await send(port, '/api/status', { headers: { host: `localhost:${port}` } })).status,
    ).toBe(200);
  });

  it('requires the token on api requests', async () => {
    const { port } = await serve();
    expect((await send(port, '/api/status', { token: false })).status).toBe(401);
    const wrong = { 'x-kanakku-token': 'b'.repeat(64) };
    expect((await send(port, '/api/status', { token: false, headers: wrong })).status).toBe(401);
    const short = { 'x-kanakku-token': 'aaa' };
    expect((await send(port, '/api/status', { token: false, headers: short })).status).toBe(401);
    expect((await send(port, '/api/status')).status).toBe(200);
    expect((await send(port, `/api/status?token=${TOKEN}`, { token: false })).status).toBe(401);
    const events = await openStream(port, `/api/events?token=${TOKEN}`);
    expect(events.status).toBe(200);
    expect(events.headers['content-type']).toContain('text/event-stream');
    expect((await openStream(port, '/api/events?token=wrong')).status).toBe(401);
  });

  it('rejects cross-site api requests', async () => {
    const { port } = await serve();
    const from = (site: string) => ({ headers: { 'sec-fetch-site': site } });
    expect((await send(port, '/api/status', from('cross-site'))).status).toBe(403);
    expect((await send(port, '/api/status', from('same-site'))).status).toBe(403);
    expect((await send(port, '/api/status', from('same-origin'))).status).toBe(200);
  });

  it('answers only GET', async () => {
    const { port } = await serve();
    expect((await send(port, '/api/status', { method: 'POST' })).status).toBe(405);
  });

  it('serves the ledger and never sends raw statement text', async () => {
    const { port } = await serve();
    const ledger = await send(port, '/api/ledger');
    expect(ledger.status).toBe(200);
    expect(ledger.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(ledger.headers['cache-control']).toBe('no-store');
    const accounts = JSON.parse(ledger.body).accounts.map((account: { id: string }) => account.id);
    expect(accounts).toContain('boc-main');
    const status = await send(port, '/api/status');
    expect(JSON.parse(status.body)).toEqual({
      dataFolder: world,
      configPath: join(world, 'kanakku', 'config.yaml'),
      configErrors: [],
      decisionErrors: [],
      files: 7,
      stale: false,
    });
    for (const body of [ledger.body, status.body]) {
      expect(body).not.toContain('1 SAMPLE ROAD');
      expect(body).not.toContain('this is not a statement');
    }
  });

  it('explains a broken data folder', async () => {
    const { port } = await serve({ dataFolder: tempDir() });
    const ledger = await send(port, '/api/ledger');
    expect(ledger.status).toBe(503);
    expect(JSON.parse(ledger.body).configErrors[0].message).toContain('kanakku/config.yaml');
    const status = JSON.parse((await send(port, '/api/status')).body);
    expect(status.configErrors[0].message).toContain('kanakku/config.yaml');
    expect(status.stale).toBe(false);
  });

  it('keeps the last good ledger when the config breaks', async () => {
    const folder = copyWorld();
    const { app, port } = await serve({ dataFolder: folder });
    const configPath = join(folder, 'kanakku', 'config.yaml');
    const good = readFileSync(configPath, 'utf8');
    writeFileSync(configPath, 'version: 1\naccounts: [');
    app.rebuild();
    expect((await send(port, '/api/ledger')).status).toBe(200);
    const broken = JSON.parse((await send(port, '/api/status')).body);
    expect(broken.configErrors.length).toBeGreaterThan(0);
    expect(broken.stale).toBe(true);
    writeFileSync(configPath, good);
    app.rebuild();
    expect(JSON.parse((await send(port, '/api/status')).body)).toMatchObject({
      configErrors: [],
      files: 7,
      stale: false,
    });
  });

  it('keeps the last good ledger when a rebuild fails', async () => {
    const folder = copyWorld();
    const { app, port } = await serve({ dataFolder: folder });
    symlinkSync(join(folder, 'gone.csv'), join(folder, 'boc', 'gone.csv'));
    expect(() => app.rebuild()).not.toThrow();
    expect((await send(port, '/api/ledger')).status).toBe(200);
    const status = JSON.parse((await send(port, '/api/status')).body);
    expect(status.error).toContain('gone.csv');
    expect(status.stale).toBe(true);
  });

  it('tells open pages when the ledger is rebuilt', async () => {
    const { app, port } = await serve();
    const events = await openStream(port, `/api/events?token=${TOKEN}`);
    app.rebuild();
    await events.waitFor('event: changed');
  });

  it('serves tidy suggestions', async () => {
    const { port } = await serve();
    const tidy = JSON.parse((await send(port, '/api/tidy')).body);
    expect(tidy).toContainEqual(
      expect.objectContaining({
        file: 'boc/HNB_44444XXXXX44_USD_2026-01-01_to_2026-01-31.csv',
        action: 'move',
      }),
    );
  });

  it('serves the app with the token', async () => {
    const { port } = await serve();
    for (const path of ['/', '/accounts', '/index.html']) {
      const page = await send(port, path, { token: false });
      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(page.headers['cache-control']).toBe('no-store');
      expect(page.body).toContain(`<head><meta name="kanakku-token" content="${TOKEN}">`);
    }
    const script = await send(port, '/app.js', { token: false });
    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.body).toBe('console.log("kanakku");');
  });

  it('refuses paths outside the web root and survives bad paths', async () => {
    const { port } = await serve();
    for (const path of [
      '/../package.json',
      '/..%2fpackage.json',
      '/%2e%2e%2fpackage.json',
      '/%2e%2e/package.json',
      '/%zz',
      '/%00',
      '/app.js%00.png',
    ]) {
      const reply = await send(port, path, { token: false });
      expect(reply.status).not.toBe(500);
      expect(reply.body).not.toContain('outside the web root');
    }
    expect((await send(port, '/app.js', { token: false })).status).toBe(200);
  });

  it('sends no CORS headers and sets nosniff and frame headers', async () => {
    const { port } = await serve();
    const replies = [
      await send(port, '/api/status', { headers: { origin: 'http://evil.example' } }),
      await send(port, '/', { token: false }),
      await send(port, '/app.js', { token: false }),
    ];
    for (const reply of replies) {
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
      expect(reply.headers['x-content-type-options']).toBe('nosniff');
      expect(reply.headers['x-frame-options']).toBe('DENY');
    }
  });

  it('refuses a token that could break the page', () => {
    expect(() =>
      createApp({
        dataFolder: world,
        webRoot: makeWebRoot(),
        token: '"><script>',
        today: () => '2026-02-20',
      }),
    ).toThrow();
  });
});
