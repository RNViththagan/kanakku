import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLedger } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadDataFolder } from '../src/load';
import { renderReport } from '../src/report';

const world = fileURLToPath(new URL('../../core/test/fixtures/ledger', import.meta.url));

describe('loadDataFolder', () => {
  it('reads config and every statement file in the bank folders', () => {
    const contents = loadDataFolder(world);
    expect(contents.configErrors).toEqual([]);
    expect(contents.config?.accounts).toHaveLength(5);
    expect(contents.files.map((file) => file.path).sort()).toEqual([
      'boc/BOC_0011111111_2026-01-01_to_2026-01-31.csv',
      'boc/BOC_RECEIPT_overlap.csv',
      'boc/HNB_44444XXXXX44_USD_2026-01-01_to_2026-01-31.csv',
      'boc/notes.csv',
      'combank/transaction_history_0022222222_20260216.csv',
      'combank/transactions_history_current_period.csv',
      'hnb/HNB_33333XXXXX33_LKR_2026-01-01_to_2026-01-31.csv',
    ]);
    expect(contents.files.find((file) => file.path.startsWith('hnb/'))?.folderBank).toBe('hnb');
  });

  it('explains a missing config', () => {
    const empty = mkdtempSync(join(tmpdir(), 'kanakku-'));
    try {
      const contents = loadDataFolder(empty);
      expect(contents.config).toBeUndefined();
      expect(contents.configErrors[0]?.message).toContain('kanakku/config.yaml');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('renderReport', () => {
  it('summarises the ledger in plain text', () => {
    const contents = loadDataFolder(world);
    if (!contents.config) throw new Error('fixture config missing');
    const ledger = buildLedger({
      files: contents.files,
      config: contents.config,
      decisions: contents.decisions,
      rates: contents.rates,
      today: '2026-02-20',
    });
    const text = renderReport(ledger, {
      config: contents.config,
      dataFolder: world,
      files: contents.files,
    });
    expect(text).toContain('BOC Main');
    expect(text).toContain('285,290.00 LKR');
    expect(text).toContain('Needs you (5)');
    expect(text).toContain('move boc/HNB_44444XXXXX44_USD_2026-01-01_to_2026-01-31.csv -> hnb/');
    expect(text).not.toContain('undefined');
  });
});
