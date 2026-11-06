import type { Config } from '../config/schema';
import type { Ledger } from '../ledger/types';

export interface TidyProposal {
  file: string;
  action: 'rename' | 'move' | 'bin';
  to?: string;
  reason: 'improper-name' | 'wrong-folder' | 'duplicate';
}

function folderOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function join(folder: string, name: string): string {
  return folder === '' ? name : `${folder.replace(/\/+$/, '')}/${name}`;
}

function freeTarget(target: string, current: string, taken: Set<string>): string | undefined {
  if (target === current) return undefined;
  if (!taken.has(target)) return target;
  const dot = target.lastIndexOf('.');
  const stem = dot > target.lastIndexOf('/') ? target.slice(0, dot) : target;
  const ext = dot > target.lastIndexOf('/') ? target.slice(dot) : '';
  for (let copy = 2; ; copy += 1) {
    const candidate = `${stem}_${copy}${ext}`;
    if (candidate === current) return undefined;
    if (!taken.has(candidate)) return candidate;
  }
}

export function planTidy(input: {
  ledger: Ledger;
  folders: Config['folders'];
  existing: Set<string>;
}): TidyProposal[] {
  const taken = new Set(input.existing);
  const proposals: TidyProposal[] = [];
  for (const file of input.ledger.files) {
    if (file.status !== 'ok') continue;
    if (file.problems.includes('duplicate')) {
      proposals.push({ file: file.path, action: 'bin', reason: 'duplicate' });
      continue;
    }
    const wrongFolder = file.problems.includes('wrong-folder');
    const improperName = file.problems.includes('improper-name');
    if (!wrongFolder && !improperName) continue;
    const folder = wrongFolder
      ? (input.folders.find((candidate) => candidate.bank === file.bank)?.path ??
        folderOf(file.path))
      : folderOf(file.path);
    const name = improperName && file.tidyName ? file.tidyName : nameOf(file.path);
    const target = freeTarget(join(folder, name), file.path, taken);
    if (!target) continue;
    taken.add(target);
    proposals.push({
      file: file.path,
      action: wrongFolder ? 'move' : 'rename',
      to: target,
      reason: wrongFolder ? 'wrong-folder' : 'improper-name',
    });
  }
  return proposals;
}
