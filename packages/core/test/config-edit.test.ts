import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addRule,
  type EditResult,
  moveRule,
  removeCategory,
  removeRule,
  setGeneral,
  setNames,
  setRates,
  updateRule,
  upsertAccount,
} from '../src/config/edit';
import { loadConfig } from '../src/config/load';

const BASE = [
  '# Kanakku settings',
  'version: 1',
  'homeCurrency: LKR # money is valued in this',
  'locale: en-LK',
  'accounts:',
  '  - id: main',
  '    name: Main account # where the salary lands',
  '    bank: boc',
  '    type: savings',
  '    currency: LKR',
  '    number: "0012345678"',
  '  - id: fd-1',
  '    name: One-year deposit',
  '    bank: combank',
  '    type: fixed-deposit',
  '    currency: LKR',
  '    number: "003000000001"',
  '    deposit: { principal: 500000, start: 2026-01-10 }',
  'rules:',
  '  - match: SALARY # the monthly pay',
  '    kind: income',
  '    category: Salary',
  '',
].join('\n');

function edited(result: EditResult): string {
  if ('errors' in result) throw new Error(JSON.stringify(result.errors));
  if ('stale' in result) throw new Error('stale');
  return result.text;
}

function config(text: string) {
  const loaded = loadConfig(text);
  if (!loaded.config) throw new Error(JSON.stringify(loaded.errors));
  return loaded.config;
}

