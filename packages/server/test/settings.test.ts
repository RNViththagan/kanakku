import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, ConfigError } from '@kanakku/core';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, copyWorld, type Reply, send, sendJson, serve } from './helpers/http';

afterEach(cleanup);

async function start() {
  const dataFolder = copyWorld();
  const { app, port } = await serve({ dataFolder });
  const file = (name: string) => join(dataFolder, 'kanakku', name);
  return {
    app,
    port,
    dataFolder,
    file,
    text: () => readFileSync(file('config.yaml'), 'utf8'),
  };
}

function body<T>(reply: Reply): T {
  return JSON.parse(reply.body) as T;
}

async function config(port: number): Promise<Config> {
  const read = body<{ config: Config | null; errors: ConfigError[] }>(
    await send(port, '/api/config'),
  );
  if (!read.config) throw new Error(JSON.stringify(read.errors));
  return read.config;
}

function backups(dataFolder: string): string[] {
  const folder = join(dataFolder, 'kanakku', 'backups');
  return existsSync(folder) ? readdirSync(folder) : [];
}

describe('GET /api/config', () => {
  it('reads the config as it is now', async () => {
    const { port, file, text } = await start();
    expect((await config(port)).locale).toBe('en-US');
    writeFileSync(file('config.yaml'), text().replace('locale: en-US', 'locale: en-GB'));
    expect((await config(port)).locale).toBe('en-GB');
  });

  it('sends null and the errors when config.yaml is broken', async () => {
    const { port, file, text } = await start();
    writeFileSync(file('config.yaml'), text().replace('homeCurrency: LKR', 'homeCurrency: lkr'));
    const read = body<{ config: unknown; errors: unknown[] }>(await send(port, '/api/config'));
    expect(read.config).toBeNull();
    expect(read.errors.length).toBeGreaterThan(0);
  });

  it('checks the token before reading the config', async () => {
    const { port } = await start();
    expect((await send(port, '/api/config', { token: false })).status).toBe(401);
  });
});

describe('Settings changes', () => {
  it('changes a rule and rebuilds', async () => {
    const { app, port } = await start();
    const [salary] = (await config(port)).rules;
    const reply = await sendJson(port, '/api/config/rules/0', 'PUT', {
      expect: salary,
      change: { kind: 'income', category: 'Other income' },
    });
    expect(reply.status).toBe(200);
    const row = app
      .state()
      .ledger?.transactions.find((item) => item.description.startsWith('SLIPS IN - ACME'));
    expect(row).toMatchObject({ category: 'Other income', ruleIndex: 0 });
  });

  it('removes and moves rules', async () => {
    const { port } = await start();
    const rules = (await config(port)).rules;
    const moved = await sendJson(port, '/api/config/rules/1/move', 'POST', {
      expect: rules[1],
      to: 0,
    });
    expect(moved.status).toBe(200);
    expect((await config(port)).rules.map((rule) => rule.category)).toEqual(['Rent', 'Salary']);
    const after = (await config(port)).rules;
    const removed = await sendJson(port, '/api/config/rules/0/remove', 'POST', {
      expect: after[0],
    });
    expect(removed.status).toBe(200);
    expect((await config(port)).rules.map((rule) => rule.category)).toEqual(['Salary']);
  });

  it('sets your names, the locale and a manual rate', async () => {
    const { app, port } = await start();
    expect(
      (await sendJson(port, '/api/config/you', 'PUT', { names: ['A PERERA', 'PERERA A'] })).status,
    ).toBe(200);
    expect((await config(port)).you.names).toEqual(['A PERERA', 'PERERA A']);
    expect((await sendJson(port, '/api/config/general', 'PUT', { locale: 'en-gb' })).status).toBe(
      200,
    );
    expect(app.state().ledger?.locale).toBe('en-GB');
    expect(
      (await sendJson(port, '/api/config/rates', 'PUT', { manual: { USD: '310.50' } })).status,
    ).toBe(200);
    expect(app.state().ledger?.rates.manual.USD).toBe('310.5');
  });

  it('adds and removes a category', async () => {
    const { app, port } = await start();
    const added = await sendJson(port, '/api/config/categories', 'POST', {
      kind: 'spending',
      name: 'Pets',
    });
    expect(added.status).toBe(200);
    expect(app.state().ledger?.categories.spending).toContain('Pets');
    const removed = await sendJson(port, '/api/config/categories/remove', 'POST', {
      name: 'Pets',
    });
    expect(removed.status).toBe(200);
    expect(app.state().ledger?.categories.spending).not.toContain('Pets');
  });

  it('writes nothing when a change changes nothing', async () => {
    const { port, dataFolder } = await start();
    const rules = (await config(port)).rules;
    const reply = await sendJson(port, '/api/config/rules/0/move', 'POST', {
      expect: rules[0],
      to: 0,
    });
    expect(reply.status).toBe(200);
    expect(backups(dataFolder)).toEqual([]);
  });
});

