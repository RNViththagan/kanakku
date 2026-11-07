// @vitest-environment happy-dom
import type { Config, Ledger } from '@kanakku/core';
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld, worldConfig } from '../../core/test/helpers/world';
import { matchCount, ruleSorts, takenEarlier } from '../src/answers';
import type { Status } from '../src/api';
import { THEMES } from '../src/appearance';
import { Settings } from '../src/pages/Settings';
import { button, choose, click, typeInto } from './helpers/dom';
import { type Answer, fakeServer } from './helpers/server';

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const ledger: Ledger = loadWorld();
const config = worldConfig();
const STALE = 'The rules changed since this list loaded. It has been refreshed, so try again.';

function serve(given: Config = config, extra: Record<string, Answer> = {}) {
  return fakeServer({
    'GET /api/config': { body: { config: given, errors: [] } },
    'GET /api/decisions': { body: { decisions: [], unused: [] } },
    'POST /api/config/rules': { body: {} },
    'PUT /api/config/rules/1': { body: {} },
    'POST /api/config/rules/0/remove': { body: {} },
    'POST /api/config/rules/1/move': { body: {} },
    'POST /api/config/categories': { body: {} },
    'POST /api/config/categories/remove': { body: {} },
    ...extra,
  });
}

async function show(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <OxygenUIThemeProvider themes={THEMES} initialTheme="acrylic-purple">
        <Settings
          ledger={ledger}
          status={{} as Status}
          tidy={[]}
          route={{ page: 'settings' }}
          range={{ from: '2026-01-01', to: '2026-02-20' }}
          rangeLabel="All"
        />
      </OxygenUIThemeProvider>,
    );
  });
  return host;
}

const labelled = (label: string) => {
  const found = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};

describe('rule counts', () => {
  it('counts a rule over its account and amount limits too', () => {
    const all = matchCount(ledger, { match: { text: 'POS' } });
    expect(all).toBe(2);
    expect(matchCount(ledger, { match: { text: 'POS' }, account: 'cb-savings' })).toBe(0);
    expect(matchCount(ledger, { match: { text: 'POS' }, min: '3600' })).toBeLessThan(all);
    expect(ruleSorts(ledger, 0)).toBe(1);
    expect(takenEarlier(ledger, { match: { text: 'SLIPS' } })).toBe(1);
    expect(takenEarlier(ledger, { match: { text: 'SLIPS' } }, 0)).toBe(0);
  });
});

describe('Settings rules', () => {
  it('lists rules in order with how many each sorts', async () => {
    serve();
    const text = (await show()).textContent ?? '';
    expect(text).toContain('Text contains SLIPS IN - ACME: Salary');
    expect(text).toContain('Text contains Rent: Rent');
    expect(text.indexOf('SLIPS IN - ACME: Salary')).toBeLessThan(text.indexOf('Rent: Rent'));
    expect(text.split('Sorts 1 transaction')).toHaveLength(3);
  });

  it('adds a rule with a live count', async () => {
    const server = serve();
    await show();
    await click(button('Add a rule'));
    await typeInto('When the text contains', 'GROCER');
    await choose('Category', 'Groceries');
    expect(document.body.textContent).toContain('Matches 1 transaction');
    await click(button('Save'));
    expect(server.sent('POST', '/api/config/rules')).toEqual([
      { match: 'GROCER', kind: 'spending', category: 'Groceries' },
    ]);
  });

  it('says how many an earlier rule already sorts', async () => {
    serve();
    await show();
    await click(button('Add a rule'));
    await typeInto('When the text contains', 'SLIPS');
    await choose('Category', 'Other income');
    expect(document.body.textContent).toContain('1 of them is already sorted by an earlier rule');
  });

  it('refuses a rule that would take transfers', async () => {
    serve();
    await show();
    await click(button('Add a rule'));
    await typeInto('When the text contains', 'TRF TO');
    await choose('Category', 'Groceries');
    expect(document.body.textContent).toContain('This would also take 1 transfer');
    expect(button('Save').disabled).toBe(true);
  });

  it("edits a rule's category and sends its kind", async () => {
    const server = serve();
    await show();
    await click(labelled('Edit rule 2'));
    await choose('Category', 'Bills');
    await click(button('Save'));
    const [sent] = server.sent('PUT', '/api/config/rules/1');
    expect(sent.expect).toEqual(config.rules[1]);
    expect(sent.change).toMatchObject({ match: 'Rent', kind: 'spending', category: 'Bills' });
  });

  it('moves a rule up', async () => {
    const server = serve();
    await show();
    await click(labelled('Move rule 2 up'));
    expect(server.sent('POST', '/api/config/rules/1/move')).toEqual([
      { expect: config.rules[1], to: 0 },
    ]);
    const configReads = server.fetch.mock.calls.filter(([path]) => path === '/api/config');
    expect(configReads.length).toBeGreaterThanOrEqual(2);
  });

  it('removes a rule after asking', async () => {
    const server = serve();
    await show();
    await click(labelled('Remove rule 1'));
    expect(server.sent('POST', '/api/config/rules/0/remove')).toEqual([]);
    await click(button('Remove it'));
    expect(server.sent('POST', '/api/config/rules/0/remove')).toEqual([
      { expect: config.rules[0] },
    ]);
  });

  it('shows a refreshed list after a rule changed by hand', async () => {
    const server = serve(config, {
      'POST /api/config/rules/1/move': { status: 409, body: { errors: [STALE] } },
    });
    const page = await show();
    const before = server.fetch.mock.calls.filter(([path]) => path === '/api/config').length;
    await click(labelled('Move rule 2 up'));
    expect(page.textContent).toContain(STALE);
    expect(server.fetch.mock.calls.filter(([path]) => path === '/api/config').length).toBe(
      before + 1,
    );
  });

  it("keeps a pattern rule's pattern read-only", async () => {
    serve({
      ...config,
      rules: [...config.rules, { match: { regex: 'GROCER|MARKET' }, category: 'Groceries' }],
    });
    await show();
    await click(labelled('Edit rule 3'));
    expect(document.body.textContent).toContain('Pattern GROCER|MARKET');
    expect(document.body.querySelector('input[aria-label="When the text contains"]')).toBeNull();
  });
});

describe('Settings categories', () => {
  it('adds a spending category, and removes an unused one', async () => {
    const server = serve();
    await show();
    await choose('Kind of category', 'spending');
    await typeInto('New category', 'Pets');
    await click(button('Add a category'));
    expect(server.sent('POST', '/api/config/categories')).toEqual([
      { kind: 'spending', name: 'Pets' },
    ]);
    expect(document.body.querySelector('[aria-label="Remove Fees"]')).toBeNull();
    expect(document.body.querySelector('[aria-label="Remove Rent"]')).toBeNull();
    await click(labelled('Remove Travel'));
    expect(server.sent('POST', '/api/config/categories/remove')).toEqual([{ name: 'Travel' }]);
  });
});
