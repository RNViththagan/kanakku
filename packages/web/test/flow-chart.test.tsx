// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FlowChart, FlowDiagram } from '../src/FlowChart';
import { moneyFlow } from '../src/flow';
import { month } from './helpers/months';

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

function show(element: ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

const flow = moneyFlow([
  month(
    { 'Other income': 21000000, Salary: 15000000, Interest: 16060 },
    { Cash: 2000000, Rent: 2000000, Uncategorised: 1120050, Fees: 11000 },
  ),
]);

describe('FlowDiagram', () => {
  it('labels every flow and the total', () => {
    const page = show(<FlowDiagram flow={flow} width={720} currency="LKR" locale="en-LK" />);
    const text = page.querySelector('svg')?.textContent ?? '';
    for (const label of [
      'Other income',
      'Salary',
      'Interest',
      'Cash',
      'Rent',
      'Uncategorised',
      'Fees',
      'Saved',
      'Total',
    ]) {
      expect(text).toContain(label);
    }
    expect(page.querySelectorAll('.flow-ribbon')).toHaveLength(8);
  });

  it('tells a screen reader what came in, went out and was saved', () => {
    const svg = show(
      <FlowDiagram flow={flow} width={720} currency="LKR" locale="en-LK" />,
    ).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe(
      'Income 360,160.60 LKR. Outgoing 51,310.50 LKR. Saved 308,850.10 LKR.',
    );
  });
});

describe('FlowChart', () => {
  it('shows the totals beside a key for each colour', () => {
    const text = show(<FlowChart flow={flow} currency="LKR" locale="en-LK" />).textContent;
    expect(text).toContain('Income360,160.60 LKR');
    expect(text).toContain('Outgoing51,310.50 LKR');
    expect(text).toContain('Saved308,850.10 LKR');
  });

  it('says so when nothing came in or went out', () => {
    const page = show(<FlowChart flow={moneyFlow([])} currency="LKR" locale="en-LK" />);
    expect(page.textContent).toBe('Nothing came in or went out in this range.');
  });
});
