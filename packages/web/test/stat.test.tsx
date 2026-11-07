// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Change, ShareBar, Stat } from '../src/ui';

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

function show(node: React.ReactNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

describe('Stat', () => {
  it('shows the label, the number and its unit apart', () => {
    const page = show(<Stat label="Net worth" value="3.85M" unit="LKR" icon={null} />);
    expect(page.textContent).toBe('Net worth3.85MLKR');
  });
});

describe('Change', () => {
  it('signs a rise and a fall and says since when', () => {
    expect(
      show(<Change minor={41602000} currency="LKR" locale="en-LK" since="since Sep 2026" />)
        .textContent,
    ).toBe('+416.02Ksince Sep 2026');
    act(() => root?.unmount());
    expect(
      show(<Change minor={-2546500} currency="LKR" locale="en-LK" since="since Oct 2026" />)
        .textContent,
    ).toBe('-25.47Ksince Oct 2026');
  });
});

describe('ShareBar', () => {
  it('keeps the share between none and all', () => {
    const page = show(
      <>
        <ShareBar value={140} color="#eb6834" />
        <ShareBar value={-5} color="#eb6834" />
      </>,
    );
    expect(
      [...page.querySelectorAll('[role="progressbar"]')].map((bar) =>
        bar.getAttribute('aria-valuenow'),
      ),
    ).toEqual(['100', '0']);
  });
});
