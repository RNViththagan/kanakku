// @vitest-environment happy-dom
import type { Ledger } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Status } from '../src/api';
import { NetWorth } from '../src/pages/NetWorth';
import { depositWorld } from './helpers/deposits';

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const world = depositWorld();

function show(ledger: Ledger = world): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <NetWorth
        ledger={ledger}
        status={{} as Status}
        tidy={[]}
        route={{ page: 'net-worth' }}
        range={{ from: '2026-01-01', to: ledger.today }}
        rangeLabel="All"
      />,
    ),
  );
  return host;
}

function section(page: HTMLElement, title: string): HTMLElement {
  const heading = [...page.querySelectorAll('h6')].find((item) => item.textContent === title);
  const card = heading?.closest<HTMLElement>('.MuiCard-root');
  if (!card) throw new Error(`no ${title} section`);
  return card;
}

function link(card: HTMLElement, text: string): HTMLAnchorElement | undefined {
  return [...card.querySelectorAll('a')].find((item) => item.textContent === text);
}

describe('NetWorth deposits', () => {
  it('says how each withdrawn deposit ended and links to what replaced it', () => {
    const withdrawn = section(show(), 'Withdrawn fixed deposits');
    expect(withdrawn.textContent).toContain('Matured after 1 month');
    expect(withdrawn.textContent).toContain('Broken early');
    expect(withdrawn.textContent).toContain('Replaced by …8888');
    expect(link(withdrawn, '…8888')?.getAttribute('href')).toBe(
      '#/account/deposit-combank-3088888888',
    );
    expect(link(withdrawn, '…8888')?.getAttribute('aria-label')).toBe('Deposit 003088888888');
  });

  it('says so when it cannot tell how a deposit ended', () => {
    const unsure: Ledger = {
      ...world,
      depositEndings: world.depositEndings.map((ending) =>
        ending.account === 'deposit-combank-3077777777'
          ? { ...ending, how: 'unknown' as const }
          : ending,
      ),
    };
    expect(section(show(unsure), 'Withdrawn fixed deposits').textContent).toContain('Not known');
  });

  it('shows when an active deposit can mature at the earliest and what it replaced', () => {
    const active = section(show(), 'Active fixed deposits');
    expect(active.textContent).toContain('Apr 2, 2026 at the earliest');
    expect(active.textContent).toContain('Replaces …9999');
    expect(link(active, '…9999')?.getAttribute('href')).toBe(
      '#/account/deposit-combank-3099999999',
    );
    expect(
      [...active.querySelectorAll('button')].some((item) => item.textContent === 'Set the term'),
    ).toBe(true);
  });

  it('opens the term form from Term not set', async () => {
    const page = show({ ...world, coverage: {} });
    const open = [...section(page, 'Active fixed deposits').querySelectorAll('button')].find(
      (item) => item.textContent === 'Term not set',
    );
    if (!open) throw new Error('no Term not set button');
    await act(async () => open.click());
    expect(document.body.querySelector('input[aria-label="Months"]')).not.toBeNull();
  });

  it('says a deposit may already have matured once that date has passed', () => {
    const active = section(show({ ...world, today: '2026-04-10' }), 'Active fixed deposits');
    expect(active.textContent).toContain('May have matured on Apr 2, 2026');
  });
});
