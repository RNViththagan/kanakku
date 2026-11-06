import { describe, expect, it } from 'vitest';
import { bankPlugins } from '../src/banks/registry';
import { DEFAULT_CATEGORIES } from '../src/config/defaults';
import type { Account, UserRule } from '../src/config/schema';
import type { Decision } from '../src/decisions/load';
import { applyCategoryAnswers, applyDefaults, classify } from '../src/ledger/classify';
import type { Transaction } from '../src/ledger/types';

const accounts: Account[] = [
  { id: 'main', name: 'Main', bank: 'boc', type: 'savings', currency: 'LKR' },
  { id: 'cb', name: 'ComBank', bank: 'combank', type: 'savings', currency: 'LKR' },
  {
    id: 'card',
    name: 'Card',
    bank: 'combank',
    type: 'credit-card',
    currency: 'LKR',
    card: { statementDay: 5, dueDay: 26, openingOwed: 0 },
  },
];

let count = 0;
const txn = (description: string, amount: number, account = 'main'): Transaction => {
  count += 1;
  return {
    id: `t${count}`,
    account,
    date: '2026-03-01',
    amount,
    currency: 'LKR',
    description,
    sources: [],
    kind: '',
    category: '',
    tags: [],
    parts: [],
  };
};

const run = (txns: Transaction[], rules: UserRule[] = [], decisions: Decision[] = []) =>
  classify(txns, {
    accounts,
    banks: bankPlugins,
    rules,
    decisions,
    categories: DEFAULT_CATEGORIES,
  });

const pick = (result: Transaction[], index = 0) => {
  const item = result[index];
  if (!item) throw new Error('missing transaction');
  return { kind: item.kind, category: item.category, decidedBy: item.decidedBy };
};

describe('classify', () => {
  it('lets an answer with a kind beat a matching rule', () => {
    const row = txn('SALARY MARCH', 100000);
    const rules: UserRule[] = [{ match: { text: 'salary' }, kind: 'income', category: 'Salary' }];
    const decisions: Decision[] = [{ id: 'd', at: 'x', type: 'set', txn: row.id, kind: 'other' }];
    expect(pick(run([row], rules, decisions))).toEqual({
      kind: 'other',
      category: '',
      decidedBy: 'answer',
    });
  });

  it('lets a rule beat wording', () => {
    const rules: UserRule[] = [
      { match: { text: 'atm service' }, kind: 'spending', category: 'Bills' },
    ];
    expect(pick(run([txn('ATM SERVICE CHARGE', -500)], rules))).toEqual({
      kind: 'spending',
      category: 'Bills',
      decidedBy: 'rule',
    });
  });

  it('matches text and patterns without regard to case', () => {
    const rules: UserRule[] = [
      { match: { text: 'slips in - acme' }, kind: 'income', category: 'Salary' },
      { match: { regex: 'super(mart|market)' }, category: 'Groceries' },
    ];
    const result = run(
      [txn('SLIPS IN - ACME PVT LTD', 100000), txn('POS SUPERMART - COLOMBO', -2350)],
      rules,
    );
    expect(pick(result, 0)).toEqual({ kind: 'income', category: 'Salary', decidedBy: 'rule' });
    expect(pick(result, 1)).toEqual({ kind: 'spending', category: 'Groceries', decidedBy: 'rule' });
  });

  it('filters rules by account, direction and amount', () => {
    const rules: UserRule[] = [
      { match: { text: 'rent' }, account: 'cb', category: 'Rent' },
      { match: { text: 'gift' }, direction: 'in', kind: 'income', category: 'Other income' },
      { match: { text: 'shop' }, min: '1000', max: '5000', category: 'Shopping' },
    ];
    const result = run(
      [
        txn('rent march', -40000, 'main'),
        txn('rent march', -40000, 'cb'),
        txn('gift from aunt', -2000),
        txn('shop', -99999),
        txn('shop', -250000),
      ],
      rules,
    );
    expect(result.map((item) => item.category)).toEqual(['', 'Rent', '', '', 'Shopping']);
  });

  it('gives each bank wording its meaning', () => {
    const result = run([
      txn('INTEREST PAY SYS-GEN', 1240),
      txn('INTEREST WITHHELD', -62),
      txn('ATM SERVICE CHARGE', -500),
      txn('ATMCASHWDLSAMPLE BRANCH', -1000000),
      txn('SAVINGS DEPOSIT', 500000),
      txn('INITIAL DEP / 1 / 2', 10000, 'cb'),
      txn('Interest from eFD:003012345678', 50000, 'cb'),
      txn('INTEREST CHARGES', -1500, 'card'),
    ]);
    expect(result.map((item) => [item.kind, item.category])).toEqual([
      ['income', 'Interest'],
      ['spending', 'Tax'],
      ['spending', 'Fees'],
      ['spending', 'Cash'],
      ['other', ''],
      ['other', ''],
      ['income', 'Interest'],
      ['spending', 'Fees'],
    ]);
    expect(result[6]?.deposit).toBe('003012345678');
  });

  it('leaves transfer hints and purchases for matching', () => {
    const result = run([txn('CEFT-OWN', -30025), txn('POS SUPERMART - COLOMBO', -2350)]);
    expect(result.map((item) => [item.kind, item.decidedBy, item.tags])).toEqual([
      ['', undefined, ['transfer-hint']],
      ['', undefined, ['purchase']],
    ]);
  });

  it('settles zero amounts as other', () => {
    expect(pick(run([txn('CARD FEE WAIVED', 0)]))).toEqual({
      kind: 'other',
      category: '',
      decidedBy: 'default',
    });
  });

  it('gives settled rows one part for the whole amount', () => {
    const [row] = run([txn('ATM SERVICE CHARGE', -500)]);
    expect(row?.parts).toEqual([{ kind: 'spending', category: 'Fees', amount: -500 }]);
  });
});

