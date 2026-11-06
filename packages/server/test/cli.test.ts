import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type CliContext, runCli } from '../src/cli';
import { cleanup, makeWebRoot, onCleanup, send } from './helpers/http';

const world = fileURLToPath(new URL('../../core/test/fixtures/ledger', import.meta.url));
const bin = fileURLToPath(new URL('../bin/kanakku.mjs', import.meta.url));
const temp: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanakku-'));
  temp.push(dir);
  return dir;
};
afterEach(async () => {
  await cleanup();
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function run(args: string[], extra: Partial<CliContext> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    env: { XDG_CONFIG_HOME: tempDir() },
    cwd: '/',
    home: '/nowhere',
    platform: 'darwin',
    today: () => '2026-02-20',
    webRoot: '/nowhere/web',
    print: (text) => out.push(text),
    error: (text) => err.push(text),
    onStop: (stop) => onCleanup(stop),
    ...extra,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('kanakku command', () => {
  it('shows help', async () => {
    const result = await run(['help']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('kanakku start');
    expect(result.out).toContain('kanakku report');
    expect(result.out).toContain('kanakku use <folder>');
  });

  it('explains how to start when bare kanakku has no data folder', async () => {
    const result = await run([]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('kanakku use <folder>');
  });

  it('starts the app', async () => {
    const result = await run(['start', '--data', world, '--no-open', '--port', '0'], {
      webRoot: makeWebRoot(),
    });
    expect(result.code).toBe(0);
    const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(result.out)?.[0] ?? '';
    expect(url).not.toBe('');
    const port = Number(new URL(url).port);
    const page = await send(port, '/', { token: false });
    const token = /name="kanakku-token" content="([^"]+)"/.exec(page.body)?.[1] ?? '';
    const status = await send(port, '/api/status', {
      token: false,
      headers: { 'x-kanakku-token': token },
    });
    expect(JSON.parse(status.body).files).toBe(7);
  });

  it('starts the app from bare kanakku when the data folder is known', async () => {
    const config = tempDir();
    await run(['use', world], { env: { XDG_CONFIG_HOME: config } });
    const result = await run(['--no-open', '--port', '0'], {
      env: { XDG_CONFIG_HOME: config },
      webRoot: makeWebRoot(),
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain('http://127.0.0.1:');
  });

  it('asks for a web build before starting', async () => {
    const result = await run(['start', '--data', world, '--no-open']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('Run pnpm build first');
  });

  it('rejects a bad port', async () => {
    const result = await run(['start', '--data', world, '--port', 'abc'], {
      webRoot: makeWebRoot(),
    });
    expect(result.code).toBe(2);
  });

  it('reports on a data folder given with --data', async () => {
    const result = await run(['report', '--data', world]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('285,290.00 LKR');
  });

  it('remembers a data folder', async () => {
    const config = tempDir();
    const used = await run(['use', world], { env: { XDG_CONFIG_HOME: config } });
    expect(used.code).toBe(0);
    expect(used.out).toContain(world);
    const where = await run(['where'], { env: { XDG_CONFIG_HOME: config } });
    expect(where.code).toBe(0);
    expect(where.out).toContain(world);
    expect(where.out).toContain('Config: ok, 5 accounts, 7 statement files');
    expect((await run(['report'], { env: { XDG_CONFIG_HOME: config } })).out).toContain('BOC Main');
  });

  it('explains how to start when no data folder is known', async () => {
    const result = await run(['report']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('kanakku use <folder>');
  });

  it('refuses a folder that does not exist', async () => {
    expect((await run(['use', '/no/such/folder'])).code).toBe(1);
  });

  it('rejects unknown commands and bad dates', async () => {
    expect((await run(['dance'])).code).toBe(2);
    expect((await run(['report', '--data', world, '--today', '2026-13-40'])).code).toBe(2);
  });

  it('runs from any folder through its launcher', () => {
    const result = spawnSync(
      process.execPath,
      [bin, 'report', '--data', world, '--today', '2026-02-20'],
      {
        cwd: tmpdir(),
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('BOC Main');
    const version = spawnSync(process.execPath, [bin, '--version'], {
      cwd: tmpdir(),
      encoding: 'utf8',
    });
    expect(version.stdout.trim()).toBe('0.1.0');
  });
});
