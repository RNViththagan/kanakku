import { parseDmy } from '../model/dates';
import type { IsoDate } from '../model/types';
import type { Issue } from './types';

const DAY_MONTH_YEAR = /^\d{2}\/\d{2}\/\d{4}$/;

export function readDayMonthDate(text: string): { date?: IsoDate; monthFirst: boolean } {
  const value = text.trim();
  if (!DAY_MONTH_YEAR.test(value)) return { monthFirst: false };
  const date = parseDmy(value);
  if (date) return { date, monthFirst: false };
  const [first = '', second = '', year = ''] = value.split('/');
  return { monthFirst: parseDmy(`${second}/${first}/${year}`) !== undefined };
}

export function monthFirstIssue(file: string): Issue {
  return {
    level: 'error',
    code: 'date-order-suspect',
    message:
      'Some dates only make sense month first, so this file was probably re-saved by a spreadsheet app. Download it again from the bank.',
    file,
  };
}

export function badRowIssue(file: string, line: number): Issue {
  return {
    level: 'warning',
    code: 'bad-row',
    message: `Line ${line} could not be read`,
    file,
    line,
  };
}
