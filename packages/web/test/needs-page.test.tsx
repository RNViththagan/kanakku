// @vitest-environment happy-dom
import {
  type Account,
  type Decision,
  type DecisionContent,
  decisionId,
  type Ledger,
  type NeedsItem,
} from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { Needs } from '../src/pages/Needs';
import { asPool, depositWorld } from './helpers/deposits';
import { button, click, typeInto } from './helpers/dom';

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const ledger = loadWorld();
const grocer = ledger.transactions.find((row) => row.description.startsWith('POS       GROCER'));
if (!grocer) throw new Error('fixture row missing');

const saved = (content: DecisionContent, at: string) =>
  ({ id: decisionId(content), at, ...content }) as Decision;
const sorted = saved(
  { type: 'set', txn: grocer.id, kind: 'spending', category: 'Groceries' },
  '2026-02-01T10:00:00.000Z',
);
const gone = saved({ type: 'set', txn: 'gone', category: 'Rent' }, '2026-02-02T10:00:00.000Z');

function serveAnswers() {
  const fetch = vi.fn(async (_path: string, init?: RequestInit) =>
    init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ decisions: [sorted, gone], unused: [gone.id] }), {
          status: 200,
        }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function show(given: Ledger = ledger): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <Needs
        ledger={given}
        status={{} as Status}
        tidy={[]}
        route={{ page: 'needs' }}
        range={{ from: '2026-01-01', to: '2026-02-20' }}
        rangeLabel="All"
      />,
    );
  });
  return host;
}

describe('Your answers', () => {
  it('lists your answers with the unused ones marked', async () => {
    serveAnswers();
    const page = await show();
    const text = page.textContent ?? '';
    expect(text).toContain('Your answers');
    expect(text).toContain('is spending: Groceries.');
    expect(text.indexOf('no longer in your statements')).toBeLessThan(
      text.indexOf('is spending: Groceries.'),
    );
    expect(text.split('No longer matches anything')).toHaveLength(2);
  });

  it('undoes an answer from the list', async () => {
    const fetch = serveAnswers();
    const page = await show();
    const undo = [...page.querySelectorAll<HTMLButtonElement>('button')].filter(
      (item) => item.textContent === 'Undo',
    );
    expect(undo).toHaveLength(2);
    await click(undo[1] as HTMLButtonElement);
    const removal = fetch.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(removal?.[0]).toBe(`/api/decisions/${sorted.id}`);
  });
});

