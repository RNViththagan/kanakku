import type { CoverageSegment, CurrencyCode } from '@kanakku/core';
import {
  Box,
  Card,
  CardContent,
  PageTitle,
  Stack,
  Tooltip,
  Typography,
  useColorScheme,
} from '@wso2/oxygen-ui';
import { AreaChart, BarChart, YAxis } from '@wso2/oxygen-ui-charts-react';
import { type ReactNode, useRef } from 'react';
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

export interface MoneyColors {
  income: string;
  outgoing: string;
  savings: string;
}

const MONEY_COLORS: Record<'light' | 'dark', MoneyColors> = {
  light: { income: '#2a78d6', outgoing: '#eb6834', savings: '#1baf7a' },
  dark: { income: '#3987e5', outgoing: '#d95926', savings: '#199e70' },
};

export function useMoneyColors(): MoneyColors {
  const { mode, systemMode } = useColorScheme();
  const dark = mode === 'dark' || (mode === 'system' && systemMode === 'dark');
  return dark ? MONEY_COLORS.dark : MONEY_COLORS.light;
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

function tooltipShown(chart: HTMLElement): boolean {
  const tooltip = chart.querySelector<HTMLElement>('.recharts-tooltip-wrapper');
  return tooltip !== null && getComputedStyle(tooltip).visibility === 'visible';
}

export function MoneyArea({
  data,
  series,
  currency,
  locale,
  height = 260,
  colors,
  onSelect,
}: {
  data: ChartPoint[];
  series: Array<{ key: string; name: string }>;
  currency: CurrencyCode;
  locale: string;
  height?: number;
  colors?: string[];
  onSelect?: (index: number) => void;
}) {
  const armed = useRef(false);
  return (
    <Box
      sx={onSelect ? { '& .recharts-surface': { cursor: 'pointer' } } : undefined}
      onPointerDown={(event) => {
        armed.current = tooltipShown(event.currentTarget);
      }}
      onClick={
        onSelect
          ? (event) => {
              if (!armed.current) return;
              const shown = event.currentTarget.querySelector('.recharts-tooltip-label');
              const index = data.findIndex((point) => point.label === shown?.textContent);
              if (index >= 0) onSelect(index);
            }
          : undefined
      }
    >
      <AreaChart
        data={data}
        xAxisDataKey="label"
        areas={series.map((item) => ({
          dataKey: item.key,
          name: item.name,
          type: 'monotone',
          ...(series.length > 1 ? { fillOpacity: 0.3 } : {}),
        }))}
        height={height}
        yAxis={{ show: false }}
        legend={{ show: series.length > 1 }}
        tooltip={moneyTooltip(currency, locale)}
        colors={colors}
      >
        {valueAxis(locale)}
      </AreaChart>
    </Box>
  );
}

export function MoneyBars({
  data,
  series,
  currency,
  locale,
  stacked = false,
  height = 280,
  colors,
  onSelect,
}: {
  data: ChartPoint[];
  series: Array<{ key: string; name: string }>;
  currency: CurrencyCode;
  locale: string;
  stacked?: boolean;
  height?: number;
  colors?: string[];
  onSelect?: (index: number) => void;
}) {
  return (
    <Box sx={onSelect ? { '& .recharts-bar-rectangle': { cursor: 'pointer' } } : undefined}>
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
        colors={colors}
        onClick={onSelect ? (_data: unknown, index: number) => onSelect(index) : undefined}
      >
        {valueAxis(locale)}
      </BarChart>
    </Box>
  );
}
