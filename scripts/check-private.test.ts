import { describe, expect, it } from 'vitest';
import { findViolations, parsePrivateStrings } from './check-private.mjs';

describe('findViolations', () => {
  it('blocks statement files outside fixtures', () => {
    expect(findViolations([{ path: 'data/a.csv', content: '' }], [])).toEqual([
      { path: 'data/a.csv', reason: 'statement file outside fixtures' },
    ]);
  });

  it('blocks statement files whatever the letter case of the extension', () => {
    expect(findViolations([{ path: 'Statement.XLSX', content: '' }], [])).toHaveLength(1);
  });

  it('allows fixtures and demo data', () => {
    const files = [
      { path: 'packages/core/test/fixtures/boc/a.csv', content: '' },
      { path: 'demo/data/Bank/BOC/a.csv', content: '' },
    ];
    expect(findViolations(files, [])).toEqual([]);
  });

  it('blocks config.yaml outside demo', () => {
    expect(findViolations([{ path: 'config.yaml', content: '' }], [])).toEqual([
      { path: 'config.yaml', reason: 'personal config file' },
    ]);
    const allowed = [
      { path: 'config.example.yaml', content: '' },
      { path: 'demo/data/kanakku/config.yaml', content: '' },
    ];
    expect(findViolations(allowed, [])).toEqual([]);
  });

  it('allows config.yaml in fixtures', () => {
    const files = [{ path: 'packages/core/test/fixtures/ledger/kanakku/config.yaml', content: '' }];
    expect(findViolations(files, [])).toEqual([]);
  });

  it('blocks private strings without printing them', () => {
    const result = findViolations([{ path: 'notes.md', content: 'x\n0099\n' }], ['0099']);
    expect(result).toEqual([{ path: 'notes.md', line: 2, reason: 'contains a private string' }]);
    expect(JSON.stringify(result)).not.toContain('0099');
  });
});

describe('parsePrivateStrings', () => {
  it('ignores blank and comment lines in the private list', () => {
    expect(parsePrivateStrings('# my numbers\n\n0099\n  \r\nPERERA\n')).toEqual(['0099', 'PERERA']);
  });
});