describe('answering Needs you', () => {
  const item = (fields: Partial<NeedsItem> & Pick<NeedsItem, 'id' | 'type'>): NeedsItem => ({
    message: `About ${fields.id}`,
    severity: 'normal',
    refs: {},
    actions: [],
    ...fields,
  });
  const only = (needs: NeedsItem[], base: Ledger = ledger): Ledger => ({ ...base, needs });

  function serve() {
    const fetch = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ decisions: [], replaced: [] }), { status: 200 })
        : new Response(JSON.stringify({ decisions: [], unused: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    return () =>
      fetch.mock.calls
        .filter(([, init]) => init?.method === 'POST')
        .map(([path, init]) => [path, JSON.parse(String(init?.body))]);
  }

  it('dismisses an item', async () => {
    const posted = serve();
    await show(only([item({ id: 'n-card', type: 'card-due' })]));
    await click(button('Dismiss'));
    expect(posted()).toEqual([['/api/decisions', [{ type: 'dismiss', item: 'n-card' }]]]);
  });

  it('offers no dismiss where the item would come back', async () => {
    serve();
    const page = await show(
      only([
        item({ id: 'n-u', type: 'uncategorised' }),
        item({ id: 'n-t', type: 'tidy' }),
        item({ id: 'n-b', type: 'bad-rows' }),
      ]),
    );
    expect([...page.querySelectorAll('button')].map((each) => each.textContent)).not.toContain(
      'Dismiss',
    );
  });

  it('answers a counterparty as not mine', async () => {
    const posted = serve();
    await show(only([item({ id: 'n-c', type: 'counterparty', data: { text: 'SAVER PLUS' } })]));
    await click(button('Not mine'));
    expect(posted()).toEqual([
      ['/api/decisions', [{ type: 'counterparty', text: 'SAVER PLUS', mine: false }]],
    ]);
  });

  it('saves a deposit principal as decimal text', async () => {
    const posted = serve();
    await show(
      only([
        item({
          id: 'n-p',
          type: 'deposit-principal',
          refs: { account: 'deposit-hnb-900000000025' },
        }),
      ]),
    );
    await typeInto('Principal of deposit-hnb-900000000025', '2,000.00');
    await click(button('Add principal'));
    expect(posted()).toEqual([
      [
        '/api/decisions',
        [{ type: 'fd-principal', deposit: 'deposit-hnb-900000000025', principal: '2000.00' }],
      ],
    ]);
  });

  it('asks for start and principal for a deposit older than the statements', async () => {
    serve();
    const world = depositWorld();
    const old: Account = {
      id: 'fd-old',
      name: 'Old deposit',
      bank: 'combank',
      type: 'fixed-deposit',
      currency: 'LKR',
      number: '003000000777',
      deposit: { principal: 50000000, start: '2025-12-01' },
    };
    const withOld: Ledger = {
      ...world,
      accounts: [...world.accounts, old],
      depositMoves: [
        ...world.depositMoves,
        { account: 'fd-old', date: '2025-12-01', amount: 50000000 },
      ],
    };
    await show(
      only(
        [
          item({
            id: 'n-d',
            type: 'deposit-before-statements',
            refs: { account: 'fd-old', date: '2026-03-09' },
          }),
        ],
        withOld,
      ),
    );
    await click(button('Add start and principal'));
    expect(document.body.querySelector('input[aria-label="Principal"]')).not.toBeNull();
    expect(document.body.querySelector('input[aria-label="Start"]')).not.toBeNull();
  });

  it('offers no term for deposits without a number', async () => {
    serve();
    const account = 'deposit-combank-3088888888';
    await show(
      only(
        [
          item({ id: 'n-t', type: 'deposit-details', refs: { account } }),
          item({
            id: 'n-b',
            type: 'deposit-before-statements',
            refs: { account, date: '2026-03-09' },
          }),
        ],
        asPool(depositWorld(), account),
      ),
    );
    const labels = [...document.body.querySelectorAll('button')].map((item) => item.textContent);
    expect(labels).not.toContain('Set the term');
    expect(labels).not.toContain('Add start and principal');
  });

  it('links uncategorised spending to the Cash flow drill-down', async () => {
    serve();
    const page = await show(only([item({ id: 'n-u', type: 'uncategorised' })]));
    const link = [...page.querySelectorAll('a')].find(
      (each) => each.textContent === 'Sort them in Cash flow',
    );
    expect(link?.getAttribute('href')).toBe('#/cash-flow?flow=spending%3AUncategorised');
  });

  it('links an item to its account', async () => {
    serve();
    const page = await show(
      only([item({ id: 'n-a', type: 'card-due', refs: { account: 'boc-main' } })]),
    );
    const link = [...page.querySelectorAll('a')].find((each) => each.textContent === 'Show');
    expect(link?.getAttribute('href')).toBe('#/account/boc-main');
  });

  it('shows the first 20 of a long group', async () => {
    serve();
    const many = Array.from({ length: 25 }, (_, index) =>
      item({ id: `n-${index}`, type: 'card-due', message: `Card item ${index}` }),
    );
    const page = await show(only(many));
    expect(page.textContent).toContain('Card item 19');
    expect(page.textContent).not.toContain('Card item 20');
    await click(button('Show all 25'));
    expect(page.textContent).toContain('Card item 24');
  });
});
