import { describe, expect, it } from 'vitest';
import { addDecisions, removeDecision } from '../src/decisions/edit';
import {
  type Decision,
  type DecisionContent,
  decisionId,
  loadDecisions,
  parseDecisionContent,
  serializeDecisions,
} from '../src/decisions/load';

const at = '2026-11-07T10:00:00.000Z';
const later = '2026-11-07T11:00:00.000Z';

function file(...contents: DecisionContent[]): string {
  return serializeDecisions(
    contents.map((content) => ({ ...content, id: decisionId(content), at }) as Decision),
  );
}

function added(text: string, contents: DecisionContent[]) {
  const result = addDecisions(text, contents, later);
  if ('errors' in result) throw new Error(JSON.stringify(result.errors));
  return result;
}

function contentsOf(text: string): DecisionContent[] {
  return loadDecisions(text).decisions.map(
    ({ id: _id, at: _at, ...content }) => content as DecisionContent,
  );
}

const pair = (out: string, into: string): DecisionContent => ({ type: 'pair', out, in: into });
const notTransfer = (txn: string, partner?: string): DecisionContent =>
  partner ? { type: 'not-transfer', txn, with: partner } : { type: 'not-transfer', txn };

describe('addDecisions', () => {
  it('adds an answer with its id and time', () => {
    const content = notTransfer('t1');
    const result = added('', [content]);
    const saved = { id: decisionId(content), at: later, ...content };
    expect(loadDecisions(result.text).decisions).toEqual([saved]);
    expect(result.decisions).toEqual([saved]);
    expect(result.replaced).toEqual([]);
  });

  it('keeps one copy of the same answer', () => {
    const first = added('', [notTransfer('t1')]);
    expect(added(first.text, [notTransfer('t1')]).text).toBe(first.text);
  });

  it('a repeated answer still clears what it contradicts', () => {
    const result = added(file(pair('t1', 't2'), notTransfer('t1')), [pair('t1', 't2')]);
    expect(contentsOf(result.text)).toEqual([pair('t1', 't2')]);
    expect(result.replaced.map((decision) => decision.type)).toEqual(['not-transfer']);
  });

  it('round-trips a transfer answer', () => {
    const content: DecisionContent = { type: 'transfer', txn: 't1', account: 'hnb-lkr' };
    expect(contentsOf(added('', [content]).text)).toEqual([content]);
  });

  it('a pair replaces not-transfer answers for its rows, and the reverse', () => {
    expect(contentsOf(added(file(notTransfer('t1')), [pair('t1', 't2')]).text)).toEqual([
      pair('t1', 't2'),
    ]);
    expect(contentsOf(added(file(pair('t1', 't2')), [notTransfer('t2')]).text)).toEqual([
      notTransfer('t2'),
    ]);
  });

  it('a transfer answer replaces pairs and other answers for its row', () => {
    const transfer: DecisionContent = { type: 'transfer', txn: 't1', account: 'hnb-lkr' };
    const start = file(
      pair('t1', 't2'),
      notTransfer('t1'),
      { type: 'transfer', txn: 't1', account: 'boc' },
      pair('t3', 't4'),
    );
    expect(contentsOf(added(start, [transfer]).text)).toEqual([pair('t3', 't4'), transfer]);
  });

  it('a not-transfer with a partner removes only that pair', () => {
    const start = file(pair('t1', 't2'), pair('t3', 't4'));
    expect(contentsOf(added(start, [notTransfer('t2', 't1')]).text)).toEqual([
      pair('t3', 't4'),
      notTransfer('t2', 't1'),
    ]);
  });

  it('a later category for a row replaces the earlier one', () => {
    const start = file({ type: 'set', txn: 't1', kind: 'spending', category: 'Food' });
    const rent: DecisionContent = { type: 'set', txn: 't1', kind: 'spending', category: 'Rent' };
    expect(contentsOf(added(start, [rent]).text)).toEqual([rent]);
  });

  it('a counterparty answer replaces the earlier one for the same text', () => {
    const start = file({ type: 'counterparty', text: 'SAVER PLUS', mine: false });
    const mine: DecisionContent = {
      type: 'counterparty',
      text: 'saver plus',
      mine: true,
      account: 'saver',
    };
    expect(contentsOf(added(start, [mine]).text)).toEqual([mine]);
  });

  it('adds a list in order', () => {
    const food: DecisionContent = { type: 'set', txn: 't1', kind: 'spending', category: 'Food' };
    expect(contentsOf(added('', [notTransfer('t1'), food]).text)).toEqual([
      notTransfer('t1'),
      food,
    ]);
  });

  it('refuses to rewrite a file it cannot fully read', () => {
    const broken = '- id: a\n  at: x\n  type: nope\n';
    expect(addDecisions(broken, [notTransfer('t1')], later)).toEqual({
      errors: [expect.objectContaining({ path: '[0].type' })],
    });
    expect(removeDecision(broken, 'a')).toEqual({
      errors: [expect.objectContaining({ path: '[0].type' })],
    });
  });
});

describe('removeDecision', () => {
  it('removes an answer by id', () => {
    const start = file(notTransfer('t1'), pair('t3', 't4'));
    const result = removeDecision(start, decisionId(notTransfer('t1')));
    expect(result).toMatchObject({ removed: true });
    if ('errors' in result) throw new Error('unexpected errors');
    expect(contentsOf(result.text)).toEqual([pair('t3', 't4')]);
  });

  it('says when there was nothing to remove', () => {
    const start = file(notTransfer('t1'));
    expect(removeDecision(start, 'missing')).toEqual({ text: start, removed: false });
  });
});

describe('parseDecisionContent', () => {
  it('reads answer content sent by the app', () => {
    for (const content of [
      { type: 'transfer', txn: 't1', account: 'hnb-lkr' },
      { type: 'pair', out: 't1', in: 't2' },
      { type: 'set', txn: 't1', kind: 'spending', category: 'Rent' },
      { type: 'dismiss', item: 'n1' },
    ]) {
      expect(parseDecisionContent(content)).toEqual({ content });
    }
    for (const bad of [
      { type: 'pair', out: 't1' },
      { type: 'nope' },
      { type: 'dismiss', item: 'n1', extra: 1 },
      { type: 'dismiss', item: 'n1', id: 'a' },
      { type: 'dismiss', item: 'n1', at },
      null,
    ]) {
      const result = parseDecisionContent(bad);
      expect('errors' in result && result.errors.length > 0).toBe(true);
    }
  });

  it('names the field that is wrong', () => {
    expect(parseDecisionContent({ type: 'pair', out: 't1' })).toEqual({
      errors: ['in: is required'],
    });
  });
});
