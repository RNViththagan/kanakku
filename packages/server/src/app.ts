import { timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  type AccountEdit,
  addCategory,
  addDecisions,
  addRule,
  buildLedger,
  type Config,
  type ConfigError,
  type Decision,
  type DecisionContent,
  type EditResult,
  type IsoDate,
  type Ledger,
  loadConfig,
  loadDecisions,
  moveRule,
  parseDecisionContent,
  planTidy,
  type RuleChange,
  type RuleEdit,
  removeCategory,
  removeDecision,
  removeRule,
  setGeneral,
  setNames,
  setRates,
  type TidyProposal,
  type UserRule,
  updateRule,
  upsertAccount,
} from '@kanakku/core';
import { loadDataFolder } from './load';
import { readDataFile, writeDataFile } from './save';
import { type FolderWatch, watchFolders } from './watch';

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
  decisions: Decision[];
}

export interface AppOptions {
  dataFolder: string;
  webRoot: string;
  token: string;
  today: () => IsoDate;
  now?: () => Date;
  watch?: boolean;
}

export interface App {
  server: Server;
  rebuild(): void;
  state(): AppState;
  close(): Promise<void>;
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
const MAX_BODY = 65536;
const MAX_ANSWERS = 400;
const READ_ROUTES = new Set(['/api/status', '/api/ledger', '/api/tidy', '/api/events']);

class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly errors: string[],
    readonly headers: Record<string, string> = {},
  ) {
    super(errors.join('. '));
  }
}

function errorText(error: ConfigError): string {
  const where = [error.line === undefined ? '' : `line ${error.line}`, error.path]
    .filter(Boolean)
    .join(' ');
  return where ? `${where}: ${error.message}` : error.message;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    return Promise.reject(new Refusal(415, ['Send the body as application/json']));
  }
  const tooLarge = () =>
    new Refusal(413, [`The body is larger than ${MAX_BODY} bytes`], { connection: 'close' });
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return Promise.reject(tooLarge());
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;
    req.on('data', (chunk: Buffer) => {
      if (refused) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        refused = true;
        fail(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (refused) return;
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        fail(new Refusal(400, ['The body is not valid JSON']));
      }
    });
    req.on('error', fail);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STALE = 'The rules changed since this list loaded. It has been refreshed, so try again.';
const RULE_ROUTE = /^\/api\/config\/rules\/(0|[1-9][0-9]*)(\/remove|\/move)?$/;

function wrongBody(message: string): EditResult {
  return { errors: [{ path: '', message }] };
}

