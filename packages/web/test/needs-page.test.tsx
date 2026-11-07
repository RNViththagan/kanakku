// @vitest-environment happy-dom
import { type Decision, type DecisionContent, decisionId } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { Needs } from '../src/pages/Needs';
import { click } from './helpers/dom';

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

async function show(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <Needs
        ledger={ledger}
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
