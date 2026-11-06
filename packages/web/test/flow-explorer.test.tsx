// @vitest-environment happy-dom
import { cashFlowByMonth } from '@kanakku/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { FlowExplorer } from '../src/FlowExplorer';
import { moneyFlow } from '../src/flow';

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
const range = { from: '2026-01-01', to: '2026-02-20' };
const flow = moneyFlow(cashFlowByMonth(ledger, range), 3);

function show(query: Record<string, string>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <FlowExplorer
        ledger={ledger}
        range={range}
        route={{ page: 'cash-flow', query }}
        flow={flow}
      />,
    ),
  );
  return host;
}

function links(page: HTMLElement): Array<[string, string]> {
  return [...page.querySelectorAll('a')].map((link) => [
    link.textContent ?? '',
    link.getAttribute('href') ?? '',
  ]);
}

describe('FlowExplorer', () => {
  it('groups a flow by payee, each group opening its transactions', () => {
    const page = show({ flow: 'spending:Fees' });
    expect(page.textContent).toContain('5 transactions');
    expect(links(page)).toContainEqual([
      'ATM SERVICE CHARGE',
      '#/cash-flow?by=payee&flow=spending%3AFees&group=ATM+SERVICE+CHARGE',
    ]);
    expect(links(page)).toContainEqual(['Money flow', '#/cash-flow']);
  });

  it('shows the way back through Other', () => {
    const page = show({ flow: 'spending:Fees' });
    expect(links(page)).toContainEqual(['Other', '#/cash-flow?flow=other-out']);
  });

  it('lists what was folded into Other', () => {
    const page = show({ flow: 'other-out' });
    expect(page.textContent).toContain('2 categories');
    expect(links(page)).toContainEqual(['Fees', '#/cash-flow?flow=spending%3AFees']);
  });

  it('breaks what was saved down by month', () => {
    const page = show({ flow: 'saved' });
    expect(links(page).map(([label]) => label)).toEqual(
      expect.arrayContaining(['Jan 2026', 'Feb 2026']),
    );
    expect(page.textContent).not.toContain('Payee');
  });

  it('names the group it is listing', () => {
    const page = show({ flow: 'spending:Fees', by: 'payee', group: 'ATM SERVICE CHARGE' });
    expect(page.textContent).toContain('1 transaction');
    expect(links(page)).toContainEqual(['Fees', '#/cash-flow?flow=spending%3AFees&by=payee']);
  });

  it('says so when the flow is not in this range', () => {
    expect(show({ flow: 'nonsense' }).textContent).toContain('Nothing to show');
  });
});
