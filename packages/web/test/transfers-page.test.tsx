// @vitest-environment happy-dom
import type { Ledger, NeedsItem, Transaction } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { Transfers } from '../src/pages/Transfers';
import { button, click, stubSaves } from './helpers/dom';

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
  vi.unstubAllGlobals();
});

const ledger = loadWorld();

function show(query?: Record<string, string>, given: Ledger = ledger): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <Transfers
        ledger={given}
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

  it('still names the accounts when the chosen pair has nothing in this range', () => {
    const page = show({ pair: 'boc-main|hnb-usd' });
    expect(page.textContent).toContain('BOC Main to HNB USD');
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

describe('answering possible transfers', () => {
  const picked = ledger.transactions
    .filter((row) => row.account === 'boc-main' && row.amount < 0 && row.transfer === undefined)
    .slice(0, 2);
  const need = (row: Transaction): NeedsItem => ({
    id: `need-${row.id}`,
    type: 'possible-transfer',
    message: 'Was it a transfer to one of your accounts?',
    severity: 'normal',
    refs: { account: row.account, txns: [row.id], date: row.date },
    actions: [],
  });
  const flagged = (asked: Transaction[]): Ledger => ({
    ...ledger,
    transactions: ledger.transactions.map((row) =>
      picked.some((item) => item.id === row.id) ? { ...row, flag: 'possible' as const } : row,
    ),
    needs: [...ledger.needs, ...asked.map(need)],
  });

  it('marks the checked rows as not transfers', async () => {
    expect(picked).toHaveLength(2);
    const saves = stubSaves();
    const page = show(undefined, flagged(picked));
    const boxes = [...page.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(
      (box) =>
        box.getAttribute('aria-label')?.startsWith('Choose ') &&
        box.getAttribute('aria-label') !== 'Choose all',
    );
    expect(boxes).toHaveLength(2);
    for (const box of boxes) await click(box);
    expect(page.textContent).toContain('Mark 2 as not transfers');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([
      expect.arrayContaining(picked.map((row) => ({ type: 'not-transfer', txn: row.id }))),
    ]);
    expect(saves.bodies()[0]).toHaveLength(2);
    expect(page.textContent).toContain('2 saved');
  });

  it('moves a dismissed possible transfer out of the Needs you tab', () => {
    const page = show(undefined, flagged(picked.slice(0, 1)));
    expect(page.textContent).toContain('Needs you (1)');
  });
});
