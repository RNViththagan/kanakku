// @vitest-environment happy-dom
import type { Ledger, Transaction } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { TransferAnswer } from '../src/TransferAnswer';
import { button, choose, click, stubSaves } from './helpers/dom';

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

const world = loadWorld();
const found = world.transactions.find((row) => row.description.startsWith('POS       GROCER'));
const sample = world.transactions.find((row) => row.account === 'hnb-lkr');
if (!found || !sample) throw new Error('fixture rows missing');
const grocer: Transaction = found;
const credit: Transaction = {
  ...sample,
  id: 'hand-credit',
  date: '2026-01-07',
  amount: 350000,
  description: 'CEFT-A PERERA',
  kind: 'income',
  category: 'Other income',
  parts: [{ kind: 'income', category: 'Other income', amount: 350000 }],
};
delete credit.transfer;
const ledger: Ledger = { ...world, transactions: [...world.transactions, credit] };

function show(): void {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<TransferAnswer ledger={ledger} txnId={grocer.id} />));
}

const COVERED =
  "HNB LKR's statement covers this date but has no matching line. Its side will still count as income or spending.";

describe('TransferAnswer', () => {
  it('marks a row as not a transfer', async () => {
    const saves = stubSaves();
    show();
    await click(button('Not a transfer'));
    await click(button('Save'));
    expect(saves.bodies()).toEqual([[{ type: 'not-transfer', txn: grocer.id }]]);
    expect(document.body.textContent).toContain('Saved. Kanakku is updating.');
  });

  it('marks a row as not a transfer and puts it in a category', async () => {
    const saves = stubSaves();
    show();
    await click(button('Not a transfer'));
    await choose('Category', 'Groceries');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([
      [
        { type: 'not-transfer', txn: grocer.id },
        { type: 'set', txn: grocer.id, kind: 'spending', category: 'Groceries' },
      ],
    ]);
  });

  it('pairs a row with a line from the account you pick', async () => {
    const saves = stubSaves();
    show();
    await click(button('Transfer to…'));
    await choose('Account', 'hnb-lkr');
    expect(document.body.textContent).toContain('CEFT-A PERERA');
    await click(button('Pair'));
    expect(saves.bodies()).toEqual([[{ type: 'pair', out: grocer.id, in: 'hand-credit' }]]);
  });

  it('counts a row as a transfer when the other account has no line', async () => {
    const saves = stubSaves();
    show();
    await click(button('Transfer to…'));
    await choose('Account', 'cb-savings');
    await click(button('No matching line. Count it as a transfer to ComBank Savings.'));
    expect(saves.bodies()).toEqual([[{ type: 'transfer', txn: grocer.id, account: 'cb-savings' }]]);
  });

  it("warns when the other account's statement covers the date", async () => {
    stubSaves();
    show();
    await click(button('Transfer to…'));
    await choose('Account', 'hnb-lkr');
    expect(document.body.textContent).toContain(COVERED);
    await choose('Account', 'cb-savings');
    expect(document.body.textContent).not.toContain('statement covers this date');
  });

  it('shows why a save failed', async () => {
    stubSaves(409, { errors: ['decisions.yaml line 3: [2].type must be one of pair'] });
    show();
    await click(button('Not a transfer'));
    await click(button('Save'));
    expect(document.body.textContent).toContain('decisions.yaml line 3');
    expect(document.body.textContent).not.toContain('Saved. Kanakku is updating.');
  });
});
