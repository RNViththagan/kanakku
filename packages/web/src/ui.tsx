import type { CoverageSegment, CurrencyCode } from '@kanakku/core';
import { Box, Card, CardContent, PageTitle, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { AreaChart, BarChart, YAxis } from '@wso2/oxygen-ui-charts-react';
import type { ReactNode } from 'react';
import { formatMajor, money, shortDate } from './format';
import { coverageBar } from './tables';

export function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <PageTitle sx={{ mb: 3 }}>
      <PageTitle.Header>{title}</PageTitle.Header>
      {subtitle ? <PageTitle.SubHeader>{subtitle}</PageTitle.SubHeader> : null}
    </PageTitle>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}
        >
          <Typography variant="h6">{title}</Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

export function Amount({
  minor,
  currency,
  locale,
}: {
  minor: number;
  currency: CurrencyCode;
  locale: string;
}) {
  return (
    <Box
      component="span"
      sx={{
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        color: minor < 0 ? 'error.main' : 'inherit',
      }}
    >
      {money(minor, currency, locale)}
    </Box>
  );
}

const STATE_COLORS = {
  covered: 'success.main',
  quiet: 'success.light',
  missing: 'error.main',
  none: 'action.disabledBackground',
};

const STATE_LABELS = {
  covered: 'Covered',
  quiet: 'No statement, balance unchanged',
  missing: 'Missing',
  none: 'No statements',
};

export function CoverageBar({
  segments,
  from,
  to,
  locale,
}: {
  segments: CoverageSegment[];
  from: string;
  to: string;
  locale: string;
}) {
  const parts = coverageBar(segments, from, to);
  const missing = parts.filter((part) => part.state === 'missing').length;
  return (
    <Box
      role="img"
      aria-label={missing > 0 ? `${missing} missing periods` : 'Statement coverage'}
      sx={{ display: 'flex', height: 10, borderRadius: 1, overflow: 'hidden', minWidth: 120 }}
    >
      {parts.map((part) => (
        <Tooltip
          key={part.from}
          title={`${STATE_LABELS[part.state]}: ${shortDate(part.from, locale)} to ${shortDate(part.to, locale)}`}
        >
          <Box sx={{ flexGrow: part.share, flexBasis: 0, bgcolor: STATE_COLORS[part.state] }} />
        </Tooltip>
      ))}
    </Box>
  );
}

export interface ChartPoint {
  label: string;
  [series: string]: string | number;
}

function valueAxis(locale: string) {
  const short = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  return (
    <YAxis
      width={56}
      axisLine={false}
      tickLine={false}
      tick={{ fill: 'currentColor', fontSize: 12 }}
      tickFormatter={(value: number) => short.format(value)}
      domain={[(low: number) => Math.min(0, low), 'auto']}
    />
  );
}

function moneyTooltip(currency: CurrencyCode, locale: string) {
  return {
    formatter: (value: unknown) => formatMajor(Number(value), currency, locale),
  };
}

export function MoneyArea({
  data,
  series,
  currency,
  locale,
  height = 260,
}: {
  data: ChartPoint[];
  series: Array<{ key: string; name: string }>;
  currency: CurrencyCode;
  locale: string;
  height?: number;
}) {
  return (
    <AreaChart
      data={data}
      xAxisDataKey="label"
      areas={series.map((item) => ({ dataKey: item.key, name: item.name, type: 'monotone' }))}
      height={height}
      yAxis={{ show: false }}
      legend={{ show: series.length > 1 }}
      tooltip={moneyTooltip(currency, locale)}
    >
      {valueAxis(locale)}
    </AreaChart>
  );
}

export function MoneyBars({
  data,
  series,
  currency,
  locale,
  stacked = false,
  height = 280,
}: {
  data: ChartPoint[];
  series: Array<{ key: string; name: string }>;
  currency: CurrencyCode;
  locale: string;
  stacked?: boolean;
  height?: number;
}) {
  return (
    <BarChart
      data={data}
      xAxisDataKey="label"
      bars={series.map((item) => ({
        dataKey: item.key,
        name: item.name,
        ...(stacked ? { stackId: 'total' } : {}),
      }))}
      height={height}
      yAxis={{ show: false }}
      legend={{ show: series.length > 1 }}
      tooltip={moneyTooltip(currency, locale)}
    >
      {valueAxis(locale)}
    </BarChart>
  );
}