describe('Settings refusals', () => {
  it('refuses a rule edit whose rule changed by hand', async () => {
    const { port, file, text } = await start();
    const [salary] = (await config(port)).rules;
    writeFileSync(
      file('config.yaml'),
      text().replace('kind: income\n    category: Salary', 'kind: income\n    category: Interest'),
    );
    const edited = text();
    const reply = await sendJson(port, '/api/config/rules/0', 'PUT', {
      expect: salary,
      change: { category: 'Other income' },
    });
    expect(reply.status).toBe(409);
    expect(body<{ errors: string[] }>(reply).errors).toEqual([
      'The rules changed since this list loaded. It has been refreshed, so try again.',
    ]);
    expect(text()).toBe(edited);
  });

  it('refuses rule positions that are not plain whole numbers', async () => {
    const { port } = await start();
    for (const index of ['01', '-1', '1.5']) {
      const reply = await sendJson(port, `/api/config/rules/${index}`, 'PUT', {
        expect: {},
        change: {},
      });
      expect(reply.status).toBe(404);
    }
  });

  it('refuses a pattern change with the reason', async () => {
    const { port, file, text } = await start();
    writeFileSync(
      file('config.yaml'),
      `${text()}  - match: { regex: "GROCER|MARKET" }\n    category: Groceries\n`,
    );
    const rules = (await config(port)).rules;
    const reply = await sendJson(port, '/api/config/rules/2', 'PUT', {
      expect: rules[2],
      change: { match: 'GROCER' },
    });
    expect(reply.status).toBe(400);
    expect(body<{ errors: string[] }>(reply).errors).toEqual([
      'rules[2].match: a pattern can only be changed in config.yaml',
    ]);
  });

  it('refuses Settings changes when config.yaml has errors', async () => {
    const { port, file, text } = await start();
    writeFileSync(file('config.yaml'), text().replace('homeCurrency: LKR', 'homeCurrency: lkr'));
    const broken = text();
    const reply = await sendJson(port, '/api/config/you', 'PUT', { names: ['A PERERA'] });
    expect(reply.status).toBe(409);
    expect(text()).toBe(broken);
  });

  it('refuses a new home currency while stored rates exist', async () => {
    const { port, file } = await start();
    await sendJson(port, '/api/config/rates', 'PUT', { manual: { USD: null } });
    mkdirSync(file('rates'));
    writeFileSync(file('rates/USD.csv'), 'date,buying,selling,source\n');
    const reply = await sendJson(port, '/api/config/general', 'PUT', { homeCurrency: 'USD' });
    expect(reply.status).toBe(409);
    expect(body<{ errors: string[] }>(reply).errors[0]).toContain('USD.csv');
  });

  it('refuses to remove a category an answer uses', async () => {
    const { app, port } = await start();
    const row = app.state().ledger?.transactions.find((item) => item.kind === 'spending');
    if (!row) throw new Error('fixture row missing');
    await sendJson(port, '/api/config/categories', 'POST', { kind: 'spending', name: 'Pets' });
    await sendJson(port, '/api/decisions', 'POST', {
      type: 'set',
      txn: row.id,
      kind: 'spending',
      category: 'Pets',
    });
    const reply = await sendJson(port, '/api/config/categories/remove', 'POST', { name: 'Pets' });
    expect(reply.status).toBe(409);
  });

  it('edits the right account after a hand edit', async () => {
    const { port, file, text } = await start();
    const before = text();
    const from = before.indexOf('accounts:\n') + 'accounts:\n'.length;
    const to = before.indexOf('\nyou:');
    const blocks = before
      .slice(from, to)
      .split(/\n(?= {2}- id: )/)
      .reverse();
    writeFileSync(
      file('config.yaml'),
      `${before.slice(0, from)}${blocks.join('\n')}${before.slice(to)}`,
    );
    expect((await config(port)).accounts.at(0)?.id).toBe('hnb-usd');
    const reply = await sendJson(port, '/api/config/accounts', 'POST', {
      id: 'hnb-lkr',
      name: 'Renamed HNB',
    });
    expect(reply.status).toBe(200);
    const accounts = (await config(port)).accounts;
    expect(accounts.find((account) => account.id === 'hnb-lkr')?.name).toBe('Renamed HNB');
    expect(accounts.filter((account) => account.name === 'Renamed HNB')).toHaveLength(1);
  });

  it('rejects bodies of the wrong shape', async () => {
    const { port } = await start();
    expect((await sendJson(port, '/api/config/you', 'PUT', { names: 'A PERERA' })).status).toBe(
      400,
    );
    expect(
      (await sendJson(port, '/api/config/categories', 'POST', { kind: 'other', name: 'X' })).status,
    ).toBe(400);
    expect(
      (await sendJson(port, '/api/config/rules/0/move', 'POST', { expect: {}, to: 1.5 })).status,
    ).toBe(400);
  });
});
