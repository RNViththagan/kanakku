import type { ConfigError } from '../config/schema';
import {
  type Decision,
  type DecisionContent,
  decisionId,
  loadDecisions,
  serializeDecisions,
} from './load';

function names(decision: Decision, txn: string): boolean {
  return decision.type === 'pair' && (decision.out === txn || decision.in === txn);
}

function contradicts(content: DecisionContent, earlier: Decision): boolean {
  switch (content.type) {
    case 'pair':
      return [content.out, content.in].some(
        (txn) =>
          names(earlier, txn) ||
          ((earlier.type === 'transfer' || earlier.type === 'not-transfer') && earlier.txn === txn),
      );
    case 'transfer':
      return (
        names(earlier, content.txn) ||
        ((earlier.type === 'transfer' || earlier.type === 'not-transfer') &&
          earlier.txn === content.txn)
      );
    case 'not-transfer': {
      const partner = content.with;
      if (partner !== undefined) {
        return (
          earlier.type === 'pair' &&
          ((earlier.out === content.txn && earlier.in === partner) ||
            (earlier.out === partner && earlier.in === content.txn))
        );
      }
      return (
        names(earlier, content.txn) ||
        (earlier.type === 'transfer' && earlier.txn === content.txn) ||
        (earlier.type === 'not-transfer' &&
          earlier.txn === content.txn &&
          earlier.with !== undefined)
      );
    }
    case 'set':
      return earlier.type === 'set' && earlier.txn === content.txn;
    case 'counterparty':
      return (
        earlier.type === 'counterparty' && earlier.text.toLowerCase() === content.text.toLowerCase()
      );
    case 'fd-principal':
      return earlier.type === 'fd-principal' && earlier.deposit === content.deposit;
    case 'file-account':
      return earlier.type === 'file-account' && earlier.file === content.file;
    default:
      return false;
  }
}

export function addDecisions(
  text: string,
  contents: DecisionContent[],
  at: string,
): { text: string; decisions: Decision[]; replaced: Decision[] } | { errors: ConfigError[] } {
  const loaded = loadDecisions(text);
  if (loaded.errors.length > 0) return { errors: loaded.errors };
  let list = loaded.decisions;
  const decisions: Decision[] = [];
  const replaced: Decision[] = [];
  let changed = false;
  for (const content of contents) {
    const id = decisionId(content);
    const gone = list.filter((earlier) => earlier.id !== id && contradicts(content, earlier));
    if (gone.length > 0) {
      replaced.push(...gone);
      list = list.filter((earlier) => !gone.includes(earlier));
      changed = true;
    }
    const existing = list.find((earlier) => earlier.id === id);
    if (existing) {
      decisions.push(existing);
      continue;
    }
    const decision = { ...content, id, at } as Decision;
    list = [...list, decision];
    decisions.push(decision);
    changed = true;
  }
  return { text: changed ? serializeDecisions(list) : text, decisions, replaced };
}

export function removeDecision(
  text: string,
  id: string,
): { text: string; removed: boolean } | { errors: ConfigError[] } {
  const loaded = loadDecisions(text);
  if (loaded.errors.length > 0) return { errors: loaded.errors };
  const left = loaded.decisions.filter((decision) => decision.id !== id);
  if (left.length === loaded.decisions.length) return { text, removed: false };
  return { text: serializeDecisions(left), removed: true };
}
