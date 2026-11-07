import { type Account, type Config, type ConfigError, findBank, type Ledger } from '@kanakku/core';
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo, useState } from 'react';
import { AccountForm } from './AccountForm';
import { configErrorText } from './config';
import { DepositForm } from './DepositForm';
import { shortDate } from './format';
import { ACCOUNT_TYPES } from './pages/Accounts';
import { type DepositRow, depositRows } from './tables';
import { Empty, Section } from './ui';

function dateText(date: string | undefined, locale: string): string {
  return date ? shortDate(date, locale) : '';
}

export function SettingsAccounts({
  ledger,
  config,
  errors,
  loaded,
  problem,
}: {
  ledger: Ledger;
  config: Config | undefined;
  errors: ConfigError[];
  loaded: boolean;
  problem: string | undefined;
}) {
  const { locale } = ledger;
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<Account>();
  const [term, setTerm] = useState<DepositRow>();
  const deposits = useMemo(() => depositRows(ledger), [ledger]);

  if (!loaded) {
    return (
      <Section title="Accounts">
        <Empty>{problem ?? 'Reading config.yaml…'}</Empty>
      </Section>
    );
  }
  if (!config) {
    return (
      <Section title="Accounts">
        <Typography variant="body2" sx={{ mb: 1 }}>
          Fix these in config.yaml first, then the accounts can be changed here.
        </Typography>
        <Stack spacing={0.5}>
          {errors.map((error) => (
            <Typography key={configErrorText(error)} variant="body2" color="error.main">
              {configErrorText(error)}
            </Typography>
          ))}
        </Stack>
      </Section>
    );
  }

  const discovered = ledger.accounts.filter(
    (account) => account.discovered && !config.accounts.some((item) => item.id === account.id),
  );
  const isClosed = (account: Account) =>
    (account.closed !== undefined && account.closed <= ledger.today) ||
    deposits.some((row) => row.account.id === account.id && row.status === 'withdrawn');
  const all = [...config.accounts, ...discovered];
  const hidden = all.filter(isClosed).length;
  const shown = showClosed ? all : all.filter((account) => !isClosed(account));
  const banks = [...new Set(shown.map((account) => account.bank))];

  return (
    <Section
      title="Accounts"
      action={
        hidden > 0 ? (
          <Button size="small" onClick={() => setShowClosed((current) => !current)}>
            {showClosed ? 'Hide closed ones' : 'Show closed ones'}
          </Button>
        ) : undefined
      }
    >
      {shown.length === 0 ? <Empty>No accounts in config.yaml yet.</Empty> : null}
      {banks.map((bank) => (
        <Box key={bank} sx={{ mb: 3, overflowX: 'auto' }}>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
            {findBank(bank)?.name ?? bank}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Number</TableCell>
                <TableCell>Opened</TableCell>
                <TableCell>Closed</TableCell>
                <TableCell>Card days</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown
                .filter((account) => account.bank === bank)
                .map((account) => {
                  const deposit = deposits.find((row) => row.account.id === account.id);
                  return (
                    <TableRow key={account.id}>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>{`${ACCOUNT_TYPES[account.type] ?? account.type}, ${account.currency}`}</TableCell>
                      <TableCell>{account.number ?? ''}</TableCell>
                      <TableCell>{dateText(account.opened, locale)}</TableCell>
                      <TableCell>{dateText(account.closed, locale)}</TableCell>
                      <TableCell>
                        {account.card
                          ? `Statement ${account.card.statementDay}, due ${account.card.dueDay}`
                          : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {account.discovered ? null : (
                          <Button
                            size="small"
                            aria-label={`Edit ${account.name}`}
                            onClick={() => setEditing(account)}
                          >
                            Edit
                          </Button>
                        )}
                        {deposit ? (
                          <Button
                            size="small"
                            aria-label={`Term and rate of ${account.name}`}
                            onClick={() => setTerm(deposit)}
                          >
                            Term and rate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </Box>
      ))}
      {editing ? <AccountForm account={editing} onClose={() => setEditing(undefined)} /> : null}
      {term ? <DepositForm ledger={ledger} row={term} onClose={() => setTerm(undefined)} /> : null}
    </Section>
  );
}