describe('applyDefaults', () => {
  it('treats card credits as refunds and other rows as income or spending', () => {
    const result = applyDefaults(
      [txn('CAFE TWO REFUND', 50050, 'card'), txn('from friend', 2000), txn('book shop', -1500)],
      accounts,
    );
    expect(result.map((item) => [item.kind, item.category, item.decidedBy, item.parts])).toEqual([
      [
        'spending',
        'Refunds',
        'default',
        [{ kind: 'spending', category: 'Refunds', amount: 50050 }],
      ],
      [
        'income',
        'Other income',
        'default',
        [{ kind: 'income', category: 'Other income', amount: 2000 }],
      ],
      [
        'spending',
        'Uncategorised',
        'default',
        [{ kind: 'spending', category: 'Uncategorised', amount: -1500 }],
      ],
    ]);
  });

  it('leaves settled rows alone', () => {
    const settled = { ...txn('x', -1), kind: 'transfer' as const, decidedBy: 'match' as const };
    expect(applyDefaults([settled], accounts)).toEqual([settled]);
  });
});

describe('applyCategoryAnswers', () => {
  it('recategorises the fee part of a split row and keeps the transfer', () => {
    const split: Transaction = {
      ...txn('CEFT-OWN', -4002500),
      kind: 'transfer',
      decidedBy: 'match',
      parts: [
        { kind: 'transfer', category: '', amount: -4000000 },
        { kind: 'spending', category: 'Fees', amount: -2500 },
      ],
    };
    const decisions: Decision[] = [
      { id: 'd', at: 'x', type: 'set', txn: split.id, category: 'Bills' },
    ];
    const [result] = applyCategoryAnswers([split], decisions);
    expect(result?.kind).toBe('transfer');
    expect(result?.parts).toEqual([
      { kind: 'transfer', category: '', amount: -4000000 },
      { kind: 'spending', category: 'Bills', amount: -2500 },
    ]);
  });

  it('changes the category of a whole row', () => {
    const row = applyDefaults([txn('book shop', -1500)], accounts);
    const id = row[0]?.id ?? '';
    const [result] = applyCategoryAnswers(row, [
      { id: 'd', at: 'x', type: 'set', txn: id, category: 'Education' },
    ]);
    expect(result?.category).toBe('Education');
    expect(result?.parts).toEqual([{ kind: 'spending', category: 'Education', amount: -1500 }]);
  });
});
