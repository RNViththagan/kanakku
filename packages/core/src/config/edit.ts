import { type Document, isMap, isSeq, parseDocument } from 'yaml';
import type { AccountType } from '../model/types';
import { loadConfig } from './load';
import type { ConfigError } from './schema';

export interface AccountEdit {
  id: string;
  name?: string;
  bank?: string;
  type?: AccountType;
  currency?: string;
  number?: string;
  closed?: string;
  deposit?: {
    principal?: number;
    start?: string;
    months?: number;
    rate?: number;
    maturity?: string;
  };
}

export interface RuleEdit {
  match: string;
  kind?: 'income' | 'spending' | 'other';
  category?: string;
  direction?: 'in' | 'out';
}

export type ConfigEditResult = { text: string } | { errors: ConfigError[] };

const BOM = '﻿';

function editConfig(
  text: string,
  change: (doc: Document) => ConfigError[] | undefined,
): ConfigEditResult {
  const bom = text.startsWith(BOM);
  const body = bom ? text.slice(BOM.length) : text;
  const before = loadConfig(body);
  if (before.errors.length > 0) return { errors: before.errors };
  const doc = parseDocument(body);
  const problems = change(doc);
  if (problems) return { errors: problems };
  const written = doc.toString({ lineWidth: 0 });
  const after = loadConfig(written);
  if (after.errors.length > 0) return { errors: after.errors };
  const endings = body.includes('\r\n') ? written.replace(/\r?\n/g, '\r\n') : written;
  return { text: bom ? `${BOM}${endings}` : endings };
}

function blockList(doc: Document, key: string): void {
  const list = doc.get(key);
  if (isSeq(list)) list.flow = false;
  else doc.set(key, doc.createNode([]));
}

export function upsertAccount(text: string, account: AccountEdit): ConfigEditResult {
  return editConfig(text, (doc) => {
    const list = doc.get('accounts');
    const items = isSeq(list) ? list.items : [];
    const index = items.findIndex((item) => isMap(item) && item.get('id') === account.id);
    const { id, deposit, ...fields } = account;
    if (index < 0) {
      if (!fields.name || !fields.bank || !fields.type || !fields.currency) {
        return [
          {
            path: 'accounts',
            message: 'name, bank, type and currency are needed for a new account',
          },
        ];
      }
      blockList(doc, 'accounts');
      doc.addIn(['accounts'], doc.createNode({ id, ...fields, ...(deposit && { deposit }) }));
      return undefined;
    }
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) doc.setIn(['accounts', index, key], value);
    }
    for (const [key, value] of Object.entries(deposit ?? {})) {
      if (value !== undefined) doc.setIn(['accounts', index, 'deposit', key], value);
    }
    return undefined;
  });
}

export function addRule(text: string, rule: RuleEdit): ConfigEditResult {
  const match = rule.match.trim();
  if (match.length < 3) {
    return {
      errors: [{ path: 'rules', message: 'the text to match needs at least 3 characters' }],
    };
  }
  return editConfig(text, (doc) => {
    blockList(doc, 'rules');
    doc.addIn(
      ['rules'],
      doc.createNode({
        match,
        direction: rule.direction,
        kind: rule.kind,
        category: rule.category,
      }),
    );
    return undefined;
  });
}
