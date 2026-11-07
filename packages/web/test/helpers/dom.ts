import { act } from 'react';
import { vi } from 'vitest';

export function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

export async function choose(label: string, value: string): Promise<void> {
  const select = document.body.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`no select "${label}"`);
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function stubSaves(status = 200, body: unknown = { decisions: [], replaced: [] }) {
  const fetch = vi.fn(
    async (_path: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    bodies: () => fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body ?? 'null'))),
  };
}

export async function typeInto(label: string, text: string): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`no field "${label}"`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function checkbox(label: string): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(
    `input[type="checkbox"][aria-label="${label}"]`,
  );
  if (!input) throw new Error(`no checkbox "${label}"`);
  return input;
}
