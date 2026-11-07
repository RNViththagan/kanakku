import { findBank } from '@kanakku/core';
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { money, monthLabel, shortDate, toMajor } from '../format';
import { accountRow, transactionRows } from '../model';
import { balanceSeries } from '../series';
import { depositRows, fileRows, filterTransactions } from '../tables';
import { CoverageBar, Empty, MoneyArea, Section, ShareBar, Title, useMoneyColors } from '../ui';
import { ACCOUNT_TYPES } from './Accounts';
import { TransactionTable } from './Transactions';
import type { PageProps } from './types';

const CYCLE_STATUS = {
  open: { label: 'Open', color: 'info' },
  paid: { label: 'Paid', color: 'success' },
  'part-paid': { label: 'Part paid', color: 'warning' },
  unpaid: { label: 'Unpaid', color: 'warning' },
  overdue: { label: 'Overdue', color: 'error' },
} as const;

export function Account({ ledger, route, range, rangeLabel }: PageProps) {
  const { locale } = ledger;
  const colors = useMoneyColors();
  const account = ledger.accounts.find((candidate) => candidate.id === route.param);
  const row = useMemo(() => (account ? accountRow(ledger, account) : undefined), [ledger, account]);
  const series = useMemo(
    () => (account ? balanceSeries(ledger, account.id, range) : []),
    [ledger, account, range],
  );
  const files = useMemo(() => {
    const paths = new Set(
      ledger.files.filter((file) => file.account === account?.id).map((file) => file.path),
    );
    return fileRows(ledger).filter((file) => paths.has(file.path));
  }, [ledger, account]);
  const transactions = useMemo(
    () =>
      account
        ? filterTransactions(transactionRows(ledger), {
            account: account.id,
            from: range.from,
            to: range.to,
          })
        : [],
    [ledger, account, range],
  );

  if (!account || !row) {
    return (
      <>
        <Title title="Account" />
        <Empty>{`There is no account called ${route.param ?? ''}.`}</Empty>
      </>
    );
  }
  const currency = account.currency;
  const cycles = [...(ledger.cards[account.id] ?? [])].reverse();
  const deposit = depositRows(ledger).find((item) => item.account.id === account.id);
  const limit = account.card?.limit;
  const owed = row.balance === undefined ? undefined : -row.balance;
  const known = series.filter((point) => point.balance !== undefined);
  const card = account.type === 'credit-card';

  return (
    <>
      <Title
        title={account.name}
        subtitle={[
          findBank(account.bank)?.name ?? account.bank,
          ACCOUNT_TYPES[account.type],
          currency,
          account.number,
        ]
          .filter(Boolean)
          .join(', ')}
      />
      <Section title="Balance">
        <Typography variant="h5" sx={{ mb: 1 }}>
          {row.balance === undefined
            ? 'No statements yet'
            : card
              ? `${money(-row.balance, currency, locale)} owed`
              : money(row.balance, currency, locale)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {`On ${shortDate(row.asOf, locale)}`}
          {currency !== ledger.homeCurrency && row.homeValue !== undefined
            ? `, worth ${money(row.homeValue, ledger.homeCurrency, locale)}`
            : ''}
        </Typography>
        {account.type !== 'fixed-deposit' ? (
          <CoverageBar
            segments={row.coverage?.segments ?? []}
            from={range.from}
            to={range.to}
            locale={locale}
          />
        ) : null}
        {known.length > 1 ? (
          <Box sx={{ mt: 2 }}>
            <MoneyArea
              data={known.map((point) => ({
                label: monthLabel(point.month, locale),
                value: toMajor(card ? -(point.balance ?? 0) : (point.balance ?? 0), currency),
              }))}
              series={[{ key: 'value', name: card ? 'Owed' : 'Balance' }]}
              currency={currency}
              locale={locale}
              colors={[card ? colors.outgoing : colors.savings]}
            />
          </Box>
        ) : null}
      </Section>

      {account.type === 'credit-card' ? (
        <Section title="Billing cycles">
          {limit !== undefined && owed !== undefined ? (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                {`${money(owed, currency, locale)} used of ${money(limit, currency, locale)}`}
              </Typography>
              <ShareBar value={limit > 0 ? (owed / limit) * 100 : 0} color={colors.outgoing} />
            </Box>
          ) : null}
          {cycles.length === 0 ? (
            <Empty>No billing cycles yet.</Empty>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Statement</TableCell>
                  <TableCell align="right">Billed</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell>Due</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.statementDate}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {shortDate(cycle.statementDate, locale)}
                    </TableCell>
                    <TableCell align="right">{money(cycle.billed, currency, locale)}</TableCell>
                    <TableCell align="right">{money(cycle.paid, currency, locale)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {shortDate(cycle.dueDate, locale)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${CYCLE_STATUS[cycle.status].label}${cycle.coverage === 'full' ? '' : ', partly seen'}`}
                        color={CYCLE_STATUS[cycle.status].color}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      ) : null}

      {deposit ? (
        <Section title="Deposit">
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell>Principal</TableCell>
                <TableCell align="right">
                  {deposit.principal === undefined
                    ? 'Not set'
                    : money(deposit.principal, currency, locale)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Start</TableCell>
                <TableCell align="right">
                  {deposit.start ? shortDate(deposit.start, locale) : 'Not set'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Maturity</TableCell>
                <TableCell align="right">
                  {deposit.maturity
                    ? `${shortDate(deposit.maturity, locale)}, ${deposit.daysLeft} days left`
                    : 'Not set'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Rate</TableCell>
                <TableCell align="right">
                  {deposit.rate === undefined ? 'Not set' : `${deposit.rate}%`}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>
      ) : null}

      {account.type !== 'fixed-deposit' ? (
        <Section title="Statements">
          {files.length === 0 ? (
            <Empty>No statement files for this account.</Empty>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell align="right">Rows</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.path}>
                    <TableCell sx={{ wordBreak: 'break-all' }}>{file.path}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {file.from && file.to
                        ? `${shortDate(file.from, locale)} to ${shortDate(file.to, locale)}`
                        : ''}
                    </TableCell>
                    <TableCell align="right">{file.rows}</TableCell>
                    <TableCell>{file.status.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      ) : null}

      {account.type !== 'fixed-deposit' ? (
        <Section title={`Transactions, ${rangeLabel.toLowerCase()}`}>
          <TransactionTable rows={transactions} locale={locale} height={480} />
        </Section>
      ) : null}
    </>
  );
}