function storedRates(dataFolder: string): string[] {
  const folder = join(dataFolder, 'kanakku', 'rates');
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.csv'));
}

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
  const now = options.now ?? (() => new Date());
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error('The token must be 16 to 256 letters, digits, _ or -');
  }
  const webRoot = resolve(options.webRoot);
  const streams = new Set<ServerResponse>();
  let current: AppState = {
    tidy: [],
    decisions: [],
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
  let watching: { key: string; watch: FolderWatch } | undefined;
  let builtFor: IsoDate | undefined;
  let closed = false;

  function foldersToWatch(config?: Config): string[] {
    const outside = (config?.folders ?? [])
      .map((folder) => (isAbsolute(folder.path) ? folder.path : join(dataFolder, folder.path)))
      .filter((path) => {
        const fromData = relative(dataFolder, path);
        return isAbsolute(fromData) || fromData === '..' || fromData.startsWith(`..${sep}`);
      });
    return [dataFolder, ...outside];
  }

  function rewatch(config?: Config): void {
    if (closed) return;
    const folders = foldersToWatch(config);
    const key = folders.join('\0');
    if (watching?.key === key) return;
    watching?.watch.close();
    watching = { key, watch: watchFolders(folders, rebuild) };
  }

  function rebuild(): void {
    const today = options.today();
    builtFor = today;
    try {
      const contents = loadDataFolder(dataFolder);
      if (options.watch) rewatch(contents.config);
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
          today,
        });
        const tidy = planTidy({
          ledger,
          folders: contents.config.folders,
          existing: new Set(contents.files.map((file) => file.path)),
        });
        ledgerJson = JSON.stringify(ledger);
        current = {
          ledger,
          tidy,
          status,
          builtAt: new Date().toISOString(),
          decisions: contents.decisions,
        };
      } else {
        current = { ...current, status: { ...status, stale: current.ledger !== undefined } };
      }
    } catch (problem) {
      if (options.watch && !watching) rewatch();
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

  async function saveAnswers(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0 || items.length > MAX_ANSWERS) {
      throw new Refusal(400, [`Send from 1 to ${MAX_ANSWERS} answers`]);
    }
    const contents: DecisionContent[] = [];
    const errors: string[] = [];
    items.forEach((item, index) => {
      const parsed = parseDecisionContent(item);
      if ('content' in parsed) contents.push(parsed.content);
      else {
        const prefix = items.length > 1 ? `answer ${index + 1}: ` : '';
        errors.push(...parsed.errors.map((error) => `${prefix}${error}`));
      }
    });
    if (errors.length > 0) throw new Refusal(400, errors);
    const moment = now();
    const before = readDataFile(dataFolder, 'decisions.yaml');
    const result = addDecisions(before, contents, moment.toISOString());
    if ('errors' in result) throw new Refusal(409, result.errors.map(errorText));
    if (result.text !== before) writeDataFile(dataFolder, 'decisions.yaml', result.text, moment);
    rebuild();
    json(res, 200, { decisions: result.decisions, replaced: result.replaced });
  }

  function removeAnswer(res: ServerResponse, id: string): void {
    const before = readDataFile(dataFolder, 'decisions.yaml');
    const result = removeDecision(before, id);
    if ('errors' in result) throw new Refusal(409, result.errors.map(errorText));
    if (!result.removed) throw new Refusal(404, ['No answer has that id']);
    writeDataFile(dataFolder, 'decisions.yaml', result.text, now());
    rebuild();
    res.writeHead(204, NO_STORE);
    res.end();
  }

  async function saveConfig(
    req: IncomingMessage,
    res: ServerResponse,
    edit: (text: string, body: Record<string, unknown>, config: Config) => EditResult,
  ): Promise<void> {
    const body = await readJson(req);
    if (!isRecord(body)) throw new Refusal(400, ['Send an object']);
    const before = readDataFile(dataFolder, 'config.yaml');
    const loaded = loadConfig(before.replace(/^\uFEFF/, ''));
    if (!loaded.config) throw new Refusal(409, loaded.errors.map(errorText));
    const result = edit(before, body, loaded.config);
    if ('stale' in result) throw new Refusal(409, [STALE]);
    if ('errors' in result) throw new Refusal(400, result.errors.map(errorText));
    if (result.text !== before) {
      writeDataFile(dataFolder, 'config.yaml', result.text, now());
      rebuild();
    }
    json(res, 200, {});
  }

  function ruleRoute(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    index: number,
    action: string | undefined,
  ): Promise<void> | void {
    const wanted = action === undefined ? 'PUT' : 'POST';
    if (method !== wanted) return text(res, 405, 'Method not allowed');
    return saveConfig(req, res, (before, body) => {
      if (!isRecord(body.expect)) return wrongBody('Send the rule as you loaded it in expect');
      const expect = body.expect as unknown as UserRule;
      if (action === '/remove') return removeRule(before, index, expect);
      if (action === '/move') {
        if (!Number.isInteger(body.to)) return wrongBody('Send to as a whole number');
        return moveRule(before, index, expect, body.to as number);
      }
      if (!isRecord(body.change)) return wrongBody('Send the change in change');
      return updateRule(before, index, expect, body.change as RuleChange);
    });
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && !FETCH_SITES.has(site)) return text(res, 403, 'Forbidden');
    const given =
      req.headers['x-kanakku-token'] ??
      (url.pathname === '/api/events' ? url.searchParams.get('token') : undefined);
    if (!sameToken(given, token)) return text(res, 401, 'Unauthorized');
    const method = req.method ?? 'GET';
    const path = url.pathname;
    if (READ_ROUTES.has(path)) {
      if (method !== 'GET') return text(res, 405, 'Method not allowed');
      if (path !== '/api/events' && options.today() !== builtFor) rebuild();
      switch (path) {
        case '/api/status':
          return json(res, 200, current.status);
        case '/api/ledger':
          return ledgerJson ? json(res, 200, ledgerJson) : json(res, 503, current.status);
        case '/api/tidy':
          return json(res, 200, current.tidy);
        default:
          return openEvents(req, res);
      }
    }
    if (path === '/api/decisions') {
      if (method === 'GET') {
        return json(res, 200, {
          decisions: current.decisions,
          unused: current.ledger?.unusedDecisions ?? [],
        });
      }
      if (method === 'POST') return saveAnswers(req, res);
      return text(res, 405, 'Method not allowed');
    }
    const answer = /^\/api\/decisions\/([^/]+)$/.exec(path);
    if (answer?.[1]) {
      if (method !== 'DELETE') return text(res, 405, 'Method not allowed');
      return removeAnswer(res, decodeURIComponent(answer[1]));
    }
    if (path === '/api/config') {
      if (method !== 'GET') return text(res, 405, 'Method not allowed');
      const loaded = loadConfig(readDataFile(dataFolder, 'config.yaml').replace(/^\uFEFF/, ''));
      return json(res, 200, { config: loaded.config ?? null, errors: loaded.errors });
    }
    const rule = RULE_ROUTE.exec(path);
    if (rule?.[1] !== undefined) return ruleRoute(req, res, method, Number(rule[1]), rule[2]);
    if (path === '/api/config/you') {
      if (method !== 'PUT') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body) => {
        const { names } = body;
        if (!Array.isArray(names) || !names.every((name) => typeof name === 'string')) {
          return wrongBody('Send names as a list of text');
        }
        return setNames(before, names);
      });
    }
    if (path === '/api/config/general') {
      if (method !== 'PUT') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body, config) => {
        const { homeCurrency, locale } = body;
        if (homeCurrency !== undefined && typeof homeCurrency !== 'string') {
          return wrongBody('Send homeCurrency as text');
        }
        if (locale !== undefined && typeof locale !== 'string') {
          return wrongBody('Send locale as text');
        }
        if (homeCurrency !== undefined && homeCurrency !== config.homeCurrency) {
          const stored = storedRates(dataFolder);
          if (stored.length > 0) {
            throw new Refusal(409, [
              `The stored rates in kanakku/rates (${stored.join(', ')}) are in ${config.homeCurrency}. Move them out first.`,
            ]);
          }
        }
        return setGeneral(before, {
          ...(homeCurrency !== undefined && { homeCurrency }),
          ...(locale !== undefined && { locale }),
        });
      });
    }
    if (path === '/api/config/rates') {
      if (method !== 'PUT') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body) => {
        const { manual } = body;
        if (
          !isRecord(manual) ||
          !Object.values(manual).every((value) => value === null || typeof value === 'string')
        ) {
          return wrongBody('Send manual rates as text, or null to remove one');
        }
        return setRates(before, { manual: manual as Record<string, string | null> });
      });
    }
    if (path === '/api/config/categories') {
      if (method !== 'POST') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body) => {
        const { kind, name } = body;
        if ((kind !== 'income' && kind !== 'spending') || typeof name !== 'string') {
          return wrongBody('Send kind as income or spending, and name as text');
        }
        return addCategory(before, kind, name);
      });
    }
    if (path === '/api/config/categories/remove') {
      if (method !== 'POST') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body) => {
        const { name } = body;
        if (typeof name !== 'string') return wrongBody('Send name as text');
        const answers = loadDecisions(readDataFile(dataFolder, 'decisions.yaml')).decisions;
        if (answers.some((answer) => answer.type === 'set' && answer.category === name)) {
          throw new Refusal(409, [`An answer puts transactions in ${name}. Undo it first.`]);
        }
        return removeCategory(before, name);
      });
    }
    if (path === '/api/config/accounts') {
      if (method !== 'POST') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body) => {
        if (typeof body.id !== 'string')
          return { errors: [{ path: 'id', message: 'is required' }] };
        return upsertAccount(before, body as unknown as AccountEdit);
      });
    }
    if (path === '/api/config/rules') {
      if (method !== 'POST') return text(res, 405, 'Method not allowed');
      return saveConfig(req, res, (before, body) => {
        if (typeof body.match !== 'string') {
          return { errors: [{ path: 'match', message: 'is required' }] };
        }
        return addRule(before, body as unknown as RuleEdit);
      });
    }
    return json(res, 404, { error: 'Not found' });
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
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((problem: unknown) => {
        if (res.headersSent) return res.destroy();
        if (problem instanceof Refusal) {
          reply(
            res,
            problem.status,
            JSON.stringify({ errors: problem.errors }),
            'application/json; charset=utf-8',
            {
              ...NO_STORE,
              ...problem.headers,
            },
          );
          return;
        }
        text(res, 500, 'Something went wrong');
      });
      return;
    }
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

  async function close(): Promise<void> {
    closed = true;
    watching?.watch.close();
    watching = undefined;
    for (const stream of streams) stream.end();
    streams.clear();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }

  rebuild();
  return { server, rebuild, state: () => current, close };
}
