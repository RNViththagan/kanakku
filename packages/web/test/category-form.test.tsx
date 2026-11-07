// @vitest-environment happy-dom
import type { Transaction } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { CategoryForm, canCategorise } from '../src/CategoryForm';
import { button, checkbox, choose, click, stubSaves, typeInto } from './helpers/dom';

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

const ledger = loadWorld();
const row = (test: (item: Transaction) => boolean): Transaction => {
  const found = ledger.transactions.find(test);
  if (!found) throw new Error('fixture row missing');
  return found;
};
const grocer = row((item) => item.description.startsWith('POS       GROCER'));
const credit = row((item) => item.amount > 0 && item.kind === 'income');
const feeOut = row(
  (item) => item.kind === 'transfer' && item.parts.some((part) => part.kind === 'spending'),
);
const plainIn = row(
  (item) => item.kind === 'transfer' && item.parts.every((part) => part.kind === 'transfer'),
);

function show(txns: Transaction[]): void {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<CategoryForm ledger={ledger} txns={txns} onClose={() => {}} />));
}

describe('CategoryForm', () => {
  it('sets the category of one transaction with its kind', async () => {
    const saves = stubSaves();
    show([grocer]);
    await choose('Category', 'Groceries');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([
      [{ type: 'set', txn: grocer.id, kind: 'spending', category: 'Groceries' }],
    ]);
    expect(document.body.textContent).toContain('Saved. Kanakku is updating.');
  });

  it('keeps the kind with the category so an earlier answer cannot flip it', async () => {
    const saves = stubSaves();
    show([credit]);
    await choose('Category', 'Refunds');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([
      [{ type: 'set', txn: credit.id, kind: 'spending', category: 'Refunds' }],
    ]);
  });

  it('categorises the fee of a transfer', async () => {
    const saves = stubSaves();
    show([feeOut]);
    const options = [...document.body.querySelectorAll('select[aria-label="Category"] option')].map(
      (option) => option.textContent,
    );
    expect(options).not.toContain('Salary');
    await choose('Category', 'Bills');
    await click(button('Save'));
    expect(saves.bodies()).toEqual([[{ type: 'set', txn: feeOut.id, category: 'Bills' }]]);
  });

  it('offers no category for a transfer with no fee or interest', () => {
    expect(canCategorise(plainIn)).toBe(false);
    expect(canCategorise(feeOut)).toBe(true);
    expect(canCategorise(grocer)).toBe(true);
  });

  it('adds a rule that matches the rows it came from', async () => {
    const saves = stubSaves();
    show([grocer]);
    await choose('Category', 'Groceries');
    await click(checkbox('Also for every transaction whose text contains'));
    expect(document.body.textContent).toContain('Matches 1 transaction');
    await click(button('Save'));
    const [answer, rule] = saves.bodies();
    expect(answer).toEqual([
      { type: 'set', txn: grocer.id, kind: 'spending', category: 'Groceries' },
    ]);
    expect(rule).toEqual({
      match: 'POS       GROCER ONE - COLOMBO',
      kind: 'spending',
      category: 'Groceries',
      direction: 'out',
    });
    expect(saves.fetch.mock.calls[1]?.[0]).toBe('/api/config/rules');
  });

  it('refuses a rule that matches nothing', async () => {
    stubSaves();
    show([grocer]);
    await choose('Category', 'Groceries');
    await click(checkbox('Also for every transaction whose text contains'));
    await typeInto('Text to match', 'NOTHING LOOKS LIKE THIS');
    expect(document.body.textContent).toContain('Matches no transactions');
    expect(button('Save').disabled).toBe(true);
  });

  it('refuses a rule that would take transfers', async () => {
    stubSaves();
    show([grocer]);
    await choose('Category', 'Groceries');
    await click(checkbox('Also for every transaction whose text contains'));
    await typeInto('Text to match', 'TRF TO');
    expect(document.body.textContent).toContain(
      'This would also take 1 transfer between your accounts',
    );
    expect(button('Save').disabled).toBe(true);
  });

  it('says so when a group shares no text', () => {
    show([grocer, credit]);
    expect(document.body.textContent).toContain(
      'These transactions share no text, so no rule can cover them all.',
    );
  });
});
