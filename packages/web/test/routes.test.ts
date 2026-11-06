import { describe, expect, it } from 'vitest';
import { hrefFor, parseHash, type Route } from '../src/routes';

describe('routes', () => {
  it('reads a page and its parameter from the hash', () => {
    expect(parseHash('#/account/cb-card')).toEqual({ page: 'account', param: 'cb-card' });
    expect(parseHash('#/net-worth')).toEqual({ page: 'net-worth' });
  });

  it('falls back to the overview', () => {
    expect(parseHash('')).toEqual({ page: 'overview' });
    expect(parseHash('#/')).toEqual({ page: 'overview' });
    expect(parseHash('#/nope')).toEqual({ page: 'overview' });
    expect(parseHash('#/account/%E0%A4%A')).toEqual({ page: 'overview' });
  });

  it('sends an account link with no account to the accounts list', () => {
    expect(parseHash('#/account')).toEqual({ page: 'accounts' });
  });

  it('reads filters', () => {
    expect(parseHash('#/transactions?category=Food+and+dining&account=boc-main')).toEqual({
      page: 'transactions',
      query: { category: 'Food and dining', account: 'boc-main' },
    });
  });

  it('writes links that read back the same', () => {
    const routes: Route[] = [
      { page: 'overview' },
      { page: 'account', param: 'cb card/1' },
      { page: 'transactions', query: { category: 'Food and dining' } },
    ];
    for (const route of routes) expect(parseHash(hrefFor(route))).toEqual(route);
    expect(hrefFor({ page: 'account', param: 'cb-card' })).toBe('#/account/cb-card');
  });
});
