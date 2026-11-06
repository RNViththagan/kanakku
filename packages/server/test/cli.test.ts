import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type CliContext, runCli } from '../src/cli';

const world = fileURLToPath(new URL('../../core/test/fixtures/ledger', import.meta.url));
const bin = fileURLToPath(new URL('../bin/kanakku.mjs', import.meta.url));
const temp: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kanakku-'));
  temp.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], extra: Partial<CliContext> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(args, {
    env: { XDG_CONFIG_HOME: tempDir() },
    cwd: '/',
    home: '/nowhere',
    platform: 'darwin',
    today: '2026-02-20',
    print: (text) => out.push(text),
    error: (text) => err.push(text),
    ...extra,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('kanakku command', () => {
  it('shows help', () => {
    const result = run([]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('kanakku report');
    expect(result.out).toContain('kanakku use <folder>');
  });

  it('reports on a data folder given with --data', () => {
    const result = run(['report', '--data', world]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('285,290.00 LKR');
  });

  it('remembers a data folder', () => {
    const config = tempDir();
    const used = run(['use', world], { env: { XDG_CONFIG_HOME: config } });
    expect(used.code).toBe(0);
    expect(used.out).toContain(world);
    const where = run(['where'], { env: { XDG_CONFIG_HOME: config } });
    expect(where.code).toBe(0);
    expect(where.out).toContain(world);
    expect(where.out).toContain('Config: ok, 5 accounts, 7 statement files');
    expect(run(['report'], { env: { XDG_CONFIG_HOME: config } }).out).toContain('BOC Main');
  });

  it('explains how to start when no data folder is known', () => {
    const result = run(['report']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('kanakku use <folder>');
  });

  it('refuses a folder that does not exist', () => {
    expect(run(['use', '/no/such/folder']).code).toBe(1);
  });

  it('rejects unknown commands and bad dates', () => {
    expect(run(['dance']).code).toBe(2);
    expect(run(['report', '--data', world, '--today', '2026-13-40']).code).toBe(2);
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
