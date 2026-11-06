import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../src/config/defaults';
import { loadConfig } from '../src/config/load';

const example = readFileSync(new URL('../../../config.example.yaml', import.meta.url), 'utf8');

const minimal = (extra = '') => `version: 1\nhomeCurrency: LKR\n${extra}`;

describe('loadConfig', () => {
  it('loads the example with no errors', () => {
    const { config, errors } = loadConfig(example);
    expect(errors).toEqual([]);
    expect(config?.accounts.map((account) => account.id)).toEqual([
      'main',
      'card',
      'dollars',
      'deposit-1',
    ]);
    expect(config?.accounts[1]?.card).toEqual({
      statementDay: 5,
      dueDay: 26,
      limit: 30000000,
      openingOwed: 0,
    });
    expect(config?.accounts[3]?.deposit?.principal).toBe(50000000);
    expect(config?.rates.manual).toEqual({ USD: '330' });
    expect(config?.rules[0]).toEqual({
      match: { text: 'SALARY' },
      kind: 'income',
      category: 'Salary',
    });
  });

  it('merges plug-in transfer fees in minor units', () => {
    expect(loadConfig(example).config?.transfers.fees.LKR).toEqual([2500, 5000]);
    expect(loadConfig(minimal()).config?.transfers.fees).toEqual({ LKR: [2500] });
  });

  it('fills in defaults', () => {
    const { config, errors } = loadConfig(minimal());
    expect(errors).toEqual([]);
    expect(config).toMatchObject({
      locale: 'en-US',
      folders: [],
      accounts: [],
      you: { names: [] },
      transfers: { windowDays: 3 },
      rates: { source: 'off', options: {}, manual: {} },
      categories: DEFAULT_CATEGORIES,
      rules: [],
    });
    expect(DEFAULT_CATEGORIES.spending).toContain('Refunds');
    expect(DEFAULT_CATEGORIES.income).not.toContain('Refunds');
  });

  it('names the line of an unknown bank', () => {
    const text = minimal('folders:\n  - path: Bank/X\n    bank: nowhere\n');
    const { config, errors } = loadConfig(text);
    expect(config).toBeUndefined();
    expect(errors).toEqual([
      expect.objectContaining({
        line: 5,
        path: 'folders[0].bank',
        message: expect.stringContaining('unknown bank'),
      }),
    ]);
  });

  it('names the line of a bad currency', () => {
    const text = minimal(
      [
        'accounts:',
        '  - id: a',
        '    name: A',
        '    bank: boc',
        '    type: savings',
        '    currency: LKR',
        '  - id: b',
        '    name: B',
        '    bank: boc',
        '    type: savings',
        '    currency: LK',
        '',
      ].join('\n'),
    );
    expect(loadConfig(text).errors).toEqual([
      { line: 13, path: 'accounts[1].currency', message: 'must be a 3-letter code' },
    ]);
  });

  it('rejects duplicate account ids', () => {
    const account = '  - id: a\n    name: A\n    bank: boc\n    type: savings\n    currency: LKR\n';
    const { errors } = loadConfig(minimal(`accounts:\n${account}${account}`));
    expect(errors).toEqual([
      expect.objectContaining({ path: 'accounts[1].id', message: 'is used by another account' }),
    ]);
  });

  it('reports YAML syntax errors with their line', () => {
    const { errors } = loadConfig('version: 1\nhomeCurrency: [LKR\n');
    expect(errors[0]?.line).toBeGreaterThanOrEqual(2);
  });

  it('requires a version', () => {
    const { errors } = loadConfig('homeCurrency: LKR\n');
    expect(errors).toEqual([expect.objectContaining({ path: 'version', message: 'is required' })]);
  });

  it('rejects a statement day outside 1 to 31', () => {
    const card = [
      'accounts:',
      '  - id: c',
      '    name: C',
      '    bank: combank',
      '    type: credit-card',
      '    currency: LKR',
      '    card:',
      '      statementDay: 32',
      '      dueDay: 20',
      '',
    ].join('\n');
    expect(loadConfig(minimal(card)).errors).toEqual([
      expect.objectContaining({ line: 10, path: 'accounts[0].card.statementDay' }),
    ]);
  });

  it('rejects a rule of kind transfer', () => {
    const { errors } = loadConfig(minimal('rules:\n  - match: X\n    kind: transfer\n'));
    expect(errors).toEqual([expect.objectContaining({ path: 'rules[0].kind' })]);
  });

  it('requires card settings on credit cards', () => {
    const card =
      'accounts:\n  - id: c\n    name: C\n    bank: combank\n    type: credit-card\n    currency: LKR\n';
    expect(loadConfig(minimal(card)).errors).toEqual([
      expect.objectContaining({
        path: 'accounts[0].card',
        message: expect.stringContaining('statementDay'),
      }),
    ]);
  });

  it('asks for quotes around account numbers', () => {
    const account =
      'accounts:\n  - id: a\n    name: A\n    bank: boc\n    type: savings\n    currency: LKR\n    number: 12345\n';
    expect(loadConfig(minimal(account)).errors).toEqual([
      expect.objectContaining({
        path: 'accounts[0].number',
        message: expect.stringContaining('quotes'),
      }),
    ]);
  });

  it('points at unknown settings', () => {
    const { errors } = loadConfig(minimal('colour: blue\n'));
    expect(errors).toEqual([{ line: 3, path: 'colour', message: 'is not a known setting' }]);
  });
});
