import type { CashFlowMonth } from '@kanakku/core';

export type FlowKind = 'category' | 'other' | 'savings';
export type FlowSide = 'in' | 'out';
export type FlowOrigin = 'income' | 'spending';

export interface FlowItem {
  key: string;
  label: string;
  value: number;
  kind: FlowKind;
  side: FlowSide;
  origin?: FlowOrigin;
  category?: string;
  folded: FlowItem[];
}

export interface MoneyFlow {
  sources: FlowItem[];
  uses: FlowItem[];
  total: number;
  income: number;
  outgoing: number;
}

export function categoryTotals(parts: Array<Record<string, number>>): Array<[string, number]> {
  const sums = new Map<string, number>();
  for (const part of parts) {
    for (const [category, amount] of Object.entries(part)) {
      sums.set(category, (sums.get(category) ?? 0) + amount);
    }
  }
  return [...sums].sort((a, b) => b[1] - a[1]);
}

function sumOf(items: FlowItem[]): number {
  return items.reduce((sum, item) => sum + item.value, 0);
}

function byValue(a: FlowItem, b: FlowItem): number {
  return b.value - a.value || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
}

function categoryItem(origin: FlowOrigin, category: string, total: number): FlowItem {
  const moved = total < 0;
  const side: FlowSide = (origin === 'income') !== moved ? 'in' : 'out';
  let label = category;
  if (moved && origin === 'income') label = `${category} returned`;
  if (moved && origin === 'spending' && category !== 'Refunds') label = `${category} refunds`;
  return {
    key: `${origin}:${category}`,
    label,
    value: Math.abs(total),
    kind: 'category',
    side,
    origin,
    category,
    folded: [],
  };
}

function fold(items: FlowItem[], side: FlowSide, limit: number): FlowItem[] {
  const sorted = [...items].sort(byValue);
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1);
  return [
    ...sorted.slice(0, limit - 1),
    { key: `other-${side}`, label: 'Other', value: sumOf(rest), kind: 'other', side, folded: rest },
  ];
}

export function moneyFlow(months: CashFlowMonth[], limit = 7): MoneyFlow {
  const items = [
    ...categoryTotals(months.map((month) => month.incomeBy)).map(([category, total]) =>
      categoryItem('income', category, total),
    ),
    ...categoryTotals(months.map((month) => month.spendingBy)).map(([category, total]) =>
      categoryItem('spending', category, total),
    ),
  ].filter((item) => item.value > 0);
  const keep = Math.max(1, limit);
  const sources = fold(
    items.filter((item) => item.side === 'in'),
    'in',
    keep,
  );
  const uses = fold(
    items.filter((item) => item.side === 'out'),
    'out',
    keep,
  );
  const net = sumOf(sources) - sumOf(uses);
  if (net > 0) {
    uses.push({
      key: 'saved',
      label: 'Saved',
      value: net,
      kind: 'savings',
      side: 'out',
      folded: [],
    });
  }
  if (net < 0) {
    sources.push({
      key: 'shortfall',
      label: 'Shortfall',
      value: -net,
      kind: 'savings',
      side: 'in',
      folded: [],
    });
  }
  return {
    sources,
    uses,
    total: sumOf(sources),
    income: months.reduce((sum, month) => sum + month.income, 0),
    outgoing: months.reduce((sum, month) => sum + month.spending, 0),
  };
}

export interface FlowEnd {
  x: number;
  top: number;
  bottom: number;
}

export interface FlowLink {
  from: FlowEnd;
  to: FlowEnd;
}

export interface FlowNode {
  item: FlowItem;
  side: 'in' | 'out';
  x: number;
  y: number;
  height: number;
  label: { x: number; y: number; anchor: 'start' | 'end'; text: string };
  link: FlowLink;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodeWidth: number;
  hub: { x: number; y: number; height: number };
  nodes: FlowNode[];
}

