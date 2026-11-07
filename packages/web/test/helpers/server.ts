import { vi } from 'vitest';

export interface Answer {
  status?: number;
  body?: unknown;
}

export function fakeServer(routes: Record<string, Answer | ((body: unknown) => Answer)>) {
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const route = routes[`${method} ${path}`] ?? routes[path];
    const sent = init?.body ? JSON.parse(String(init.body)) : undefined;
    const answer = typeof route === 'function' ? route(sent) : (route ?? { status: 404 });
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status ?? 200,
    });
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    sent: (method: string, path: string) =>
      fetch.mock.calls
        .filter(([to, init]) => to === path && (init?.method ?? 'GET') === method)
        .map(([, init]) => JSON.parse(String(init?.body))),
  };
}
