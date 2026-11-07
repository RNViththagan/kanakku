import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type DecisionContent, decisionId, type Ledger } from '@kanakku/core';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, copyWorld, type Reply, send, sendJson, serve } from './helpers/http';

afterEach(cleanup);

let tick = 0;
const now = () => new Date(Date.UTC(2026, 1, 20, 10, 0, 0, tick++));

async function start() {
  const dataFolder = copyWorld();
  const { app, port } = await serve({ dataFolder, now });
  return { app, port, dataFolder, file: (name: string) => join(dataFolder, 'kanakku', name) };
}

function body<T>(reply: Reply): T {
  return JSON.parse(reply.body) as T;
}

function grocer(ledger: Ledger | undefined) {
  const row = ledger?.transactions.find((item) => item.description.startsWith('POS       GROCER'));
  if (!row) throw new Error('fixture row missing');
  return row;
}

function backups(dataFolder: string): string[] {
  const folder = join(dataFolder, 'kanakku', 'backups');
  return existsSync(folder) ? readdirSync(folder) : [];
}

describe('answers', () => {
  it('saves an answer and rebuilds', async () => {
    const { app, port, file } = await start();
    const txn = grocer(app.state().ledger).id;
    const content: DecisionContent = { type: 'set', txn, kind: 'spending', category: 'Groceries' };
    const reply = await sendJson(port, '/api/decisions', 'POST', content);
    expect(reply.status).toBe(200);
    expect(body<{ decisions: Array<{ id: string }> }>(reply).decisions[0]?.id).toBe(
      decisionId(content),
    );
    expect(readFileSync(file('decisions.yaml'), 'utf8')).toContain('category: Groceries');
    expect(grocer(app.state().ledger).category).toBe('Groceries');
  });

  it('saves the same answer twice as one', async () => {
    const { app, port, file } = await start();
    const content = { type: 'not-transfer', txn: grocer(app.state().ledger).id };
    await sendJson(port, '/api/decisions', 'POST', content);
    const first = readFileSync(file('decisions.yaml'), 'utf8');
    expect((await sendJson(port, '/api/decisions', 'POST', content)).status).toBe(200);
    expect(readFileSync(file('decisions.yaml'), 'utf8')).toBe(first);
  });

  it('saves a list in one write, or none of it', async () => {
    const { app, port, file, dataFolder } = await start();
    const txn = grocer(app.state().ledger).id;
    await sendJson(port, '/api/decisions', 'POST', { type: 'dismiss', item: 'n1' });
    const list = [
      { type: 'not-transfer', txn },
      { type: 'set', txn, kind: 'spending', category: 'Groceries' },
    ];
    expect((await sendJson(port, '/api/decisions', 'POST', list)).status).toBe(200);
    expect(backups(dataFolder)).toHaveLength(1);
    const saved = readFileSync(file('decisions.yaml'), 'utf8');
    const bad = await sendJson(port, '/api/decisions', 'POST', [
      { type: 'dismiss', item: 'n2' },
      { type: 'pair', out: txn },
    ]);
    expect(bad.status).toBe(400);
    expect(body<{ errors: string[] }>(bad).errors).toEqual(['answer 2: in: is required']);
    expect(readFileSync(file('decisions.yaml'), 'utf8')).toBe(saved);
  });

  it('replaces an answer the new one contradicts', async () => {
    const { app, port, file } = await start();
    const ledger = app.state().ledger;
    const out = grocer(ledger).id;
    const into = ledger?.transactions.find(
      (row) => row.amount > 0 && row.account === 'hnb-lkr',
    )?.id;
    if (!into) throw new Error('fixture credit missing');
    await sendJson(port, '/api/decisions', 'POST', { type: 'not-transfer', txn: out });
    const reply = await sendJson(port, '/api/decisions', 'POST', { type: 'pair', out, in: into });
    expect(body<{ replaced: Array<{ type: string }> }>(reply).replaced).toEqual([
      expect.objectContaining({ type: 'not-transfer', txn: out }),
    ]);
    const saved = readFileSync(file('decisions.yaml'), 'utf8');
    expect(saved).toContain('type: pair');
    expect(saved).not.toContain('type: not-transfer');
  });

  it('lists answers with the unused ones marked', async () => {
    const { port } = await start();
    const missing: DecisionContent = { type: 'set', txn: 'gone', category: 'Rent' };
    await sendJson(port, '/api/decisions', 'POST', missing);
    const listed = body<{ decisions: Array<{ id: string }>; unused: string[] }>(
      await send(port, '/api/decisions'),
    );
    expect(listed.decisions.map((decision) => decision.id)).toEqual([decisionId(missing)]);
    expect(listed.unused).toEqual([decisionId(missing)]);
  });

  it('removes an answer and the automatic result comes back', async () => {
    const { app, port } = await start();
    const before = grocer(app.state().ledger).category;
    const content: DecisionContent = {
      type: 'set',
      txn: grocer(app.state().ledger).id,
      kind: 'spending',
      category: 'Groceries',
    };
    await sendJson(port, '/api/decisions', 'POST', content);
    const removed = await send(port, `/api/decisions/${decisionId(content)}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect(grocer(app.state().ledger).category).toBe(before);
    expect(
      (await send(port, `/api/decisions/${decisionId(content)}`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  it('rejects bad answers and wrong bodies', async () => {
    const { port } = await start();
    expect((await sendJson(port, '/api/decisions', 'POST', { type: 'nope' })).status).toBe(400);
    const plain = await send(port, '/api/decisions', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'text/plain' },
    });
    expect(plain.status).toBe(415);
    const big = await send(port, '/api/decisions', {
      method: 'POST',
      body: 'x'.repeat(70000),
      headers: { 'content-type': 'application/json' },
    });
    expect(big.status).toBe(413);
    expect(big.headers.connection).toBe('close');
    const broken = await send(port, '/api/decisions', {
      method: 'POST',
      body: '{"type":',
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    expect(broken.status).toBe(400);
    expect((await sendJson(port, '/api/decisions', 'PUT', {})).status).toBe(405);
    expect((await sendJson(port, '/api/ledger', 'POST', {})).status).toBe(405);
    expect((await send(port, '/api/nothing-here', { method: 'POST' })).status).toBe(404);
  });

  it('refuses to write when a data file has errors', async () => {
    const { port, file } = await start();
    writeFileSync(file('decisions.yaml'), '- id: a\n  at: x\n  type: nope\n');
    const answers = await sendJson(port, '/api/decisions', 'POST', { type: 'dismiss', item: 'n' });
    expect(answers.status).toBe(409);
    expect(readFileSync(file('decisions.yaml'), 'utf8')).toBe('- id: a\n  at: x\n  type: nope\n');
    const config = readFileSync(file('config.yaml'), 'utf8');
    writeFileSync(file('config.yaml'), config.replace('homeCurrency: LKR', 'homeCurrency: lkr'));
    const broken = readFileSync(file('config.yaml'), 'utf8');
    const account = await sendJson(port, '/api/config/accounts', 'POST', {
      id: 'boc-main',
      name: 'X',
    });
    expect(account.status).toBe(409);
    expect(readFileSync(file('config.yaml'), 'utf8')).toBe(broken);
  });

  it("checks the token and the request's origin before anything else", async () => {
    const { port } = await start();
    expect((await send(port, '/api/decisions', { method: 'PUT', token: false })).status).toBe(401);
    expect(
      (
        await sendJson(
          port,
          '/api/decisions',
          'POST',
          { type: 'dismiss', item: 'n' },
          {
            'sec-fetch-site': 'cross-site',
          },
        )
      ).status,
    ).toBe(403);
    const foreign = await send(port, '/api/decisions', {
      method: 'POST',
      setHost: false,
      headers: { host: 'evil.example', 'content-type': 'application/json' },
      body: '{"type":"dismiss","item":"n"}',
    });
    expect(foreign.status).toBe(403);
  });
});

describe('config edits', () => {
  it('adds deposit details and a rule to config.yaml', async () => {
    const { app, port, file } = await start();
    writeFileSync(
      file('config.yaml'),
      `# kept by hand\n${readFileSync(file('config.yaml'), 'utf8')}`,
    );
    const deposit = app
      .state()
      .ledger?.accounts.find((account) => account.type === 'fixed-deposit');
    if (!deposit?.number) throw new Error('fixture deposit missing');
    const saved = await sendJson(port, '/api/config/accounts', 'POST', {
      id: deposit.id,
      name: 'Twelve-month deposit',
      bank: deposit.bank,
      type: 'fixed-deposit',
      currency: deposit.currency,
      number: deposit.number,
      deposit: { months: 12, rate: 9 },
    });
    expect(saved.status).toBe(200);
    const rule = await sendJson(port, '/api/config/rules', 'POST', {
      match: 'GROCER',
      category: 'Groceries',
      direction: 'out',
    });
    expect(rule.status).toBe(200);
    const text = readFileSync(file('config.yaml'), 'utf8');
    expect(text).toContain('# kept by hand');
    const ledger = app.state().ledger;
    expect(ledger?.accounts.find((account) => account.id === deposit.id)).toMatchObject({
      name: 'Twelve-month deposit',
      deposit: { months: 12, rate: 9 },
    });
    expect(grocer(ledger).category).toBe('Groceries');
  });

  it('refuses a config edit that would not load', async () => {
    const { port } = await start();
    const reply = await sendJson(port, '/api/config/rules', 'POST', { match: 'ab' });
    expect(reply.status).toBe(400);
    expect(body<{ errors: string[] }>(reply).errors).toEqual([
      'rules: the text to match needs at least 3 characters',
    ]);
  });
});
