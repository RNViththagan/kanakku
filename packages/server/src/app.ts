import { timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import {
  buildLedger,
  type ConfigError,
  type IsoDate,
  type Ledger,
  planTidy,
  type TidyProposal,
} from '@kanakku/core';
import { loadDataFolder } from './load';

export interface Status {
  dataFolder: string;
  configPath: string;
  configErrors: ConfigError[];
  decisionErrors: ConfigError[];
  files: number;
  error?: string;
  stale: boolean;
}

export interface AppState {
  ledger?: Ledger;
  tidy: TidyProposal[];
  status: Status;
  builtAt?: string;
}

export interface AppOptions {
  dataFolder: string;
  webRoot: string;
  token: string;
  today: () => IsoDate;
}

export interface App {
  server: Server;
  rebuild(): void;
  state(): AppState;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const NO_STORE = { 'cache-control': 'no-store' };
const FETCH_SITES = new Set(['same-origin', 'none']);

function sameToken(given: string | string[] | null | undefined, token: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function reply(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'content-type': type,
    'content-length': String(Buffer.byteLength(body)),
    ...headers,
  });
  res.end(body);
}

function text(res: ServerResponse, status: number, message: string): void {
  reply(res, status, message, 'text/plain; charset=utf-8', NO_STORE);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  reply(res, status, body, 'application/json; charset=utf-8', NO_STORE);
}

export function createApp(options: AppOptions): App {
  const { dataFolder, token } = options;
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error('The token must be 16 to 256 letters, digits, _ or -');
  }
  const webRoot = resolve(options.webRoot);
  const streams = new Set<ServerResponse>();
  let current: AppState = {
    tidy: [],
    status: {
      dataFolder,
      configPath: join(dataFolder, 'kanakku', 'config.yaml'),
      configErrors: [],
      decisionErrors: [],
      files: 0,
      stale: false,
    },
  };
  let ledgerJson: string | undefined;

  function rebuild(): void {
    try {
      const contents = loadDataFolder(dataFolder);
      const status: Status = {
        dataFolder,
        configPath: contents.configPath,
        configErrors: contents.configErrors,
        decisionErrors: contents.decisionErrors,
        files: contents.files.length,
        stale: false,
      };
      if (contents.config) {
        const ledger = buildLedger({
          files: contents.files,
          config: contents.config,
          decisions: contents.decisions,
          rates: contents.rates,
          today: options.today(),
        });
        const tidy = planTidy({
          ledger,
          folders: contents.config.folders,
          existing: new Set(contents.files.map((file) => file.path)),
        });
        ledgerJson = JSON.stringify(ledger);
        current = { ledger, tidy, status, builtAt: new Date().toISOString() };
      } else {
        current = { ...current, status: { ...status, stale: current.ledger !== undefined } };
      }
    } catch (problem) {
      current = {
        ...current,
        status: {
          ...current.status,
          error: problem instanceof Error ? problem.message : String(problem),
          stale: current.ledger !== undefined,
        },
      };
    }
    for (const stream of streams)
      stream.write(`event: changed\ndata: ${current.builtAt ?? ''}\n\n`);
  }

  function openEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', ...NO_STORE });
    res.write(': connected\n\n');
    streams.add(res);
    req.on('close', () => streams.delete(res));
  }

  function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (req.method !== 'GET') return text(res, 405, 'Method not allowed');
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && !FETCH_SITES.has(site)) return text(res, 403, 'Forbidden');
    const given =
      req.headers['x-kanakku-token'] ??
      (url.pathname === '/api/events' ? url.searchParams.get('token') : undefined);
    if (!sameToken(given, token)) return text(res, 401, 'Unauthorized');
    switch (url.pathname) {
      case '/api/status':
        return json(res, 200, current.status);
      case '/api/ledger':
        return ledgerJson ? json(res, 200, ledgerJson) : json(res, 503, current.status);
      case '/api/tidy':
        return json(res, 200, current.tidy);
      case '/api/events':
        return openEvents(req, res);
      default:
        return json(res, 404, { error: 'Not found' });
    }
  }

  function serveIndex(res: ServerResponse) {
    let html: string;
    try {
      html = readFileSync(join(webRoot, 'index.html'), 'utf8');
    } catch {
      return text(res, 404, 'The web app is not built. Run pnpm build first.');
    }
    const meta = `<meta name="kanakku-token" content="${token}">`;
    const head = /<head[^>]*>/i;
    const page = head.test(html) ? html.replace(head, (tag) => `${tag}${meta}`) : `${meta}${html}`;
    reply(res, 200, page, 'text/html; charset=utf-8', NO_STORE);
  }

  function serveStatic(res: ServerResponse, pathname: string) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return text(res, 404, 'Not found');
    }
    if (decoded.includes('\0')) return text(res, 404, 'Not found');
    const target = resolve(webRoot, `.${decoded}`);
    if (target !== webRoot && !target.startsWith(webRoot + sep)) return text(res, 404, 'Not found');
    const type = TYPES[extname(target).toLowerCase()];
    if (type && isFile(target)) return reply(res, 200, readFileSync(target), type);
    return serveIndex(res);
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    const port = (server.address() as AddressInfo | null)?.port;
    const host = req.headers.host;
    if (port === undefined || (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)) {
      return text(res, 403, 'Forbidden');
    }
    const url = new URL(req.url ?? '/', 'http://kanakku.invalid');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
    return serveStatic(res, url.pathname);
  }

  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch {
      if (res.headersSent) res.destroy();
      else text(res, 500, 'Something went wrong');
    }
  });

  rebuild();
  return { server, rebuild, state: () => current };
}
