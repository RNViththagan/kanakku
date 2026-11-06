import type { ConfigError, Ledger, TidyProposal } from '@kanakku/core';
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

async function request(path: string): Promise<Response> {
  const response = await fetch(path, { headers: { 'x-kanakku-token': readToken() } });
  if (response.status === 401) {
    reloadOnce();
    throw new Error('Kanakku was restarted. Reload this page.');
  }
  return response;
}

async function readJson<T>(path: string): Promise<T> {
  const response = await request(path);
  if (!response.ok) throw new Error(`Kanakku answered ${response.status} for ${path}`);
  return (await response.json()) as T;
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
