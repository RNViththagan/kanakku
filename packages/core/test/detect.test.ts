import { describe, expect, it } from 'vitest';
import type { BankPlugin, FileInput, StatementFormat } from '../src/banks/types';
import { detectFormat } from '../src/ledger/detect';

const file: FileInput = { path: 'Bank/x/statement.csv', name: 'statement.csv', text: 'anything' };

function format(
  id: string,
  detect: StatementFormat['detect'],
  fileTypes = ['.csv'],
): StatementFormat {
  return {
    id,
    fileTypes,
    accountTypes: ['savings'],
    detect,
    parse: () => ({ account: {}, rows: [], issues: [] }),
  };
}

function plugin(id: string, formats: StatementFormat[]): BankPlugin {
  return { id, name: id, shortName: id.toUpperCase(), formats, wording: [] };
}

describe('detectFormat', () => {
  it('picks the most confident format', () => {
    const result = detectFormat(file, [
      plugin('a', [format('a-csv', () => 0.6)]),
      plugin('b', [format('b-csv', () => 0.9)]),
    ]);
    expect(result).toMatchObject({ plugin: { id: 'b' }, format: { id: 'b-csv' }, confidence: 0.9 });
  });

  it('reports no match when every format is unsure', () => {
    const result = detectFormat(file, [plugin('a', [format('a-csv', () => 0.4)])]);
    expect(result).toEqual({ unreadable: 'no-match' });
  });

  it('reports a tie between equally confident formats', () => {
    const result = detectFormat(file, [
      plugin('a', [format('a-csv', () => 0.8)]),
      plugin('b', [format('b-csv', () => 0.8)]),
    ]);
    expect(result).toEqual({ unreadable: 'tie' });
  });

  it('treats a format that throws as not matching', () => {
    const result = detectFormat(file, [
      plugin('a', [
        format('a-csv', () => {
          throw new Error('boom');
        }),
      ]),
      plugin('b', [format('b-csv', () => 0.7)]),
    ]);
    expect(result).toMatchObject({ format: { id: 'b-csv' } });
  });

  it('skips formats for other file types', () => {
    const result = detectFormat(file, [plugin('a', [format('a-xls', () => 0.99, ['.xls'])])]);
    expect(result).toEqual({ unreadable: 'no-match' });
  });

  it('matches file types whatever their letter case', () => {
    const upper = { ...file, name: 'STATEMENT.CSV' };
    const result = detectFormat(upper, [plugin('a', [format('a-csv', () => 0.7)])]);
    expect(result).toMatchObject({ format: { id: 'a-csv' } });
  });
});
