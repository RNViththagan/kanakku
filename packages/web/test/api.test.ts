// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAnswers, removeAnswer, saveAnswers, saveRule } from '../src/api';

beforeEach(() => {
  const meta = document.createElement('meta');
  meta.name = 'kanakku-token';
  meta.content = 'test-token';
  document.head.append(meta);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.replaceChildren();
});

function answering(status: number, body: string) {
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => new Response(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('saving answers', () => {
  it('sends answers with the token and JSON', async () => {
    const fetch = answering(200, JSON.stringify({ decisions: [], replaced: [] }));
    await expect(saveAnswers([{ type: 'dismiss', item: 'n1' }])).resolves.toEqual({
      decisions: [],
      replaced: [],
    });
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/api/decisions');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'x-kanakku-token': 'test-token',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual([{ type: 'dismiss', item: 'n1' }]);
  });

  it("shows the server's reason when a save fails", async () => {
    answering(400, JSON.stringify({ errors: ['rules: too short', 'kind: unknown'] }));
    await expect(saveRule({ match: 'ab' })).rejects.toThrow('rules: too short. kind: unknown');
    answering(500, 'Something went wrong');
    await expect(removeAnswer('a b')).rejects.toThrow('Kanakku answered 500');
  });

  it('removes an answer by its id and reads the list', async () => {
    const fetch = answering(204, '');
    await removeAnswer('a/b');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/decisions/a%2Fb');
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
    answering(200, JSON.stringify({ decisions: [], unused: ['x'] }));
    await expect(fetchAnswers()).resolves.toEqual({ decisions: [], unused: ['x'] });
  });
});