const HUB_HEIGHT = 240;
const LABEL_ROOM = 34;
const GAP = 8;
const HUB_LABEL = 44;
const NODE_WIDTH = 10;
const LABEL_GAP = 8;
const ELLIPSIS_WIDTH = 8;
const MIN_WIDTH = 320;

const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function letterWidth(letter: string): number {
  if (/^[A-Z]$/.test(letter)) return 9;
  return /^[ -~]$/.test(letter) ? 7 : 11;
}

function fit(text: string, room: number): string {
  const parts = [...letters.segment(text)].map((part) => part.segment);
  const widths = parts.map(letterWidth);
  if (widths.reduce((sum, width) => sum + width, 0) <= room) return text;
  let used = ELLIPSIS_WIDTH;
  let count = 0;
  while (count < parts.length && used + (widths[count] ?? 0) <= room) {
    used += widths[count] ?? 0;
    count += 1;
  }
  return `${parts.slice(0, count).join('').trimEnd()}…`;
}

function columnHeight(heights: number[]): number {
  const rooms = heights.reduce((sum, height) => sum + Math.max(height, LABEL_ROOM), 0);
  return rooms + GAP * Math.max(heights.length - 1, 0);
}

export function flowLayout(flow: MoneyFlow, space: number): FlowLayout {
  const width = Math.max(space, MIN_WIDTH);
  const scale = HUB_HEIGHT / flow.total;
  const tallest = Math.max(
    columnHeight(flow.sources.map((item) => item.value * scale)),
    columnHeight(flow.uses.map((item) => item.value * scale)),
  );
  const middle = Math.max(HUB_LABEL + HUB_HEIGHT / 2, tallest / 2);
  const labelWidth = Math.round(Math.min(150, Math.max(84, width * 0.18)));
  const hub = { x: (width - NODE_WIDTH) / 2, y: middle - HUB_HEIGHT / 2, height: HUB_HEIGHT };

  const column = (items: FlowItem[], side: 'in' | 'out', x: number): FlowNode[] => {
    const heights = items.map((item) => item.value * scale);
    let slot = middle - columnHeight(heights) / 2;
    let joint = hub.y;
    return items.map((item, index) => {
      const height = heights[index] ?? 0;
      const room = Math.max(height, LABEL_ROOM);
      const y = slot + (room - height) / 2;
      const bar = { x: side === 'in' ? x + NODE_WIDTH : x, top: y, bottom: y + height };
      const end = {
        x: side === 'in' ? hub.x : hub.x + NODE_WIDTH,
        top: joint,
        bottom: joint + height,
      };
      slot += room + GAP;
      joint += height;
      return {
        item,
        side,
        x,
        y,
        height,
        label: {
          x: side === 'in' ? x - LABEL_GAP : x + NODE_WIDTH + LABEL_GAP,
          y: y + height / 2,
          anchor: side === 'in' ? 'end' : 'start',
          text: fit(item.label, labelWidth - LABEL_GAP - 4),
        },
        link: side === 'in' ? { from: bar, to: end } : { from: end, to: bar },
      };
    });
  };

  return {
    width,
    height: middle + Math.max(HUB_HEIGHT, tallest) / 2,
    nodeWidth: NODE_WIDTH,
    hub,
    nodes: [
      ...column(flow.sources, 'in', labelWidth),
      ...column(flow.uses, 'out', width - labelWidth - NODE_WIDTH),
    ],
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function edges(end: FlowEnd): [number, number] {
  const size = end.bottom - end.top;
  if (size > 4) return [round(end.top + 1), round(end.bottom - 1)];
  const middle = (end.top + end.bottom) / 2;
  const half = Math.max(size, 1) / 2;
  return [round(middle - half), round(middle + half)];
}

export function ribbonPath({ from, to }: FlowLink): string {
  const [x0, x1, middle] = [round(from.x), round(to.x), round((from.x + to.x) / 2)];
  const [a, b] = edges(from);
  const [c, d] = edges(to);
  return `M${x0},${a}C${middle},${a} ${middle},${c} ${x1},${c}L${x1},${d}C${middle},${d} ${middle},${b} ${x0},${b}Z`;
}