describe('upsertAccount', () => {
  it('adds a deposit account with its term and keeps comments', () => {
    const text = edited(
      upsertAccount(BASE, {
        id: 'fd-2',
        name: 'Three-month deposit',
        bank: 'combank',
        type: 'fixed-deposit',
        currency: 'LKR',
        number: '003012345678',
        deposit: { start: '2026-08-07', months: 3, rate: 8 },
      }),
    );
    for (const comment of [
      '# Kanakku settings',
      '# money is valued in this',
      '# where the salary lands',
      '# the monthly pay',
    ]) {
      expect(text).toContain(comment);
    }
    const added = config(text).accounts.at(-1);
    expect(added).toMatchObject({
      id: 'fd-2',
      number: '003012345678',
      deposit: { start: '2026-08-07', months: 3, rate: 8 },
    });
  });

  it('updates the fields of an existing account', () => {
    const text = edited(upsertAccount(BASE, { id: 'main', name: 'Salary account' }));
    expect(config(text).accounts[0]).toEqual({
      ...config(BASE).accounts[0],
      name: 'Salary account',
    });
    expect(text).toContain('# where the salary lands');
    expect(config(text).accounts).toHaveLength(2);
  });

  it('merges deposit details instead of replacing them', () => {
    const text = edited(upsertAccount(BASE, { id: 'fd-1', deposit: { months: 12, rate: 9 } }));
    expect(config(text).accounts[1]?.deposit).toEqual({
      principal: 50000000,
      start: '2026-01-10',
      months: 12,
      rate: 9,
    });
  });

  it('keeps CRLF line endings and a BOM', () => {
    const windows = `﻿${BASE.replace(/\n/g, '\r\n')}`;
    const text = edited(upsertAccount(windows, { id: 'main', name: 'Salary account' }));
    expect(text.startsWith('﻿')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(config(text.replace(/^﻿/, '')).accounts[0]?.name).toBe('Salary account');
  });

  it('refuses an account that would not load', () => {
    const result = upsertAccount(BASE, {
      id: 'odd',
      name: 'Odd',
      bank: 'boc',
      type: 'savings',
      currency: 'lkr',
    });
    expect(result).toEqual({
      errors: [expect.objectContaining({ path: 'accounts[2].currency' })],
    });
  });

  it('refuses a new account without name, bank, type and currency', () => {
    expect(upsertAccount(BASE, { id: 'new', name: 'New' })).toEqual({
      errors: [
        {
          path: 'accounts',
          message: 'name, bank, type and currency are needed for a new account',
        },
      ],
    });
  });

  it('refuses to edit a config that already has errors', () => {
    const broken = BASE.replace(
      'currency: LKR\n    number: "0012345678"',
      'currency: lkr\n    number: "0012345678"',
    );
    expect('errors' in upsertAccount(broken, { id: 'main', name: 'X' })).toBe(true);
    expect('errors' in addRule(broken, { match: 'RENT', category: 'Rent' })).toBe(true);
  });
});

describe('addRule', () => {
  it('adds a rule at the end', () => {
    const text = edited(addRule(BASE, { match: 'RENT', category: 'Rent', direction: 'out' }));
    expect(config(text).rules.at(-1)).toEqual({
      match: { text: 'RENT' },
      direction: 'out',
      category: 'Rent',
    });
    expect(text).toContain('# the monthly pay');
  });

  it('adds a rules list when there is none', () => {
    const bare = 'version: 1\nhomeCurrency: LKR\n';
    const text = edited(addRule(bare, { match: 'RENT', kind: 'spending', category: 'Rent' }));
    expect(config(text).rules).toEqual([
      { match: { text: 'RENT' }, kind: 'spending', category: 'Rent' },
    ]);
    expect(text).toMatch(/rules:\n\s+- match: RENT/);
  });

  it('refuses a rule shorter than 3 characters', () => {
    expect(addRule(BASE, { match: '  ab ', category: 'Rent' })).toEqual({
      errors: [{ path: 'rules', message: 'the text to match needs at least 3 characters' }],
    });
  });
});

const FULL = [
  '# Settings',
  'version: 1',
  'homeCurrency: LKR',
  'locale: en-LK',
  'accounts:',
  '  - id: main',
  '    name: Main account',
  '    bank: boc',
  '    type: savings',
  '    currency: LKR',
  '    number: "0012345678"',
  '    closed: 2026-06-30',
  '  - id: card',
  '    name: Credit card',
  '    bank: combank',
  '    type: credit-card',
  '    currency: LKR',
  '    card: { statementDay: 5, dueDay: 26 }',
  'you:',
  '  names: ["A PERERA", "PERERA A"]   # how your name appears',
  'rates:',
  '  source: manual',
  '  manual: { USD: 300.00 }',
  'categories:',
  '  income: [Salary, Interest, Other income]',
  '  spending: [Groceries, Rent, Bills, Cash, Fees, Tax, Refunds, Uncategorised, Pets]',
  'rules:',
  '  # salary first',
  '  - match: SALARY',
  '    kind: income',
  '    category: Salary',
  '  - match: RENT # the flat',
  '    account: main',
  '    category: Rent',
  '    direction: out',
  '  - match: { regex: "GROCER|SUPERMARKET" }',
  '    category: Groceries',
  '',
].join('\n');

const rules = config(FULL).rules;
const rule = (index: number) => {
  const found = rules[index];
  if (!found) throw new Error(`no rule ${index}`);
  return found;
};

describe('account settings', () => {
  it('sets card days and a limit, and deletes a closed date sent as null', () => {
    const carded = config(
      edited(upsertAccount(FULL, { id: 'card', card: { statementDay: 6, limit: 300000 } })),
    );
    expect(carded.accounts[1]?.card).toEqual({
      statementDay: 6,
      dueDay: 26,
      limit: 30000000,
      openingOwed: 0,
    });
    const reopened = edited(upsertAccount(FULL, { id: 'main', closed: null }));
    expect(reopened).not.toContain('closed:');
    expect(config(reopened).accounts[0]?.closed).toBeUndefined();
  });

  it('asks for both days when an account gets a card', () => {
    const plain = FULL.replace('    card: { statementDay: 5, dueDay: 26 }\n', '').replace(
      'type: credit-card',
      'type: savings',
    );
    expect(
      upsertAccount(plain, { id: 'card', type: 'credit-card', card: { statementDay: 5 } }),
    ).toEqual({
      errors: [
        { path: 'accounts[1].card', message: 'statementDay and dueDay are needed for a card' },
      ],
    });
  });
});

describe('rule settings', () => {
  it("updates a rule's kind and category and keeps its account and comment", () => {
    const text = edited(updateRule(FULL, 1, rule(1), { kind: 'spending', category: 'Bills' }));
    expect(config(text).rules[1]).toEqual({
      match: { text: 'RENT' },
      account: 'main',
      direction: 'out',
      kind: 'spending',
      category: 'Bills',
    });
    expect(text).toContain('# the flat');
  });

  it("deletes a rule's direction sent as null", () => {
    const text = edited(updateRule(FULL, 1, rule(1), { direction: null }));
    expect(config(text).rules[1]?.direction).toBeUndefined();
  });

  it('refuses to change a pattern from the app', () => {
    expect(updateRule(FULL, 2, rule(2), { match: 'GROCER' })).toEqual({
      errors: [{ path: 'rules[2].match', message: 'a pattern can only be changed in config.yaml' }],
    });
  });

  it('removes a rule, and moves one', () => {
    const removed = config(edited(removeRule(FULL, 0, rule(0)))).rules;
    expect(
      removed.map((item) => ('text' in item.match ? item.match.text : item.match.regex)),
    ).toEqual(['RENT', 'GROCER|SUPERMARKET']);
    const moved = edited(moveRule(FULL, 1, rule(1), 0));
    expect(config(moved).rules.map((item) => item.category)).toEqual([
      'Rent',
      'Salary',
      'Groceries',
    ]);
    expect(moved).toMatch(/match: RENT # the flat/);
  });

  it('leaves the file alone when a rule would not move', () => {
    expect(moveRule(FULL, 1, rule(1), 1)).toEqual({ text: FULL });
    expect(moveRule(FULL, 2, rule(2), 9)).toEqual({ text: FULL });
  });

  it('refuses a rule edit when the rule changed since it was loaded', () => {
    expect(updateRule(FULL, 0, rule(1), { category: 'Bills' })).toEqual({ stale: true });
    expect(removeRule(FULL, 7, rule(0))).toEqual({ stale: true });
    expect(moveRule(FULL, 0, { match: { text: 'OTHER' } }, 1)).toEqual({ stale: true });
  });

  it('keeps CRLF and a BOM when moving a rule', () => {
    const windows = `﻿${FULL.replace(/\n/g, '\r\n')}`;
    const text = edited(moveRule(windows, 1, rule(1), 0));
    expect(text.startsWith('﻿')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('names, general settings and rates', () => {
  it("sets your names without blanks or repeats, and keeps the list's comment", () => {
    const text = edited(setNames(FULL, ['A PERERA', ' a perera ', '', 'SAMPLE NAME']));
    expect(config(text).you.names).toEqual(['A PERERA', 'SAMPLE NAME']);
    expect(text).toContain('# how your name appears');
  });

  it('refuses a name shorter than 3 characters', () => {
    expect(setNames(FULL, ['AB'])).toEqual({
      errors: [{ path: 'you.names', message: 'each name needs at least 3 characters' }],
    });
  });

  it('sets the locale in its usual case', () => {
    expect(config(edited(setGeneral(FULL, { locale: 'en-us' }))).locale).toBe('en-US');
    for (const locale of ['en_US', 'xx-ZZ', '']) {
      expect(setGeneral(FULL, { locale })).toEqual({
        errors: [{ path: 'locale', message: 'must be a locale like en-LK' }],
      });
    }
  });

  it('refuses a new home currency while manual rates exist', () => {
    expect(setGeneral(FULL, { homeCurrency: 'USD' })).toEqual({
      errors: [{ path: 'homeCurrency', message: 'clear the manual rates first, they are in LKR' }],
    });
    expect(config(edited(setGeneral(BASE, { homeCurrency: 'USD' }))).homeCurrency).toBe('USD');
  });

  it('sets a manual rate, deletes another, and deletes an empty list', () => {
    const text = edited(setRates(FULL, { manual: { EUR: '340.50', USD: null } }));
    expect(Number(config(text).rates.manual.EUR)).toBe(340.5);
    expect(config(text).rates.manual.USD).toBeUndefined();
    expect(edited(setRates(FULL, { manual: { USD: null } }))).not.toMatch(/manual:/);
    expect(setRates(FULL, { manual: { EUR: '0' } })).toEqual({
      errors: [{ path: 'rates.manual.EUR', message: 'must be a rate above 0' }],
    });
  });
});

describe('categories', () => {
  it('adds a category and keeps the default ones when the file has none', () => {
    const loaded = config(edited(addCategory(BASE, 'spending', ' Pets ')));
    expect(loaded.categories.spending).toEqual([...config(BASE).categories.spending, 'Pets']);
    expect(loaded.categories.income).toEqual(config(BASE).categories.income);
  });

  it('refuses a category that already exists', () => {
    expect(addCategory(FULL, 'income', 'rent')).toEqual({
      errors: [{ path: 'categories', message: 'Rent is already a category' }],
    });
  });

  it('removes an unused category and refuses one a rule or Kanakku uses', () => {
    expect(config(edited(removeCategory(FULL, 'Pets'))).categories.spending).not.toContain('Pets');
    expect(removeCategory(FULL, 'Rent')).toEqual({
      errors: [{ path: 'categories', message: 'Rent is used by a rule' }],
    });
    expect(removeCategory(FULL, 'Fees')).toEqual({
      errors: [{ path: 'categories', message: 'Kanakku itself uses Fees' }],
    });
  });
});

describe('missing parts and broken files', () => {
  it('creates each missing part', () => {
    expect(config(edited(setNames(BASE, ['A PERERA']))).you.names).toEqual(['A PERERA']);
    expect(
      Number(config(edited(setRates(BASE, { manual: { USD: '300' } }))).rates.manual.USD),
    ).toBe(300);
    const rated = 'version: 1\nhomeCurrency: LKR\nrates:\n  source: off\n';
    expect(
      Number(config(edited(setRates(rated, { manual: { USD: '300' } }))).rates.manual.USD),
    ).toBe(300);
    const bare = 'version: 1\nhomeCurrency: LKR\n';
    expect(updateRule(bare, 0, rule(0), { category: 'Bills' })).toEqual({ stale: true });
    expect(config(edited(setNames(edited(setNames(BASE, ['A PERERA'])), []))).you.names).toEqual(
      [],
    );
  });

  it('refuses to edit a config that already has errors', () => {
    const broken = FULL.replace('homeCurrency: LKR', 'homeCurrency: lkr');
    const results = [
      updateRule(broken, 0, rule(0), { category: 'Bills' }),
      removeRule(broken, 0, rule(0)),
      moveRule(broken, 0, rule(0), 1),
      setNames(broken, ['A PERERA']),
      setGeneral(broken, { locale: 'en-GB' }),
      setRates(broken, { manual: { USD: '1' } }),
      addCategory(broken, 'spending', 'Pets2'),
      removeCategory(broken, 'Pets'),
      upsertAccount(broken, { id: 'main', closed: null }),
    ];
    for (const result of results) expect('errors' in result).toBe(true);
  });
});
