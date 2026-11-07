import { LineCounter, parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import type { ConfigError } from '../config/schema';
import { hashText } from '../model/hash';
import { normalizeAmount } from '../model/money';
import type { Kind } from '../model/types';
import { formatPath, lineOf, type Path } from '../parse/yaml-paths';

interface Base {
  id: string;
  at: string;
}

export type Decision = Base &
  (
    | { type: 'file-account'; file: string; account: string }
    | { type: 'pair'; out: string; in: string }
    | { type: 'not-transfer'; txn: string; with?: string }
    | { type: 'transfer'; txn: string; account: string }
    | { type: 'set'; txn: string; kind?: Kind; category?: string }
    | { type: 'counterparty'; text: string; mine: boolean; account?: string }
    | { type: 'fd-principal'; deposit: string; principal: string }
    | { type: 'dismiss'; item: string }
  );

export type DecisionType = Decision['type'];
type WithoutMeta<T> = T extends Base ? Omit<T, keyof Base> : never;
export type DecisionContent = WithoutMeta<Decision>;

const text = z.string().min(1, 'must not be empty');
const principal = z
  .union([z.string(), z.number()])
  .transform((value) => normalizeAmount(String(value)))
  .refine((value) => value !== undefined, 'must be an amount like 1500.00');
const base = { id: text, at: text };

const schemas: Record<DecisionType, z.ZodType> = {
  'file-account': z.strictObject({
    ...base,
    type: z.literal('file-account'),
    file: text,
    account: text,
  }),
  pair: z.strictObject({ ...base, type: z.literal('pair'), out: text, in: text }),
  'not-transfer': z.strictObject({
    ...base,
    type: z.literal('not-transfer'),
    txn: text,
    with: text.optional(),
  }),
  transfer: z.strictObject({ ...base, type: z.literal('transfer'), txn: text, account: text }),
  set: z
    .strictObject({
      ...base,
      type: z.literal('set'),
      txn: text,
      kind: z.enum(['income', 'spending', 'transfer', 'other']).optional(),
      category: text.optional(),
    })
    .refine(
      (value) => value.kind !== undefined || value.category !== undefined,
      'needs a kind or a category',
    ),
  counterparty: z.strictObject({
    ...base,
    type: z.literal('counterparty'),
    text,
    mine: z.boolean(),
    account: text.optional(),
  }),
  'fd-principal': z.strictObject({
    ...base,
    type: z.literal('fd-principal'),
    deposit: text,
    principal,
  }),
  dismiss: z.strictObject({ ...base, type: z.literal('dismiss'), item: text }),
};

const TYPES = Object.keys(schemas) as DecisionType[];

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, inner]) => inner !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
}

export function decisionId(content: DecisionContent): string {
  return hashText(canonical(content));
}

function valueAt(value: unknown, path: PropertyKey[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

export function parseDecisionContent(
  value: unknown,
): { content: DecisionContent } | { errors: string[] } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { errors: ['answer: must be an object'] };
  }
  const record = value as Record<string, unknown>;
  const meta = (['id', 'at'] as const).filter((key) => key in record);
  if (meta.length > 0) return { errors: meta.map((key) => `${key}: is set by Kanakku`) };
  const type = record.type;
  if (typeof type !== 'string' || !TYPES.includes(type as DecisionType)) {
    return { errors: [`type: must be one of ${TYPES.join(', ')}`] };
  }
  const parsed = schemas[type as DecisionType].safeParse({ ...record, id: 'id', at: 'at' });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.flatMap((issue) =>
        issue.code === 'unrecognized_keys'
          ? issue.keys.map((key) => `${key}: is not a known field`)
          : [
              `${issue.path.map(String).join('.') || 'answer'}: ${
                issue.path.length > 0 && valueAt(record, issue.path) === undefined
                  ? 'is required'
                  : issue.message
              }`,
            ],
      ),
    };
  }
  const { id: _id, at: _at, ...content } = parsed.data as Decision;
  return { content: content as DecisionContent };
}

export function loadDecisions(text: string): { decisions: Decision[]; errors: ConfigError[] } {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      decisions: [],
      errors: doc.errors.map((error) => ({
        line: lines.linePos(error.pos[0]).line,
        path: '',
        message: error.message.split('\n')[0] ?? error.message,
      })),
    };
  }
  const errors: ConfigError[] = [];
  const report = (path: Path, message: string) => {
    const line = lineOf(doc, lines, path);
    errors.push({ ...(line !== undefined && { line }), path: formatPath(path), message });
  };
  const data: unknown = doc.toJS() ?? [];
  if (!Array.isArray(data)) {
    report([], 'must be a list of answers');
    return { decisions: [], errors };
  }
  const decisions: Decision[] = [];
  data.forEach((entry, index) => {
    const type = (entry as { type?: unknown } | null)?.type;
    if (typeof type !== 'string' || !TYPES.includes(type as DecisionType)) {
      report([index, 'type'], `must be one of ${TYPES.join(', ')}`);
      return;
    }
    const parsed = schemas[type as DecisionType].safeParse(entry);
    if (parsed.success) {
      decisions.push(parsed.data as Decision);
      return;
    }
    for (const issue of parsed.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) report([index, ...issue.path, key], 'is not a known field');
      } else {
        report([index, ...issue.path], issue.message);
      }
    }
  });
  return { decisions, errors };
}

export function serializeDecisions(decisions: Decision[]): string {
  if (decisions.length === 0) return '[]\n';
  const ordered = decisions.map(({ id, at, type, ...rest }) => ({ id, at, type, ...rest }));
  return stringify(ordered, { lineWidth: 0 });
}
