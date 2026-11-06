import type { StatementFormat } from '../types';
import { parseTable, scoreTable } from './table';

const DOWNLOAD_NAME = /^transaction_history_(\d{6,})_\d{8}\.csv$/i;

export const combankAccountCsv: StatementFormat = {
  id: 'combank-account-csv',
  fileTypes: ['.csv'],
  accountTypes: ['savings', 'current'],
  detect: (file) => scoreTable(file, true),
  parse: (file) => {
    const statement = parseTable(file, true);
    const hint = DOWNLOAD_NAME.exec(file.name)?.[1];
    if (hint) statement.account.numberHint = hint;
    return statement;
  },
};
