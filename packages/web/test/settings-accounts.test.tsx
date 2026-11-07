// @vitest-environment happy-dom
import type { Config, Ledger } from '@kanakku/core';
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld, worldConfig } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { THEMES } from '../src/appearance';
import { Settings } from '../src/pages/Settings';
import { asPool } from './helpers/deposits';
import { button, click, typeInto } from './helpers/dom';
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
const base = worldConfig();
const withLimit: Config = {
  ...base,
  accounts: base.accounts.map((account) =>
    account.card ? { ...account, card: { ...account.card, limit: 30000000 } } : account,
  ),
};

function serve(config: Config | null = withLimit, errors: unknown[] = []) {
  return fakeServer({
    'GET /api/config': { body: { config, errors } },
    'GET /api/decisions': { body: { decisions: [], unused: [] } },
    'POST /api/config/accounts': { body: {} },
  });
}

async function show(given: Ledger = ledger): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <OxygenUIThemeProvider themes={THEMES} initialTheme="acrylic-purple">
        <Settings
          ledger={given}
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

async function edit(page: HTMLElement, account: string): Promise<void> {
  const open = page.querySelector<HTMLButtonElement>(`button[aria-label="Edit ${account}"]`);
  if (!open) throw new Error(`no edit button for ${account}`);
  await click(open);
}

const field = (label: string) =>
  document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

describe('Settings accounts', () => {
  it('lists the accounts from config by bank', async () => {
    serve();
    const page = await show();
    const text = page.textContent ?? '';
    for (const name of ['Bank of Ceylon', 'Commercial Bank of Ceylon', 'Hatton National Bank']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('BOC Main');
    expect(text).toContain('0011111111');
  });

  it('renames an account', async () => {
    const server = serve();
    const page = await show();
    await edit(page, 'BOC Main');
    await typeInto('Name', 'Salary account');
    await click(button('Save'));
    expect(server.sent('POST', '/api/config/accounts')).toEqual([
      { id: 'boc-main', name: 'Salary account' },
    ]);
  });

  it('closes an account and reopens it', async () => {
    const server = serve();
    const page = await show();
    await edit(page, 'BOC Main');
    await typeInto('Closed', '2026-02-10');
    await click(button('Save'));
    root?.unmount();
    const closed: Config = {
      ...withLimit,
      accounts: withLimit.accounts.map((account) =>
        account.id === 'boc-main' ? { ...account, closed: '2026-02-10' } : account,
      ),
    };
    const again = serve(closed);
    const reopened = await show();
    await click(button('Show closed ones'));
    await edit(reopened, 'BOC Main');
    await typeInto('Closed', '');
    await click(button('Save'));
    expect(server.sent('POST', '/api/config/accounts')).toEqual([
      { id: 'boc-main', closed: '2026-02-10' },
    ]);
    expect(again.sent('POST', '/api/config/accounts')).toEqual([{ id: 'boc-main', closed: null }]);
  });

  it("sets a card's statement and due days", async () => {
    const server = serve();
    const page = await show();
    await edit(page, 'ComBank Card');
    await typeInto('Statement day', '6');
    await typeInto('Due day', '27');
    await click(button('Save'));
    expect(server.sent('POST', '/api/config/accounts')).toEqual([
      { id: 'cb-card', card: { statementDay: 6, dueDay: 27 } },
    ]);
  });

  it('shows and saves the limit in normal units', async () => {
    const server = serve();
    const page = await show();
    await edit(page, 'ComBank Card');
    expect(field('Limit')?.value).toBe('300000');
    await typeInto('Limit', '250000');
    await click(button('Save'));
    expect(server.sent('POST', '/api/config/accounts')).toEqual([
      { id: 'cb-card', card: { limit: 250000 } },
    ]);
  });

  it('refuses a closed date before the opened date', async () => {
    serve();
    const page = await show();
    await edit(page, 'BOC Main');
    await typeInto('Opened', '2026-03-01');
    await typeInto('Closed', '2026-02-01');
    expect(document.body.textContent).toContain(
      'The closed date must be on or after the opened date.',
    );
    expect(button('Save').disabled).toBe(true);
  });

  it('asks before clearing a number', async () => {
    const server = serve();
    const page = await show();
    await edit(page, 'BOC Main');
    expect(document.body.textContent).toContain('Kanakku matches statements by this number.');
    await typeInto('Number', '');
    await click(button('Save'));
    expect(server.sent('POST', '/api/config/accounts')).toEqual([]);
    expect(document.body.textContent).toContain('Without a number');
    await click(button('Clear the number'));
    expect(server.sent('POST', '/api/config/accounts')).toEqual([{ id: 'boc-main', number: null }]);
  });

  it('opens the term form for a deposit', async () => {
    serve();
    const page = await show();
    const open = page.querySelector<HTMLButtonElement>(
      'button[aria-label="Term and rate of Deposit 003099999999"]',
    );
    if (!open) throw new Error('no term button');
    await click(open);
    expect(field('Months')).not.toBeNull();
  });

  it('offers no term for deposits without a number', async () => {
    serve();
    const page = await show(asPool(ledger, 'deposit-combank-3099999999'));
    expect(page.textContent).toContain('Unnamed LKR deposits');
    expect(
      page.querySelector('button[aria-label="Term and rate of Unnamed LKR deposits"]'),
    ).toBeNull();
  });

  it('shows config errors instead of forms', async () => {
    serve(null, [{ line: 3, path: 'homeCurrency', message: 'must be a 3-letter code' }]);
    const page = await show();
    expect(page.textContent).toContain('config.yaml line 3, homeCurrency: must be a 3-letter code');
    expect(page.querySelector('button[aria-label^="Edit "]')).toBeNull();
  });
});
