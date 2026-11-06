// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { Transfers } from '../src/pages/Transfers';

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

const ledger = loadWorld();

function show(query?: Record<string, string>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <Transfers
        ledger={ledger}
        status={{} as Status}
        tidy={[]}
        route={query ? { page: 'transfers', query } : { page: 'transfers' }}
        range={{ from: '2026-01-01', to: '2026-02-20' }}
        rangeLabel="All"
      />,
    ),
  );
  return host;
}

function type(page: HTMLElement, text: string): void {
  const input = page.querySelector<HTMLInputElement>('input[aria-label="Search transfers"]');
  if (!input) throw new Error('no search box');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Transfers', () => {
  it('links each pair of accounts to its own list', () => {
    const page = show();
    const link = [...page.querySelectorAll('a')].find((a) => a.textContent === 'BOC Main');
    expect(link?.getAttribute('href')).toBe('#/transfers?pair=boc-main%7Ccb-savings');
  });

  it('lists only the chosen pair and says which', () => {
    const page = show({ pair: 'boc-main|cb-savings' });
    expect(page.textContent).toContain('BOC Main to ComBank Savings');
    expect(page.textContent).toContain('All (1)');
  });

  it('opens a transfer to show both sides and why they were paired', () => {
    const page = show({ pair: 'boc-main|cb-savings' });
    act(() => page.querySelector<HTMLButtonElement>('button[aria-label="Show details"]')?.click());
    expect(page.textContent).toContain('CEFT-OWN TRANSFER');
    expect(page.textContent).toContain('own / O0000000001');
    expect(page.textContent).toContain('the amounts differ by a known bank fee');
    expect(page.textContent).toContain('The bank kept 25.00 LKR as a fee.');
  });

  it('narrows the list as you search', () => {
    const page = show();
    expect(page.textContent).toContain('All (4)');
    type(page, 'aml');
    expect(page.textContent).toContain('All (1)');
  });
});
