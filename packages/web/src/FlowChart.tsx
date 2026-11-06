import type { CurrencyCode } from '@kanakku/core';
import { Box, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { useCallback, useMemo, useState } from 'react';
import { type FlowItem, flowLayout, type MoneyFlow, ribbonPath } from './flow';
import { compact, money } from './format';
import { Amount, Empty, type MoneyColors, useMoneyColors } from './ui';

interface FlowProps {
  flow: MoneyFlow;
  currency: CurrencyCode;
  locale: string;
  linkTo?: (item: FlowItem) => string | undefined;
}

function totals(
  flow: MoneyFlow,
): Array<{ label: string; value: number; color: keyof MoneyColors }> {
  const net = flow.income - flow.outgoing;
  return [
    { label: 'Income', value: flow.income, color: 'income' },
    { label: 'Outgoing', value: flow.outgoing, color: 'outgoing' },
    { label: net < 0 ? 'Shortfall' : 'Saved', value: Math.abs(net), color: 'savings' },
  ];
}

function through(flow: MoneyFlow): string {
  return flow.income >= flow.outgoing ? 'Money in' : 'Money out';
}

function colorOf(item: FlowItem, colors: MoneyColors): string {
  if (item.kind === 'savings') return colors.savings;
  return item.side === 'in' ? colors.income : colors.outgoing;
}

function Tip({
  item,
  flow,
  currency,
  locale,
}: {
  item: FlowItem;
  flow: MoneyFlow;
  currency: CurrencyCode;
  locale: string;
}) {
  const share = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(item.value / flow.total);
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {money(item.value, currency, locale)}
      </Typography>
      <Typography variant="caption">
        {`${item.label}, ${share} of ${through(flow).toLowerCase()}`}
      </Typography>
      {item.folded.length > 0 ? (
        <Typography variant="caption">
          {item.folded.map((part) => part.label).join(', ')}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function FlowDiagram({
  flow,
  width,
  currency,
  locale,
  linkTo,
}: FlowProps & { width: number }) {
  const colors = useMoneyColors();
  const layout = useMemo(() => flowLayout(flow, width), [flow, width]);
  const { hub, nodeWidth } = layout;
  const middle = hub.x + nodeWidth / 2;
  return (
    <Box
      component="figure"
      aria-label={totals(flow)
        .map((entry) => `${entry.label} ${money(entry.value, currency, locale)}.`)
        .join(' ')}
      sx={(theme) => ({
        m: 0,
        '& svg': { display: 'block' },
        '& .flow-name': { color: 'text.primary' },
        '& .flow-value': { color: 'text.secondary' },
        '& .flow-hub': { color: 'text.disabled' },
        '& .flow-ribbon': { fillOpacity: 0.35 },
        '& .flow-item:hover .flow-ribbon, & .flow-item:focus-visible .flow-ribbon': {
          fillOpacity: 0.6,
        },
        ...theme.applyStyles('dark', {
          '& .flow-ribbon': { fillOpacity: 0.5 },
          '& .flow-item:hover .flow-ribbon, & .flow-item:focus-visible .flow-ribbon': {
            fillOpacity: 0.75,
          },
        }),
      })}
    >
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: the figure names it; a title would add a native tooltip over every flow */}
      <svg width={layout.width} height={layout.height}>
        {layout.nodes.map((node) => {
          const href = linkTo?.(node.item);
          const name = `${node.item.label}, ${money(node.item.value, currency, locale)}`;
          const marks = (
            <>
              <path
                className="flow-ribbon"
                d={ribbonPath(node.link)}
                fill={colorOf(node.item, colors)}
              />
              <rect
                x={node.x}
                y={node.y + Math.min(node.height - 1, 0) / 2}
                width={nodeWidth}
                height={Math.max(node.height, 1)}
                rx={2}
                fill={colorOf(node.item, colors)}
              />
              <text x={node.label.x} y={node.label.y} textAnchor={node.label.anchor}>
                <tspan
                  className="flow-name"
                  x={node.label.x}
                  dy={-3}
                  fontSize={13}
                  fill="currentColor"
                >
                  {node.label.text}
                </tspan>
                <tspan
                  className="flow-value"
                  x={node.label.x}
                  dy={16}
                  fontSize={12}
                  fill="currentColor"
                >
                  {compact(node.item.value, currency, locale)}
                </tspan>
              </text>
            </>
          );
          return (
            <Tooltip
              key={node.item.key}
              followCursor
              title={<Tip item={node.item} flow={flow} currency={currency} locale={locale} />}
            >
              {href ? (
                <a className="flow-item" href={href} aria-label={name}>
                  {marks}
                </a>
              ) : (
                <g className="flow-item">{marks}</g>
              )}
            </Tooltip>
          );
        })}
        <rect
          className="flow-hub"
          x={hub.x}
          y={hub.y}
          width={nodeWidth}
          height={hub.height}
          rx={2}
          fill="currentColor"
        />
        <text x={middle} y={hub.y} textAnchor="middle">
          <tspan className="flow-value" x={middle} dy={-24} fontSize={12} fill="currentColor">
            {through(flow)}
          </tspan>
          <tspan
            className="flow-name"
            x={middle}
            dy={16}
            fontSize={13}
            fontWeight={600}
            fill="currentColor"
          >
            {compact(flow.total, currency, locale)}
          </tspan>
        </text>
      </svg>
    </Box>
  );
}

export function FlowChart({ flow, currency, locale, linkTo }: FlowProps) {
  const colors = useMoneyColors();
  const [width, setWidth] = useState(0);
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (flow.total === 0) return <Empty>Nothing came in or went out in this range.</Empty>;
  return (
    <>
      <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3, rowGap: 1, mb: 2 }}>
        {totals(flow).map((entry) => (
          <Stack
            key={entry.label}
            direction="row"
            sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1 }}
          >
            <Box
              sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: colors[entry.color] }}
            />
            <Typography variant="body2" color="text.secondary">
              {entry.label}
            </Typography>
            <Typography variant="body2">
              <Amount minor={entry.value} currency={currency} locale={locale} />
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box ref={measure} sx={{ overflowX: 'auto' }}>
        {width > 0 ? (
          <FlowDiagram
            flow={flow}
            width={width}
            currency={currency}
            locale={locale}
            linkTo={linkTo}
          />
        ) : null}
      </Box>
    </>
  );
}
