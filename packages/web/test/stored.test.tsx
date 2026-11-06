// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useStoredChoice } from '../src/stored';

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

const KEY = 'kanakku-test-choice';

function Probe() {
  const [choice, choose] = useStoredChoice(KEY, ['monthly', 'cumulative'], 'monthly');
  return (
    <button type="button" onClick={() => choose('cumulative')}>
      {choice}
    </button>
  );
}

function show(): HTMLElement {
  act(() => root?.unmount());
  host?.remove();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Probe />));
  return host;
}

describe('useStoredChoice', () => {
  it('starts with the fallback and remembers the last choice', () => {
    const first = show();
    expect(first.textContent).toBe('monthly');
    act(() => first.querySelector('button')?.click());
    expect(first.textContent).toBe('cumulative');
    expect(show().textContent).toBe('cumulative');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(KEY, 'weekly');
    expect(show().textContent).toBe('monthly');
  });
});
