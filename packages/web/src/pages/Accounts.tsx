import {
  FormControlLabel,
  Link,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { money, shortDate } from '../format';
import { accountsByBank, rangeEndingAt } from '../model';
import { hrefFor } from '../routes';
import { useStoredChoice } from '../stored';
import { Amount, CoverageBar, Empty, Section, Title } from '../ui';
import type { PageProps } from './types';

export const ACCOUNT_TYPES = {
  savings: 'Savings',
  current: 'Current',
  'credit-card': 'Credit card',
  'fixed-deposit': 'Fixed deposit',
};

export function Accounts({ ledger }: PageProps) {
  const { homeCurrency: home, locale, today } = ledger;
  const banks = useMemo(() => accountsByBank(ledger), [ledger]);
  const year = rangeEndingAt(today, 12);
  const [closed, setClosed] = useStoredChoice('kanakku-closed-accounts', ['hide', 'show'], 'hide');
  const closedCount = banks.reduce(
    (sum, bank) => sum + bank.accounts.filter((row) => row.closed).length,
    0,
  );
  const shown = banks
    .map((bank) => ({
      ...bank,
      accounts: bank.accounts.filter((row) => closed === 'show' || !row.closed),
    }))
    .filter((bank) => bank.accounts.length > 0);

  return (
    <>
      <Title title="Accounts" subtitle="Balances from your latest statements" />
      {banks.length === 0 ? <Empty>No accounts yet. Add them to config.yaml.</Empty> : null}
      {closedCount > 0 ? (
        <FormControlLabel
          sx={{ mt: -1, mb: 2 }}
          control={
            <Switch
              checked={closed === 'show'}
              onChange={(event) => setClosed(event.target.checked ? 'show' : 'hide')}
            />
          }
          label={`Show closed accounts and withdrawn deposits (${closedCount})`}
        />
      ) : null}
      {shown.map((bank) => (
        <Section key={bank.bank} title={bank.name}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Last statement</TableCell>
                <TableCell sx={{ width: '30%' }}>Last 12 months</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bank.accounts.map((row) => (
                <TableRow
                  key={row.account.id}
                  hover
                  sx={row.closed ? { opacity: 0.55 } : undefined}
                >
                  <TableCell>
                    <Link href={hrefFor({ page: 'account', param: row.account.id })}>
                      {row.account.name}
                    </Link>
                    {row.coverage?.behindDays ? (
                      <Typography variant="caption" color="warning.main" component="div">
                        {`${row.coverage.behindDays} days behind`}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {`${ACCOUNT_TYPES[row.account.type]}, ${row.account.currency}${row.closed ? ', closed' : ''}`}
                  </TableCell>
                  <TableCell align="right">
                    {row.balance === undefined ? (
                      'No statements'
                    ) : (
                      <>
                        <Amount
                          minor={row.balance}
                          currency={row.account.currency}
                          locale={locale}
                        />
                        {row.account.currency !== home && row.homeValue !== undefined ? (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {money(row.homeValue, home, locale)}
                          </Typography>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {row.lastStatement ? shortDate(row.lastStatement, locale) : ''}
                  </TableCell>
                  <TableCell>
                    {row.account.type === 'fixed-deposit' ? (
                      <Typography variant="caption" color="text.secondary">
                        Tracked from transfers
                      </Typography>
                    ) : (
                      <CoverageBar
                        segments={row.coverage?.segments ?? []}
                        from={year.from}
                        to={year.to}
                        locale={locale}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ))}
    </>
  );
}
