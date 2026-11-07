// @vitest-environment happy-dom
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { THEMES } from '../src/appearance';
import { Settings } from '../src/pages/Settings';

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

async function show(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <OxygenUIThemeProvider themes={THEMES} initialTheme="acrylic-purple">
        <Settings />
      </OxygenUIThemeProvider>,
    );
  });
  return host;
}

function radio(page: HTMLElement, label: string): HTMLInputElement | undefined {
  return [...page.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((input) =>
    input.closest('label')?.textContent?.includes(label),
  );
}

describe('Settings', () => {
  it('lists the themes and switches to the one you pick', async () => {
    const page = await show();
    expect(radio(page, 'Acrylic purple')?.checked).toBe(true);
    await act(async () => radio(page, 'Pale indigo')?.click());
    expect(radio(page, 'Pale indigo')?.checked).toBe(true);
    expect(radio(page, 'Acrylic purple')?.checked).toBe(false);
    expect(localStorage.getItem('oxygen-theme')).toBe('pale-indigo');
  });

  it('switches between light, dark and the system setting', async () => {
    const page = await show();
    const dark = page.querySelector<HTMLButtonElement>('button[value="dark"]');
    await act(async () => dark?.click());
    expect(dark?.getAttribute('aria-pressed')).toBe('true');
  });

  it('turns the background pattern off and on', async () => {
    const page = await show();
    const pattern = page.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(pattern?.checked).toBe(true);
    await act(async () => pattern?.click());
    expect(pattern?.checked).toBe(false);
    expect(localStorage.getItem('kanakku-pattern')).toBe('off');
  });
});
