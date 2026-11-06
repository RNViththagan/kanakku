import type { Issue, ParsedStatement } from '../banks/types';
import { decimalToMinor, minorToDecimal } from '../model/money';
import type { CurrencyCode } from '../model/types';

export const UNREADABLE_SHARE = 0.2;

export function applyUnreadableShare(parsed: ParsedStatement): ParsedStatement {
  const bad = parsed.issues.filter((issue) => issue.code === 'bad-row').length;
  const total = bad + parsed.rows.length;
  if (total === 0 || bad / total <= UNREADABLE_SHARE) return parsed;
  return {
    ...parsed,
    rows: [],
    issues: [
      ...parsed.issues,
      { level: 'error', code: 'unreadable', message: `${bad} of ${total} rows could not be read` },
    ],
  };
}

export function verifyChecks(parsed: ParsedStatement, currency: CurrencyCode): Issue[] {
  const { checks } = parsed;
  if (!checks) return [];
  let credits = 0;
  let debits = 0;
  let creditCount = 0;
  let debitCount = 0;
  for (const row of parsed.rows) {
    const minor = decimalToMinor(row.amount, currency);
    if (minor > 0) {
      credits += minor;
      creditCount += 1;
    } else if (minor < 0) {
      debits -= minor;
      debitCount += 1;
    }
  }
  const problems: string[] = [];
  const compare = (label: string, stated: string | undefined, actual: number) => {
    if (stated !== undefined && decimalToMinor(stated, currency) !== actual) {
      problems.push(`${label} ${stated} stated, ${minorToDecimal(actual, currency)} in rows`);
    }
  };
  compare('credits', checks.credits, credits);
  compare('debits', checks.debits, debits);
  if (checks.creditCount !== undefined && checks.creditCount !== creditCount) {
    problems.push(`${checks.creditCount} credits stated, ${creditCount} in rows`);
  }
  if (checks.debitCount !== undefined && checks.debitCount !== debitCount) {
    problems.push(`${checks.debitCount} debits stated, ${debitCount} in rows`);
  }
  if (problems.length === 0) return [];
  return [
    {
      level: 'warning',
      code: 'totals-mismatch',
      message: `Bank totals disagree with the rows: ${problems.join('; ')}`,
    },
  ];
}
