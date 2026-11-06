// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  vi.unstubAllGlobals();
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
      'Money in',
    ]) {
      expect(text).toContain(label);
    }
    expect(page.querySelectorAll('.flow-ribbon')).toHaveLength(8);
  });

  it('names the middle bar for what passes through it', () => {
    const short = moneyFlow([month({ Salary: 1000 }, { Rent: 1500 })]);
    const text = show(
      <FlowDiagram flow={short} width={720} currency="LKR" locale="en-LK" />,
    ).textContent;
    expect(text).toContain('Money out');
    expect(text).toContain('Shortfall');
  });

  it('turns each flow into a link when given somewhere to go', () => {
    const page = show(
      <FlowDiagram
        flow={flow}
        width={720}
        currency="LKR"
        locale="en-LK"
        linkTo={(item) => `#/cash-flow?flow=${item.key}`}
      />,
    );
    const links = [...page.querySelectorAll('a')];
    expect(links).toHaveLength(8);
    expect(links.map((link) => link.getAttribute('href'))).toContain(
      '#/cash-flow?flow=income:Salary',
    );
    expect(links[0]?.getAttribute('aria-label')).toContain('Other income');
  });

  it('tells a screen reader what came in, went out and was saved', () => {
    const figure = show(
      <FlowDiagram flow={flow} width={720} currency="LKR" locale="en-LK" />,
    ).querySelector('figure');
    expect(figure?.querySelector('svg')).not.toBeNull();
    expect(figure?.getAttribute('aria-label')).toBe(
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

  it('draws once it knows its width and stops watching when removed', () => {
    const watching = { disconnects: 0 };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly report: ResizeObserverCallback) {}
        observe() {
          this.report(
            [{ contentRect: { width: 720 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        unobserve() {}
        disconnect() {
          watching.disconnects += 1;
        }
      },
    );
    const page = show(<FlowChart flow={flow} currency="LKR" locale="en-LK" />);
    expect(page.querySelector('svg')?.getAttribute('width')).toBe('720');
    act(() => root?.unmount());
    root = undefined;
    expect(watching.disconnects).toBe(1);
  });

  it('says so when nothing came in or went out', () => {
    const page = show(<FlowChart flow={moneyFlow([])} currency="LKR" locale="en-LK" />);
    expect(page.textContent).toBe('Nothing came in or went out in this range.');
  });
});
