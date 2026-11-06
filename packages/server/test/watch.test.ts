import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { watchFolders } from '../src/watch';
import {
  cleanup,
  copyWorld,
  onCleanup,
  openStream,
  send,
  serve,
  settle,
  TOKEN,
  tempDir,
  until,
} from './helpers/http';

afterEach(cleanup);

const HNB_FILE = join('hnb', 'HNB_33333XXXXX33_LKR_2026-01-01_to_2026-01-31.csv');

async function watchCounting(folders: string[]) {
  const seen = { calls: 0 };
  const watcher = watchFolders(
    folders,
    () => {
      seen.calls += 1;
    },
    { delayMs: 200 },
  );
  onCleanup(() => watcher.close());
  await settle(400);
  seen.calls = 0;
  return { seen, watcher };
}

describe('watchFolders', () => {
  it('reports a burst of changes once', async () => {
    const folder = tempDir();
    const { seen } = await watchCounting([folder]);
    for (const name of ['a.csv', 'b.csv', 'c.csv']) writeFileSync(join(folder, name), 'x');
    await until(() => seen.calls > 0, 1500);
    await settle(500);
    expect(seen.calls).toBe(1);
  });

  it('sees changes in sub folders', async () => {
    const folder = tempDir();
    mkdirSync(join(folder, 'boc', '2026'), { recursive: true });
    const { seen } = await watchCounting([folder]);
    writeFileSync(join(folder, 'boc', '2026', 'statement.csv'), 'x');
    await until(() => seen.calls > 0, 1500);
  });

  it('ignores hidden files and folders', async () => {
    const folder = tempDir();
    mkdirSync(join(folder, '.git'));
    const { seen } = await watchCounting([folder]);
    writeFileSync(join(folder, '.DS_Store'), 'x');
    writeFileSync(join(folder, '.git', 'index'), 'x');
    await settle(800);
    expect(seen.calls).toBe(0);
  });

  it('skips folders that do not exist', async () => {
    const folder = tempDir();
    const { seen } = await watchCounting([join(folder, 'missing'), folder]);
    writeFileSync(join(folder, 'a.csv'), 'x');
    await until(() => seen.calls > 0, 1500);
  });

  it('watches a folder that appears later', async () => {
    const folder = join(tempDir(), 'later');
    const seen = { calls: 0 };
    const watcher = watchFolders(
      [folder],
      () => {
        seen.calls += 1;
      },
      { delayMs: 100, retryMs: 100 },
    );
    onCleanup(() => watcher.close());
    await settle(300);
    mkdirSync(folder);
    await until(() => seen.calls > 0, 1500);
    await settle(300);
    seen.calls = 0;
    writeFileSync(join(folder, 'a.csv'), 'x');
    await until(() => seen.calls > 0, 1500);
  });

  it('starts a watcher again after it fails', async () => {
    const started: EventEmitter[] = [];
    const watch = () => {
      const watcher = Object.assign(new EventEmitter(), { close: () => undefined });
      started.push(watcher);
      return watcher;
    };
    const seen = { calls: 0 };
    const watcher = watchFolders(
      [tempDir()],
      () => {
        seen.calls += 1;
      },
      { delayMs: 50, retryMs: 50, watch },
    );
    onCleanup(() => watcher.close());
    expect(started).toHaveLength(1);
    started[0]?.emit('error', new Error('watch failed'));
    await until(() => started.length === 2 && seen.calls > 0, 1500);
  });

  it('stops after close', async () => {
    const folder = tempDir();
    const { seen, watcher } = await watchCounting([folder]);
    watcher.close();
    writeFileSync(join(folder, 'a.csv'), 'x');
    await settle(600);
    expect(seen.calls).toBe(0);
  });
});

describe('app watching', () => {
  it('rebuilds once files settle and tells open pages', async () => {
    const folder = copyWorld();
    const { port } = await serve({ dataFolder: folder, watch: true });
    const events = await openStream(port, `/api/events?token=${TOKEN}`);
    await settle(700);
    writeFileSync(join(folder, 'hnb', 'copy.csv'), readFileSync(join(folder, HNB_FILE)));
    await until(async () => (await send(port, '/api/ledger')).body.includes('hnb/copy.csv'), 3000);
    await events.waitFor('event: changed');
    const seen = events.count('event: changed');
    await settle(1200);
    expect(events.count('event: changed')).toBe(seen);
  });

  it('starts watching a bank folder added to the config', async () => {
    const folder = copyWorld();
    const outside = tempDir();
    const { port } = await serve({ dataFolder: folder, watch: true });
    const events = await openStream(port, `/api/events?token=${TOKEN}`);
    await settle(700);
    const configPath = join(folder, 'kanakku', 'config.yaml');
    const config = readFileSync(configPath, 'utf8');
    writeFileSync(
      configPath,
      config.replace('folders:\n', `folders:\n  - path: "${outside}"\n    bank: hnb\n`),
    );
    await until(() => events.count('event: changed') > 0, 3000);
    writeFileSync(join(outside, 'extra.csv'), readFileSync(join(folder, HNB_FILE)));
    await until(async () => (await send(port, '/api/ledger')).body.includes('extra.csv'), 3000);
  });
});
