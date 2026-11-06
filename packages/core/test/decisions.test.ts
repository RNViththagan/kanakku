import { describe, expect, it } from 'vitest';
import {
  type Decision,
  decisionId,
  loadDecisions,
  serializeDecisions,
} from '../src/decisions/load';

const at = '2026-11-06T10:00:00.000Z';
const all: Decision[] = [
  { id: 'd1', at, type: 'file-account', file: 'abc123', account: 'main' },
  { id: 'd2', at, type: 'pair', out: 't-out', in: 't-in' },
  { id: 'd3', at, type: 'not-transfer', txn: 't1', with: 't2' },
  { id: 'd4', at, type: 'not-transfer', txn: 't3' },
  { id: 'd5', at, type: 'set', txn: 't4', kind: 'spending', category: 'Rent' },
  { id: 'd6', at, type: 'set', txn: 't5', category: 'Fees' },
  { id: 'd7', at, type: 'counterparty', text: 'SAVER PLUS AC', mine: true, account: 'saver' },
  { id: 'd8', at, type: 'counterparty', text: 'SHOP', mine: false },
  { id: 'd9', at, type: 'fd-principal', deposit: 'deposit-hnb-1', principal: '1500.00' },
  { id: 'd10', at, type: 'dismiss', item: 'n1' },
];

describe('saved answers', () => {
  it('round-trips every type', () => {
    const { decisions, errors } = loadDecisions(serializeDecisions(all));
    expect(errors).toEqual([]);
    expect(decisions).toEqual(all);
  });

  it('keeps principal as text even when written as a number', () => {
    const text = `- id: a\n  at: x\n  type: fd-principal\n  deposit: d\n  principal: 1500.50\n`;
    expect(loadDecisions(text).decisions[0]).toMatchObject({ principal: '1500.5' });
  });

  it('reports a bad entry with its line and keeps the rest', () => {
    const text = [
      '- id: a',
      '  at: x',
      '  type: pair',
      '  out: o',
      '  in: i',
      '- id: b',
      '  at: x',
      '  type: mystery',
      '',
    ].join('\n');
    const { decisions, errors } = loadDecisions(text);
    expect(decisions).toHaveLength(1);
    expect(errors).toEqual([expect.objectContaining({ line: 8, path: '[1].type' })]);
  });

  it('needs a kind or a category on set answers', () => {
    const { errors } = loadDecisions('- id: a\n  at: x\n  type: set\n  txn: t\n');
    expect(errors).toEqual([expect.objectContaining({ path: '[0]' })]);
  });

  it('reads an empty file as no answers', () => {
    expect(loadDecisions('')).toEqual({ decisions: [], errors: [] });
    expect(loadDecisions('# nothing yet\n')).toEqual({ decisions: [], errors: [] });
  });

  it('gives the same id to the same answer', () => {
    const one = decisionId({ type: 'pair', out: 'a', in: 'b' });
    expect(one).toBe(decisionId({ in: 'b', out: 'a', type: 'pair' }));
    expect(one).not.toBe(decisionId({ type: 'pair', out: 'b', in: 'a' }));
  });
});
