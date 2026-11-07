// @vitest-environment happy-dom
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

const ledger = depositWorld();

function show(): HTMLElement {
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
        range={{ from: '2026-01-01', to: '2026-03-20' }}
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

function link(card: HTMLElement, text: string): string | null | undefined {
  return [...card.querySelectorAll('a')]
    .find((item) => item.textContent === text)
    ?.getAttribute('href');
}

describe('NetWorth deposits', () => {
  it('says how each withdrawn deposit ended and links to what replaced it', () => {
    const withdrawn = section(show(), 'Withdrawn fixed deposits');
    expect(withdrawn.textContent).toContain('Matured after 1 month');
    expect(withdrawn.textContent).toContain('Broken early');
    expect(withdrawn.textContent).toContain('Re-placed as …8888');
    expect(link(withdrawn, '…8888')).toBe('#/account/deposit-combank-3088888888');
  });

  it('shows when an active deposit can mature at the earliest and what it replaced', () => {
    const active = section(show(), 'Active fixed deposits');
    expect(active.textContent).toContain('Apr 2, 2026 at the earliest');
    expect(active.textContent).toContain('Replaced …9999');
    expect(link(active, '…9999')).toBe('#/account/deposit-combank-3099999999');
    expect(link(active, 'Set the term')).toBe('#/needs');
  });
});
