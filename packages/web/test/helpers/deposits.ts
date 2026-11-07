import { buildLedger } from '@kanakku/core';
import { worldConfig, worldFiles } from '../../../core/test/helpers/world';

export const MARCH_TODAY = '2026-03-20';

const march = {
  path: 'combank/transaction_history_0022222222_20260320.csv',
  name: 'transaction_history_0022222222_20260320.csv',
  folderBank: 'combank',
  text: [
    ',,,,Transaction History,,,,,,,',
    ',,,,,,,,,,e-Receipt,',
    ',Transaction Date,,Description,,Currency,Debit,Credit,Running Balance,,,',
    ',09/03/2026,,IB Time Redemption Deposit / - / -,,LKR,,"5,000.01","10,696.83",,,',
    ',05/03/2026,,TRF TO: 003077777777 / IBT0000000011 / -,,LKR,"5,000.00",,"5,696.82",,,',
    ',02/03/2026,,TRF TO: 003088888888 / IBT0000000010 / -,,LKR,"120,000.00",,"10,696.82",,,',
    ',02/03/2026,,Interest from eFD:3099999999 / - / -,,LKR,,709.32,"130,696.82",,,',
    ',02/03/2026,,Principal from eFD:3099999999 / - / -,,LKR,,"120,000.00","129,987.50",,,',
    ',,Generated at 3/20/26 10:00 AM,,,,,,, Page 1 of ,, 1',
  ].join('\n'),
};

export function depositWorld() {
  return buildLedger({
    files: [...worldFiles(), march],
    config: worldConfig(),
    decisions: [],
    rates: [],
    today: MARCH_TODAY,
  });
}
