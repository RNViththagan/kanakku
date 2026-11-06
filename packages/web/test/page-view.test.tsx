// @vitest-environment happy-dom
import type { Ledger } from '@kanakku/core';
import { act, type ComponentType, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Status } from '../src/api';
import { PageView } from '../src/PageView';
import type { PageProps } from '../src/pages/types';
import { PAGE_IDS, type PageId, type Route } from '../src/routes';

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
  vi.restoreAllMocks();
});

function Remembers({ route }: PageProps) {
  const [first] = useState(route.query?.category ?? 'none');
  return <p>{`category ${first}`}</p>;
}

function Breaks(): never {
  throw new Error('Invalid time value');
}

const pages = Object.fromEntries(
  PAGE_IDS.map((id) => [id, id === 'needs' ? Breaks : Remembers]),
) as Record<PageId, ComponentType<PageProps>>;

function show(route: Route): string {
  const element = (
    <PageView
      pages={pages}
      route={route}
      ledger={{} as Ledger}
      status={{} as Status}
      tidy={[]}
      range={{ from: '2026-01-01', to: '2026-02-20' }}
      rangeLabel="All"
    />
  );
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root?.render(element));
  return host?.textContent ?? '';
}

describe('PageView', () => {
  it('starts a page afresh when its link changes', () => {
    expect(show({ page: 'transactions' })).toContain('category none');
    expect(show({ page: 'transactions', query: { category: 'Rent' } })).toContain('category Rent');
  });

  it('shows a page error in place of the page and recovers on the next page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = show({ page: 'needs' });
    expect(broken).toContain('This page could not be shown');
    expect(broken).toContain('Invalid time value');
    expect(show({ page: 'overview' })).toContain('category none');
  });
});
