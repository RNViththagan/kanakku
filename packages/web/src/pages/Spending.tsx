import { spendingByCategory } from '@kanakku/core';
import { Box, LinearProgress, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { money, monthLabel, toMajor } from '../format';
import { hrefFor } from '../routes';
import { spendingTrend } from '../series';
import { Empty, MoneyBars, Section, Title } from '../ui';
import type { PageProps } from './types';

export function Spending({ ledger, range, rangeLabel }: PageProps) {
  const { homeCurrency: home, locale } = ledger;
  const categories = useMemo(() => spendingByCategory(ledger, range), [ledger, range]);
  const trend = useMemo(() => spendingTrend(ledger, range), [ledger, range]);
  const total = categories.reduce((sum, item) => sum + item.total, 0);

  return (
    <>
      <Title title="Spending" subtitle={`${rangeLabel}, ${money(total, home, locale)} in all`} />
      <Section title="By category">
        {categories.length === 0 ? (
          <Empty>No spending in this range.</Empty>
        ) : (
          <Stack spacing={1.5}>
            {categories.map((item) => (
              <Box key={item.category}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                  <Link
                    href={hrefFor({
                      page: 'transactions',
                      query: { category: item.category, from: range.from, to: range.to },
                    })}
                  >
                    {item.category}
                  </Link>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(item.total, home, locale)}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {`  ${item.count} ${item.count === 1 ? 'payment' : 'payments'}, ${total > 0 ? Math.round((item.total / total) * 100) : 0}%`}
                    </Typography>
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={total > 0 ? (item.total / total) * 100 : 0}
                  sx={{ height: 6, borderRadius: 1, mt: 0.5 }}
                />
              </Box>
            ))}
          </Stack>
        )}
      </Section>
      <Section title="By month">
        {trend.categories.length === 0 ? (
          <Empty>No spending in this range.</Empty>
        ) : (
          <MoneyBars
            data={trend.months.map((month) => ({
              label: monthLabel(month.month, locale),
              ...Object.fromEntries(
                Object.entries(month.values).map(([category, amount]) => [
                  category,
                  toMajor(amount, home),
                ]),
              ),
            }))}
            series={trend.categories.map((category) => ({ key: category, name: category }))}
            currency={home}
            locale={locale}
            stacked
            height={320}
          />
        )}
      </Section>
    </>
  );
}
