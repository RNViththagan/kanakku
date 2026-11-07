import type { CoverageSegment, CurrencyCode } from '@kanakku/core';
import {
  Box,
  Card,
  CardContent,
  LinearProgress,
  PageTitle,
  Stack,
  Tooltip,
  Typography,
  useColorScheme,
} from '@wso2/oxygen-ui';
import { AreaChart, BarChart, YAxis } from '@wso2/oxygen-ui-charts-react';
import { TrendingDown, TrendingUp } from '@wso2/oxygen-ui-icons-react';
import { type ReactNode, useRef } from 'react';
import { compact, formatMajor, money, shortDate } from './format';
import { OTHER } from './series';
import { coverageBar } from './tables';

const UNCATEGORISED = 'Uncategorised';

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

export function ShareBar({ value, color }: { value: number; color: string }) {
  return (
    <LinearProgress
      variant="determinate"
      value={Math.min(100, Math.max(0, value))}
      sx={{
        height: 6,
        borderRadius: 1,
        mt: 0.5,
        bgcolor: `color-mix(in srgb, ${color} 16%, transparent)`,
        '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
      }}
    />
  );
}

export function Stat({
  label,
  value,
  unit,
  icon,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, mb: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              color: 'primary.main',
              bgcolor: 'color-mix(in srgb, currentColor 14%, transparent)',
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        <Typography
          component="div"
          sx={{
            fontSize: '1.875rem',
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
          {unit ? (
            <Box
              component="span"
              sx={{
                ml: 0.75,
                fontSize: '0.875rem',
                fontWeight: 500,
                letterSpacing: 0,
                color: 'text.secondary',
              }}
            >
              {unit}
            </Box>
          ) : null}
        </Typography>
        {children ? <Box sx={{ mt: 1 }}>{children}</Box> : null}
      </CardContent>
    </Card>
  );
}

export function Change({
  minor,
  currency,
  locale,
  since,
}: {
  minor: number;
  currency: CurrencyCode;
  locale: string;
  since: string;
}) {
  const Icon = minor < 0 ? TrendingDown : TrendingUp;
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 0.5, color: minor < 0 ? 'error.main' : 'success.main' }}
      >
        <Icon size={16} aria-hidden />
        <Typography variant="body2" sx={{ color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>
          {`${minor > 0 ? '+' : ''}${compact(minor, currency, locale)}`}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {since}
      </Typography>
    </Stack>
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

export function useDark(): boolean {
  const { mode, systemMode } = useColorScheme();
  return mode === 'dark' || (mode === 'system' && systemMode === 'dark');
}

export function useMoneyColors(): MoneyColors {
  return useDark() ? MONEY_COLORS.dark : MONEY_COLORS.light;
}

const CATEGORY_COLORS = {
  light: {
    hues: ['#e34948', '#eda100', '#e87ba4', '#008300', '#6250d6'],
    unsorted: '#9e9e9e',
    rest: '#c7c7c7',
  },
  dark: {
    hues: ['#e66767', '#c98500', '#d55181', '#008300', '#9085e9'],
    unsorted: '#8a8a8a',
    rest: '#5c5c5c',
  },
};

export function categoryColors(categories: string[], dark: boolean): string[] {
  const set = dark ? CATEGORY_COLORS.dark : CATEGORY_COLORS.light;
  let named = 0;
  return categories.map((category) => {
    if (category === UNCATEGORISED) return set.unsorted;
    if (category === OTHER) return set.rest;
    const hue = set.hues[named % set.hues.length] ?? set.rest;
    named += 1;
    return hue;
  });
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
