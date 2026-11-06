export const PAGE_IDS = [
  'overview',
  'net-worth',
  'cash-flow',
  'spending',
  'transfers',
  'conversions',
  'accounts',
  'account',
  'transactions',
  'statements',
  'needs',
] as const;

export type PageId = (typeof PAGE_IDS)[number];

export interface Route {
  page: PageId;
  param?: string;
  query?: Record<string, string>;
}

function isPage(value: string): value is PageId {
  return (PAGE_IDS as readonly string[]).includes(value);
}

export function parseHash(hash: string): Route {
  const text = hash.replace(/^#\/?/, '');
  const mark = text.indexOf('?');
  const path = mark < 0 ? text : text.slice(0, mark);
  const [page = '', raw] = path.split('/');
  if (!isPage(page)) return { page: 'overview' };
  let param: string | undefined;
  try {
    param = raw ? decodeURIComponent(raw) : undefined;
  } catch {
    return { page: 'overview' };
  }
  if (page === 'account' && !param) return { page: 'accounts' };
  const route: Route = { page };
  if (param) route.param = param;
  const query = Object.fromEntries(new URLSearchParams(mark < 0 ? '' : text.slice(mark + 1)));
  if (Object.keys(query).length > 0) route.query = query;
  return route;
}

export function hrefFor(route: Route): string {
  const param = route.param ? `/${encodeURIComponent(route.param)}` : '';
  const query =
    route.query && Object.keys(route.query).length > 0
      ? `?${new URLSearchParams(route.query)}`
      : '';
  return `#/${route.page}${param}${query}`;
}
