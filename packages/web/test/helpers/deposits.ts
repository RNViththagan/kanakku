import { buildLedger } from '@kanakku/core';
import { MARCH_FILE, worldConfig, worldFiles } from '../../../core/test/helpers/world';

export const MARCH_TODAY = '2026-03-20';

export function depositWorld() {
  return buildLedger({
    files: [...worldFiles(), MARCH_FILE],
    config: worldConfig(),
    decisions: [],
    rates: [],
    today: MARCH_TODAY,
  });
}
