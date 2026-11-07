import type { Config, ConfigError, Ledger, RuleChange, UserRule } from '@kanakku/core';
import { useCallback, useEffect, useState } from 'react';
import { readJson, SaveError, write } from './api';

export interface ConfigReply {
  config: Config | null;
  errors: ConfigError[];
}

export function fetchConfig(): Promise<ConfigReply> {
  return readJson<ConfigReply>('/api/config');
}

export function configErrorText(error: ConfigError): string {
  const where = [`config.yaml${error.line === undefined ? '' : ` line ${error.line}`}`, error.path]
    .filter(Boolean)
    .join(', ');
  return `${where}: ${error.message}`;
}

export function useConfig(ledger?: Ledger) {
  const [reply, setReply] = useState<ConfigReply>();
  const [problem, setProblem] = useState<string>();
  const reload = useCallback(async () => {
    try {
      setReply(await fetchConfig());
      setProblem(undefined);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new ledger means config.yaml may have changed.
  useEffect(() => {
    void reload();
  }, [ledger, reload]);
  return {
    config: reply?.config ?? undefined,
    errors: reply?.errors ?? [],
    loaded: reply !== undefined,
    problem,
    reload,
  };
}

export async function withReload<T>(
  reload: () => Promise<void>,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SaveError && error.status === 409) await reload();
    throw error;
  }
}

export async function saveNames(names: string[]): Promise<void> {
  await write('/api/config/you', 'PUT', { names });
}

export async function saveGeneral(change: {
  homeCurrency?: string;
  locale?: string;
}): Promise<void> {
  await write('/api/config/general', 'PUT', change);
}

export async function saveRates(manual: Record<string, string | null>): Promise<void> {
  await write('/api/config/rates', 'PUT', { manual });
}

export async function saveCategory(kind: 'income' | 'spending', name: string): Promise<void> {
  await write('/api/config/categories', 'POST', { kind, name });
}

export async function saveCategoryRemoval(name: string): Promise<void> {
  await write('/api/config/categories/remove', 'POST', { name });
}

export async function saveRuleChange(
  index: number,
  expect: UserRule,
  change: RuleChange,
): Promise<void> {
  await write(`/api/config/rules/${index}`, 'PUT', { expect, change });
}

export async function saveRuleRemoval(index: number, expect: UserRule): Promise<void> {
  await write(`/api/config/rules/${index}/remove`, 'POST', { expect });
}

export async function saveRuleMove(index: number, expect: UserRule, to: number): Promise<void> {
  await write(`/api/config/rules/${index}/move`, 'POST', { expect, to });
}
