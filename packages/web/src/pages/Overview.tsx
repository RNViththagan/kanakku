import { addDays, endOfMonth, monthKey, spendingByCategory, startOfMonth } from '@kanakku/core';
import {
  Box,
  Chip,
  Grid,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { CreditCard, Landmark, PiggyBank, ShoppingCart, Wallet } from '@wso2/oxygen-ui-icons-react';
import { useMemo } from 'react';
import { compact, money, monthLabel, shortDate, toMajor } from '../format';
import {
  accountsByBank,
  latestMonth,
  needLabel,
  overviewStats,
  rangeEndingAt,
  topNeeds,
} from '../model';
import { hrefFor } from '../routes';
import { netWorthPoints } from '../series';
import {
  Amount,
  Change,
  CoverageBar,
  Empty,
  MoneyArea,
  Section,
  ShareBar,
  Stat,
  Title,
  useMoneyColors,
} from '../ui';
import type { PageProps } from './types';

export const SEVERITY_COLORS = { high: 'error', normal: 'warning', low: 'default' } as const;

export function Overview({ ledger }: PageProps) {
  const { today, homeCurrency: home, locale } = ledger;
  const stats = useMemo(() => overviewStats(ledger), [ledger]);
  const year = useMemo(() => rangeEndingAt(today, 12), [today]);
  const points = useMemo(() => netWorthPoints(ledger, year), [ledger, year]);
  const banks = useMemo(() => accountsByBank(ledger), [ledger]);
  const closedCount = banks.flatMap((bank) => bank.accounts).filter((row) => row.closed).length;
  const month = latestMonth(ledger);
  const monthEnd = endOfMonth(`${month}-01`);
  const monthRange = useMemo(
    () => ({ from: `${month}-01`, to: monthEnd < today ? monthEnd : today }),
    [month, monthEnd, today],
  );
  const where = useMemo(() => spendingByCategory(ledger, monthRange), [ledger, monthRange]);
  const spentInMonth = where.reduce((sum, item) => sum + item.total, 0);
  const needs = topNeeds(ledger, 5);
  const lastMonth = monthLabel(monthKey(addDays(startOfMonth(today), -1)), locale);
  const thisMonth = monthLabel(monthKey(today), locale);
  const short = (minor: number) => compact(minor, home, locale);
  const colors = useMoneyColors();
  const names = new Map(ledger.accounts.map((account) => [account.id, account.name]));

  return (
    <>
      <Title title="Overview" subtitle={`Your money on ${shortDate(today, locale)}`} />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: stats.hasCards ? 2.4 : 3 }}>
          <Stat
            label="Net worth"
            value={short(stats.netWorth)}
            unit={home}
            icon={<Wallet size={18} />}
          >
            {stats.netWorthChange === undefined ? null : (
              <Change
                minor={stats.netWorthChange}
                currency={home}
                locale={locale}
                since={`since ${lastMonth}`}
              />
            )}
          </Stat>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: stats.hasCards ? 2.4 : 3 }}>
          <Stat
            label="In accounts"
            value={short(stats.inAccounts)}
            unit={home}
            icon={<Landmark size={18} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: stats.hasCards ? 2.4 : 3 }}>
          <Stat
            label="In fixed deposits"
            value={short(stats.inDeposits)}
            unit={home}
            icon={<PiggyBank size={18} />}
          />
        </Grid>
        {stats.hasCards ? (
          <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
            <Stat
              label="Owed on cards"
              value={short(stats.owedOnCards)}
              unit={home}
              icon={<CreditCard size={18} />}
            />
          </Grid>
        ) : null}
        <Grid size={{ xs: 12, sm: 6, lg: stats.hasCards ? 2.4 : 3 }}>
          <Stat
            label={`Spent in ${thisMonth}`}
            value={short(stats.spentThisMonth)}
            unit={home}
            icon={<ShoppingCart size={18} />}
          >
            <Typography variant="body2" color="text.secondary">
              {`${short(stats.spentLastMonth)} ${home} in ${lastMonth}`}
            </Typography>
          </Stat>
        </Grid>
      </Grid>
      {stats.unknown.length > 0 || stats.unvalued.length > 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 3 }}>
          {stats.unknown.length > 0
            ? `Not known yet: ${stats.unknown.map((id) => names.get(id) ?? id).join(', ')}. `
            : ''}
          {stats.unvalued.length > 0 ? `No exchange rate for ${stats.unvalued.join(', ')}.` : ''}
        </Typography>
      ) : null}

      <Section
        title="Net worth, last 12 months"
        action={<Link href={hrefFor({ page: 'net-worth' })}>Details</Link>}
      >
        {points.length === 0 ? (
          <Empty>No statements yet.</Empty>
        ) : (
          <MoneyArea
            data={points.map((point) => ({
              label: monthLabel(point.month, locale),
              value: toMajor(point.total, home),
            }))}
            series={[{ key: 'value', name: 'Net worth' }]}
            currency={home}
            locale={locale}
            colors={[colors.savings]}
          />
        )}
      </Section>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section
            title="Needs you"
            action={<Link href={hrefFor({ page: 'needs' })}>All {ledger.needs.length}</Link>}
          >
            {needs.length === 0 ? (
              <Empty>Nothing needs you.</Empty>
            ) : (
              <Stack spacing={1.5}>
                {needs.map((need) => (
                  <Stack
                    key={need.id}
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: 'flex-start' }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      label={needLabel(need.type)}
                      color={SEVERITY_COLORS[need.severity]}
                    />
                    <Typography variant="body2">{need.message}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Section>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section
            title={`Where ${monthLabel(month, locale)} went`}
            action={
              <Typography variant="body2" color="text.secondary">
                {money(spentInMonth, home, locale)}
              </Typography>
            }
          >
            {where.length === 0 ? (
              <Empty>No spending in this month.</Empty>
            ) : (
              <Stack spacing={1.5}>
                {where.slice(0, 8).map((item) => (
                  <Box key={item.category}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                      <Link
                        href={hrefFor({
                          page: 'transactions',
                          query: { category: item.category, ...monthRange },
                        })}
                        variant="body2"
                      >
                        {item.category}
                      </Link>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {money(item.total, home, locale)}
                      </Typography>
                    </Stack>
                    <ShareBar
                      value={spentInMonth > 0 ? (item.total / spentInMonth) * 100 : 0}
                      color={colors.outgoing}
                    />
                  </Box>
                ))}
              </Stack>
            )}
          </Section>
        </Grid>
      </Grid>

      <Section
        title="Accounts"
        action={<Link href={hrefFor({ page: 'accounts' })}>All accounts</Link>}
      >
        {banks.length === 0 ? (
          <Empty>No accounts yet. Add them to config.yaml.</Empty>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell sx={{ width: '35%' }}>Statements, last 12 months</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {banks
                .filter((bank) => bank.accounts.some((row) => !row.closed))
                .flatMap((bank) => [
                  <TableRow key={bank.bank}>
                    <TableCell colSpan={3} sx={{ bgcolor: 'action.hover' }}>
                      <Typography variant="subtitle2">{bank.name}</Typography>
                    </TableCell>
                  </TableRow>,
                  ...bank.accounts
                    .filter((row) => !row.closed)
                    .map((row) => (
                      <TableRow key={row.account.id} hover>
                        <TableCell>
                          <Link href={hrefFor({ page: 'account', param: row.account.id })}>
                            {row.account.name}
                          </Link>
                        </TableCell>
                        <TableCell align="right">
                          {row.balance === undefined ? (
                            <Typography variant="body2" color="text.secondary">
                              No statements
                            </Typography>
                          ) : (
                            <>
                              <Amount
                                minor={row.balance}
                                currency={row.account.currency}
                                locale={locale}
                              />
                              {row.account.currency !== home && row.homeValue !== undefined ? (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  component="div"
                                >
                                  {money(row.homeValue, home, locale)}
                                </Typography>
                              ) : null}
                            </>
                          )}
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
                    )),
                ])}
            </TableBody>
          </Table>
        )}
        {closedCount > 0 ? (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            {`${closedCount} closed ${closedCount === 1 ? 'account is' : 'accounts are'} on the Accounts page.`}
          </Typography>
        ) : null}
      </Section>
    </>
  );
}
