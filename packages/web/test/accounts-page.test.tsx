// @vitest-environment happy-dom
import type { Ledger } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import type { Status } from '../src/api';
import { Accounts } from '../src/pages/Accounts';

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
  localStorage.clear();
});

const world = loadWorld();
const deposit = world.accounts.at(-1);
if (!deposit) throw new Error('fixture deposit missing');
const ledger: Ledger = {
  ...world,
  depositMoves: [
    ...world.depositMoves,
    { account: deposit.id, date: '2026-02-15', amount: -12000000 },
  ],
};

function show(): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <Accounts
        ledger={ledger}
        status={{} as Status}
        tidy={[]}
        route={{ page: 'accounts' }}
        range={{ from: '2026-01-01', to: '2026-02-20' }}
        rangeLabel="All"
      />,
    ),
  );
  return host;
}

describe('Accounts', () => {
  it('keeps withdrawn deposits out of the way until asked for', () => {
    const page = show();
    expect(page.textContent).toContain('Show closed accounts and withdrawn deposits (1)');
    expect(page.textContent).not.toContain(deposit.name);
    act(() => page.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    expect(page.textContent).toContain(deposit.name);
  });
});
