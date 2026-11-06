import { cashFlowByMonth } from '@kanakku/core';
import { Grid, Table, TableBody, TableCell, TableHead, TableRow } from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { FlowChart } from '../FlowChart';
import { categoryTotals, moneyFlow } from '../flow';
import { monthLabel, toMajor } from '../format';
import { Amount, Empty, MoneyBars, Section, Title, useMoneyColors } from '../ui';
import type { PageProps } from './types';

function Split({
  title,
  rows,
  currency,
  locale,
}: {
  title: string;
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
                <TableCell>{category}</TableCell>
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

export function CashFlow({ ledger, range, rangeLabel }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const colors = useMoneyColors();
  const months = useMemo(() => cashFlowByMonth(ledger, range), [ledger, range]);
  const flow = useMemo(() => moneyFlow(months), [months]);
  const income = useMemo(() => categoryTotals(months.map((month) => month.incomeBy)), [months]);
  const outgoing = useMemo(() => categoryTotals(months.map((month) => month.spendingBy)), [months]);
  const unvalued = [...new Set(months.flatMap((month) => month.unvalued))];

  return (
    <>
      <Title
        title="Cash flow"
        subtitle={`${rangeLabel}, in ${home}. Transfers between your accounts are left out.`}
      />
      <Section title="Money flow">
        <FlowChart flow={flow} currency={home} locale={locale} />
      </Section>
      <Section title="Income and outgoing by month">
        <MoneyBars
          data={months.map((month) => ({
            label: monthLabel(month.month, locale),
            income: toMajor(month.income, home),
            outgoing: toMajor(month.spending, home),
          }))}
          series={[
            { key: 'income', name: 'Income' },
            { key: 'outgoing', name: 'Outgoing' },
          ]}
          currency={home}
          locale={locale}
          colors={[colors.income, colors.outgoing]}
        />
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
            {[...months].reverse().map((month) => (
              <TableRow key={month.month}>
                <TableCell>{monthLabel(month.month, locale)}</TableCell>
                <TableCell align="right">
                  <Amount minor={month.income} currency={home} locale={locale} />
                </TableCell>
                <TableCell align="right">
                  <Amount minor={month.spending} currency={home} locale={locale} />
                </TableCell>
                <TableCell align="right">
                  <Amount minor={month.net} currency={home} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {unvalued.length > 0 ? (
          <Empty>{`Left out for want of an exchange rate: ${unvalued.join(', ')}.`}</Empty>
        ) : null}
      </Section>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Split title="Income by category" rows={income} currency={home} locale={locale} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Split title="Outgoing by category" rows={outgoing} currency={home} locale={locale} />
        </Grid>
      </Grid>
    </>
  );
}
