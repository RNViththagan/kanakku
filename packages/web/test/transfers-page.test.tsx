// @vitest-environment happy-dom
import { decisionId, type Ledger, type NeedsItem, type Transaction } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { Transfers } from '../src/pages/Transfers';
import { button, choose, click, stubSaves } from './helpers/dom';

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
  const flagged = (asked: Transaction[], rows: Transaction[] = picked): Ledger => ({
    ...ledger,
    transactions: ledger.transactions.map((row) =>
      rows.some((item) => item.id === row.id) ? { ...row, flag: 'possible' as const } : row,
    ),
    needs: [...ledger.needs, ...asked.map(need)],
  });
  const choices = (page: HTMLElement) =>
    [...page.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(
      (box) =>
        box.getAttribute('aria-label')?.startsWith('Choose ') &&
        box.getAttribute('aria-label') !== 'Choose all',
    );

  it('marks the checked rows as not transfers', async () => {
    expect(picked).toHaveLength(2);
    const saves = stubSaves();
    const page = show(undefined, flagged(picked));
    const boxes = choices(page);
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

  it('puts the category only on checked rows going its way', async () => {
    const incoming = ledger.transactions.find(
      (row) => row.account === 'boc-main' && row.amount > 0 && row.transfer === undefined,
    );
    const [outgoing] = picked;
    if (!incoming || !outgoing) throw new Error('fixture rows missing');
    expect(ledger.categories.spending).toContain('Rent');
    const saves = stubSaves();
    const both = [outgoing, incoming];
    const page = show(undefined, flagged(both, both));
    for (const box of choices(page)) await click(box);
    await choose('Their category', 'Rent');
    expect(page.textContent).toContain(
      'Rent is a spending category, so it is left off the incoming row.',
    );
    await click(button('Save'));
    expect(saves.bodies()[0]).toEqual(
      expect.arrayContaining([
        { type: 'not-transfer', txn: outgoing.id },
        { type: 'set', txn: outgoing.id, kind: 'spending', category: 'Rent' },
        { type: 'not-transfer', txn: incoming.id },
      ]),
    );
    expect(saves.bodies()[0]).toHaveLength(3);
  });

  it('moves a dismissed possible transfer out of the Needs you tab', () => {
    const page = show(undefined, flagged(picked.slice(0, 1)));
    expect(page.textContent).toContain('Needs you (1)');
  });
});

describe('fixing transfers', () => {
  const matched = ledger.transfers.find(
    (transfer) => transfer.from === 'boc-main' && transfer.to === 'cb-savings',
  );
  if (!matched?.out || !matched.in) throw new Error('fixture transfer missing');
  const { out, in: into } = matched;
  const open = async (pair: string, given: Ledger = ledger) => {
    const page = show({ pair }, given);
    await click(
      page.querySelector<HTMLButtonElement>(
        'button[aria-label="Show details"]',
      ) as HTMLButtonElement,
    );
    return page;
  };

  it('undoes a pairing you made', async () => {
    const saves = stubSaves(204, '');
    const answered: Ledger = {
      ...ledger,
      transfers: ledger.transfers.map((transfer) =>
        transfer.id === matched.id
          ? { ...transfer, rule: 'answer' as const, status: 'confirmed' as const }
          : transfer,
      ),
    };
    await open('boc-main|cb-savings', answered);
    await click(button('Undo'));
    expect(saves.fetch.mock.calls[0]?.[0]).toBe(
      `/api/decisions/${decisionId({ type: 'pair', out, in: into })}`,
    );
    expect(saves.fetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('fixes a wrong automatic pair', async () => {
    const saves = stubSaves();
    await open('boc-main|cb-savings');
    await click(button('Wrong pair'));
    expect(saves.bodies()).toEqual([[{ type: 'not-transfer', txn: out, with: into }]]);
  });

  it('says an automatic match is not a transfer for both rows', async () => {
    const saves = stubSaves();
    await open('boc-main|cb-savings');
    await click(button('Not a transfer'));
    expect(saves.bodies()).toEqual([
      [
        { type: 'not-transfer', txn: out },
        { type: 'not-transfer', txn: into },
      ],
    ]);
  });

  it('offers no undo on a deposit transfer', async () => {
    stubSaves();
    const page = await open('cb-savings|deposits:combank');
    expect(page.textContent).toContain('Deposit transfers come from the bank text.');
    const labels = [...document.body.querySelectorAll('button')].map((item) => item.textContent);
    expect(labels).not.toContain('Undo');
    expect(labels).not.toContain('Not a transfer');
  });
});
