// @vitest-environment happy-dom
import { type Config, type DecisionContent, decisionId, type Ledger } from '@kanakku/core';
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld, worldConfig } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { THEMES } from '../src/appearance';
import { Settings } from '../src/pages/Settings';
import { button, choose, click, typeInto } from './helpers/dom';
import { fakeServer } from './helpers/server';

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
const noRates: Config = { ...config, rates: { ...config.rates, manual: {} } };
const dismissed: DecisionContent = { type: 'dismiss', item: 'n1' };

function serve(given: Config = config) {
  return fakeServer({
    'GET /api/config': { body: { config: given, errors: [] } },
    'GET /api/decisions': {
      body: {
        decisions: [{ id: decisionId(dismissed), at: '2026-02-01T10:00:00.000Z', ...dismissed }],
        unused: [],
      },
    },
    'PUT /api/config/you': { body: {} },
    'PUT /api/config/general': { body: {} },
    'PUT /api/config/rates': { body: {} },
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

const mentions = (name: string) =>
  ledger.transactions.filter((row) => row.description.toLowerCase().includes(name.toLowerCase()))
    .length;

describe('Your names', () => {
  it('adds and removes one of your names', async () => {
    const server = serve();
    await show();
    await typeInto('Add a name', 'PERERA A');
    await click(button('Add the name'));
    const remove = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove A PERERA"]',
    );
    if (!remove) throw new Error('no remove button');
    await click(remove);
    expect(server.sent('PUT', '/api/config/you')).toEqual([
      { names: ['A PERERA', 'PERERA A'] },
      { names: [] },
    ]);
  });

  it('counts the transactions that mention each name', async () => {
    serve();
    const page = await show();
    const count = mentions('A PERERA');
    expect(page.textContent).toContain(
      `A PERERA, in ${count === 1 ? '1 transaction' : `${count} transactions`}`,
    );
    await typeInto('Add a name', 'acme');
    expect(page.textContent).toContain(`In ${mentions('acme')} transaction`);
  });

  it('refuses a name shorter than 3 characters', async () => {
    serve();
    const page = await show();
    await typeInto('Add a name', 'AB');
    expect(page.textContent).toContain('A name needs at least 3 characters.');
    expect(button('Add the name').disabled).toBe(true);
  });
});

describe('Currency and locale', () => {
  it('changes the locale and shows a sample', async () => {
    const server = serve();
    const page = await show();
    expect(page.textContent).toContain('1,234,567.89');
    await choose('Locale', 'en-GB');
    expect(server.sent('PUT', '/api/config/general')).toEqual([{ locale: 'en-GB' }]);
  });

  it('asks before changing the home currency', async () => {
    const server = serve(noRates);
    await show();
    await choose('Home currency', 'USD');
    expect(server.sent('PUT', '/api/config/general')).toEqual([]);
    expect(document.body.textContent).toContain('Every amount will be valued in USD. Change it?');
    await click(button('Change it'));
    expect(server.sent('PUT', '/api/config/general')).toEqual([{ homeCurrency: 'USD' }]);
  });

  it('offers no currency change while manual rates exist', async () => {
    serve();
    const page = await show();
    expect(
      page.querySelector<HTMLSelectElement>('select[aria-label="Home currency"]')?.disabled,
    ).toBe(true);
    expect(page.textContent).toContain('Clear the manual rates first, as they are in LKR.');
  });
});

function saveRate(): HTMLButtonElement {
  const found = document.body.querySelector<HTMLButtonElement>(
    'button[aria-label="Save the USD rate"]',
  );
  if (!found) throw new Error('no rate button');
  return found;
}

describe('Exchange rates', () => {
  it('sets and clears a manual rate', async () => {
    const server = serve();
    const page = await show();
    expect(page.textContent).toContain('Online rates come in a later version.');
    await typeInto('Rate for USD', '310.50');
    await click(saveRate());
    await typeInto('Rate for USD', '');
    await click(saveRate());
    expect(server.sent('PUT', '/api/config/rates')).toEqual([
      { manual: { USD: '310.50' } },
      { manual: { USD: null } },
    ]);
  });
});

describe('Your answers in Settings', () => {
  it('lists your answers in Settings', async () => {
    serve();
    const page = await show();
    expect(page.textContent).toContain('Your answers');
    expect(page.textContent).toContain('You hid an item in Needs you.');
  });
});
