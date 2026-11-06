import type { BankPlugin, FileInput, StatementFormat } from '../banks/types';

export const MIN_CONFIDENCE = 0.5;

export type Detected = { plugin: BankPlugin; format: StatementFormat; confidence: number };

export function detectFormat(
  file: FileInput,
  plugins: BankPlugin[],
): Detected | { unreadable: 'no-match' | 'tie' } {
  const name = file.name.toLowerCase();
  let best: Detected | undefined;
  let tie = false;
  for (const plugin of plugins) {
    for (const format of plugin.formats) {
      if (!format.fileTypes.some((type) => name.endsWith(type.toLowerCase()))) continue;
      let confidence: number | null;
      try {
        confidence = format.detect(file);
      } catch {
        confidence = null;
      }
      if (confidence === null || confidence < MIN_CONFIDENCE) continue;
      if (!best || confidence > best.confidence) {
        best = { plugin, format, confidence };
        tie = false;
      } else if (confidence === best.confidence) {
        tie = true;
      }
    }
  }
  if (!best) return { unreadable: 'no-match' };
  if (tie) return { unreadable: 'tie' };
  return best;
}
