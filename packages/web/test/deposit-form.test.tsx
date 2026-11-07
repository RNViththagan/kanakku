// @vitest-environment happy-dom
import type { Account, Ledger } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DepositForm } from '../src/DepositForm';
import { type DepositRow, depositRows } from '../src/tables';
import { asPool, depositWorld } from './helpers/deposits';
import { button, click, stubSaves, typeInto } from './helpers/dom';

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

const later = depositWorld();
const old: Account = {
  id: 'fd-old',
  name: 'Old deposit',
  bank: 'combank',
  type: 'fixed-deposit',
  currency: 'LKR',
  number: '003000000777',
  deposit: { principal: 50000000, start: '2025-12-01' },
};
const nameless: Account = { ...old, id: 'fd-nameless', name: 'No number' };
delete nameless.number;
const withOld: Ledger = {
  ...later,
  accounts: [...later.accounts, old, nameless],
  depositMoves: [
    ...later.depositMoves,
    { account: 'fd-old', date: '2025-12-01', amount: 50000000 },
    { account: 'fd-nameless', date: '2025-12-01', amount: 50000000 },
  ],
};
const rows = depositRows(withOld);
const rowOf = (id: string): DepositRow => {
  const found = rows.find((row) => row.account.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};

function show(row: DepositRow, returnedOn?: string): void {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <DepositForm
        ledger={withOld}
        row={row}
        onClose={() => {}}
        {...(returnedOn ? { returnedOn } : {})}
      />,
    ),
  );
}

const field = (label: string) =>
  document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

describe('DepositForm', () => {
  it('saves the term without a principal for a deposit placed in the statements', async () => {
    const saves = stubSaves(200, {});
    show(rowOf('deposit-combank-3088888888'));
    expect(field('Principal')).toBeNull();
    await typeInto('Months', '3');
    await typeInto('Yearly rate', '8');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([
      {
        id: 'deposit-combank-3088888888',
        name: 'Deposit 003088888888',
        bank: 'combank',
        type: 'fixed-deposit',
        currency: 'LKR',
        number: '003088888888',
        deposit: { start: '2026-03-02', months: 3, rate: 8 },
      },
    ]);
    expect(saves.fetch.mock.calls[0]?.[0]).toBe('/api/config/accounts');
  });

  it('asks for the principal of a deposit older than the statements, and converts it to normal units', async () => {
    const saves = stubSaves(200, {});
    show(rowOf('fd-old'));
    expect(field('Principal')?.value).toBe('500000');
    await typeInto('Principal', '600000');
    await typeInto('Months', '12');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([
      { id: 'fd-old', deposit: { start: '2025-12-01', months: 12, principal: 600000 } },
    ]);
  });

  it('asks for the number first when the deposit has none', () => {
    show(rowOf('fd-nameless'));
    expect(document.body.textContent).toContain("Add this deposit's number to config.yaml first.");
    expect(field('Principal')).toBeNull();
  });

  it('keeps the term of deposits without a number out of config', async () => {
    const pool = depositRows(asPool(later, 'deposit-combank-3088888888')).find(
      (row) => row.account.id === 'deposit-combank-3088888888',
    );
    if (!pool) throw new Error('no pool row');
    show(pool);
    await typeInto('Months', '12');
    expect(document.body.textContent).toContain(
      "These deposits have no number in the statements, so Kanakku can't keep their term.",
    );
    expect(button('Save').disabled).toBe(true);
  });

  it('refuses a start after the return date', async () => {
    show(rowOf('fd-old'), '2025-11-30');
    await typeInto('Months', '1');
    expect(document.body.textContent).toContain('The start must be on or before Nov 30, 2025.');
    expect(button('Save').disabled).toBe(true);
  });

  it('counts a deposit as placed only through a deposit transfer', () => {
    expect(rowOf('deposit-combank-3088888888').placed).toBe(true);
    expect(rowOf('fd-old').placed).toBe(false);
  });

  it('sends only the deposit for an account already in config', async () => {
    const saves = stubSaves(200, {});
    show(rowOf('fd-old'));
    await typeInto('Months', '6');
    await click(button('Save'));
    expect(Object.keys(saves.bodies()[0] ?? {})).toEqual(['id', 'deposit']);
  });

  it('shows the maturity before saving', async () => {
    show(rowOf('deposit-combank-3088888888'));
    await typeInto('Months', '3');
    expect(document.body.textContent).toContain('Matures on Jun 2, 2026');
  });

  it('refuses months that are not a whole number above 0', async () => {
    show(rowOf('deposit-combank-3088888888'));
    for (const months of ['0', '1.5', '-2']) {
      await typeInto('Months', months);
      expect(document.body.textContent).toContain('Months must be a whole number above 0.');
      expect(button('Save').disabled).toBe(true);
    }
  });
});
