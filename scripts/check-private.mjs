import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STATEMENT_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.pdf', '.ofx', '.qif'];
const PRIVATE_LIST = '.private-strings';

/** @param {string} text */
export function parsePrivateStrings(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** @param {string} path */
function isSampleDataPath(path) {
  return path.startsWith('demo/') || path.split('/').includes('fixtures');
}

/**
 * @param {Array<{ path: string; content: string }>} files
 * @param {string[]} privateStrings
 * @returns {Array<{ path: string; line?: number; reason: string }>}
 */
export function findViolations(files, privateStrings) {
  /** @type {Array<{ path: string; line?: number; reason: string }>} */
  const violations = [];
  for (const { path, content } of files) {
    const lower = path.toLowerCase();
    if (STATEMENT_EXTENSIONS.some((ext) => lower.endsWith(ext)) && !isSampleDataPath(path)) {
      violations.push({ path, reason: 'statement file outside fixtures' });
    }
    if (lower.split('/').at(-1) === 'config.yaml' && !isSampleDataPath(path)) {
      violations.push({ path, reason: 'personal config file' });
    }
    if (privateStrings.length === 0) continue;
    content.split(/\r?\n/).forEach((line, index) => {
      if (privateStrings.some((secret) => line.includes(secret))) {
        violations.push({ path, line: index + 1, reason: 'contains a private string' });
      }
    });
  }
  return violations;
}

function main() {
  const staged = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const privateStrings = existsSync(PRIVATE_LIST)
    ? parsePrivateStrings(readFileSync(PRIVATE_LIST, 'utf8'))
    : [];
  const files = staged.map((path) => ({
    path,
    content:
      privateStrings.length === 0
        ? ''
        : execFileSync('git', ['show', `:${path}`], {
            encoding: 'utf8',
            maxBuffer: 256 * 1024 * 1024,
          }),
  }));
  const violations = findViolations(files, privateStrings);
  for (const v of violations) {
    console.error(`${v.path}${v.line ? `:${v.line}` : ''}: ${v.reason}`);
  }
  if (violations.length > 0) {
    console.error('Commit blocked: real statements and personal data stay out of this repository.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
