import type {
  AccountEdit,
  ConfigError,
  Decision,
  DecisionContent,
  Ledger,
  RuleEdit,
  TidyProposal,
} from '@kanakku/core';
import { useEffect, useState } from 'react';

export interface Status {
  dataFolder: string;
  configPath: string;
  configErrors: ConfigError[];
  decisionErrors: ConfigError[];
  files: number;
  error?: string;
  stale: boolean;
}

export interface LedgerState {
  ledger?: Ledger;
  status?: Status;
  tidy: TidyProposal[];
  loading: boolean;
  error?: string;
}

const RELOADED = 'kanakku-reloaded';

export function readToken(): string {
  return document.querySelector('meta[name="kanakku-token"]')?.getAttribute('content') ?? '';
}

function reloadOnce(): void {
  try {
    if (sessionStorage.getItem(RELOADED)) return;
    sessionStorage.setItem(RELOADED, '1');
  } catch {
    return;
  }
  window.location.reload();
}

function markLoaded(): void {
  try {
    sessionStorage.removeItem(RELOADED);
  } catch {
    return;
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: { 'x-kanakku-token': readToken(), ...(init.headers as Record<string, string>) },
  });
  if (response.status === 401) {
    reloadOnce();
    throw new Error('Kanakku was restarted. Reload this page.');
  }
  return response;
}

export async function readJson<T>(path: string): Promise<T> {
  const response = await request(path);
  if (!response.ok) throw new Error(`Kanakku answered ${response.status} for ${path}`);
  return (await response.json()) as T;
}

export class SaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function write(path: string, method: string, value?: unknown): Promise<Response> {
  const response = await request(
    path,
    value === undefined
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) },
  );
  if (response.ok) return response;
  const reason = await response.json().then(
    (body: { errors?: unknown }) =>
      Array.isArray(body.errors) && body.errors.length > 0 ? body.errors.join('. ') : undefined,
    () => undefined,
  );
  throw new SaveError(reason ?? `Kanakku answered ${response.status}`, response.status);
}

export async function saveAnswers(
  contents: DecisionContent[],
): Promise<{ decisions: Decision[]; replaced: Decision[] }> {
  const response = await write('/api/decisions', 'POST', contents);
  return (await response.json()) as { decisions: Decision[]; replaced: Decision[] };
}

export async function removeAnswer(id: string): Promise<void> {
  await write(`/api/decisions/${encodeURIComponent(id)}`, 'DELETE');
}

export function fetchAnswers(): Promise<{ decisions: Decision[]; unused: string[] }> {
  return readJson<{ decisions: Decision[]; unused: string[] }>('/api/decisions');
}

export async function saveAccount(edit: AccountEdit): Promise<void> {
  await write('/api/config/accounts', 'POST', edit);
}

export async function saveRule(rule: RuleEdit): Promise<void> {
  await write('/api/config/rules', 'POST', rule);
}

export function fetchStatus(): Promise<Status> {
  return readJson<Status>('/api/status');
}

export function fetchTidy(): Promise<TidyProposal[]> {
  return readJson<TidyProposal[]>('/api/tidy');
}

export async function fetchLedger(): Promise<Ledger | undefined> {
  const response = await request('/api/ledger');
  if (response.status === 503) return undefined;
  if (!response.ok) throw new Error(`Kanakku answered ${response.status} for /api/ledger`);
  return (await response.json()) as Ledger;
}

export function subscribe(onChanged: () => void): () => void {
  const source = new EventSource(`/api/events?token=${encodeURIComponent(readToken())}`);
  source.addEventListener('changed', onChanged);
  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED) onChanged();
  });
  return () => source.close();
}

export function useLedger(): LedgerState {
  const [state, setState] = useState<LedgerState>({ tidy: [], loading: true });
  useEffect(() => {
    let alive = true;
    let latest = 0;
    const load = async () => {
      const ticket = ++latest;
      try {
        const [status, ledger, tidy] = await Promise.all([
          fetchStatus(),
          fetchLedger(),
          fetchTidy(),
        ]);
        markLoaded();
        if (alive && ticket === latest) setState({ status, ledger, tidy, loading: false });
      } catch (problem) {
        const error = problem instanceof Error ? problem.message : String(problem);
        if (alive && ticket === latest)
          setState((previous) => ({ ...previous, loading: false, error }));
      }
    };
    void load();
    const stop = subscribe(() => void load());
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return state;
}
