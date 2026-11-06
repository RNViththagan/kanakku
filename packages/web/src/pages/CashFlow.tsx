import { cashFlowByMonth } from '@kanakku/core';
import {
  Box,
  Grid,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
} from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { explore, FlowExplorer } from '../FlowExplorer';
import { categoryTotals, type FlowOrigin, moneyFlow } from '../flow';
import { monthLabel, toMajor } from '../format';
import { runningTotals } from '../series';
import { useStoredChoice } from '../stored';
import { Amount, Empty, MoneyArea, MoneyBars, Section, Title, useMoneyColors } from '../ui';
import type { PageProps } from './types';

const VIEWS = ['monthly', 'cumulative'] as const;
type View = (typeof VIEWS)[number];
const VIEW_KEY = 'kanakku-cash-flow-view';

const SERIES = [
  { key: 'income', name: 'Income' },
  { key: 'outgoing', name: 'Outgoing' },
];

function Split({
  title,
  origin,
  rows,
  currency,
  locale,
}: {
  title: string;
  origin: FlowOrigin;
  rows: Array<[string, number]>;
  currency: string;
  locale: string;
}) {
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <Empty>Nothing in this range.</Empty>
      ) : (
        <Table size="small">
          <TableBody>
            {rows.map(([category, amount]) => (
              <TableRow key={category}>
                <TableCell>
                  <Link href={explore({ flow: `${origin}:${category}` })} underline="hover">
                    {category}
                  </Link>
                </TableCell>
                <TableCell align="right">
                  <Amount minor={amount} currency={currency} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

export function CashFlow({ ledger, range, rangeLabel, route }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const colors = useMoneyColors();
  const months = useMemo(() => cashFlowByMonth(ledger, range), [ledger, range]);
  const flow = useMemo(() => moneyFlow(months), [months]);
  const [view, setView] = useStoredChoice<View>(VIEW_KEY, VIEWS, 'monthly');
  const rows = useMemo(
    () =>
      view === 'cumulative'
        ? runningTotals(months)
        : months.map((month) => ({
            month: month.month,
            income: month.income,
            outgoing: month.spending,
          })),
    [months, view],
  );
  const points = rows.map((row) => ({
    label: monthLabel(row.month, locale),
    income: toMajor(row.income, home),
    outgoing: toMajor(row.outgoing, home),
  }));
  const income = useMemo(() => categoryTotals(months.map((month) => month.incomeBy)), [months]);
  const outgoing = useMemo(() => categoryTotals(months.map((month) => month.spendingBy)), [months]);
  const unvalued = [...new Set(months.flatMap((month) => month.unvalued))];

  return (
    <>
      <Title
        title="Cash flow"
        subtitle={`${rangeLabel}, in ${home}. Transfers between your accounts are left out.`}
      />
      {unvalued.length > 0 ? (
        <Box sx={{ mt: -1, mb: 3 }}>
          <Empty>{`Left out for want of an exchange rate: ${unvalued.join(', ')}.`}</Empty>
        </Box>
      ) : null}
      <Section title="Money flow">
        <FlowExplorer ledger={ledger} range={range} route={route} flow={flow} />
      </Section>
      <Section
        title="Income and outgoing by month"
        action={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_event, next: View | null) => {
              if (next) setView(next);
            }}
            aria-label="Show"
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5 } }}
          >
            <ToggleButton value="monthly">Monthly</ToggleButton>
            <ToggleButton value="cumulative">Cumulative</ToggleButton>
          </ToggleButtonGroup>
        }
      >
        {view === 'cumulative' ? (
          <MoneyArea
            data={points}
            series={SERIES}
            currency={home}
            locale={locale}
            colors={[colors.income, colors.outgoing]}
            height={280}
          />
        ) : (
          <MoneyBars
            data={points}
            series={SERIES}
            currency={home}
            locale={locale}
            colors={[colors.income, colors.outgoing]}
          />
        )}
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Month</TableCell>
              <TableCell align="right">Income</TableCell>
              <TableCell align="right">Outgoing</TableCell>
              <TableCell align="right">Net</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...rows].reverse().map((row) => (
              <TableRow key={row.month}>
                <TableCell>{monthLabel(row.month, locale)}</TableCell>
                <TableCell align="right">
                  <Amount minor={row.income} currency={home} locale={locale} />
                </TableCell>
                <TableCell align="right">
                  <Amount minor={row.outgoing} currency={home} locale={locale} />
                </TableCell>
                <TableCell align="right">
                  <Amount minor={row.income - row.outgoing} currency={home} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Split
            title="Income by category"
            origin="income"
            rows={income}
            currency={home}
            locale={locale}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Split
            title="Outgoing by category"
            origin="spending"
            rows={outgoing}
            currency={home}
            locale={locale}
          />
        </Grid>
      </Grid>
    </>
  );
}
