import type { CashFlowMonth } from '@kanakku/core';

export type FlowKind = 'category' | 'other' | 'savings';

export interface FlowItem {
  key: string;
  label: string;
  value: number;
  kind: FlowKind;
  folded: string[];
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

function add(side: Map<string, number>, category: string, amount: number): void {
  side.set(category, (side.get(category) ?? 0) + amount);
}

function sumOf(items: FlowItem[]): number {
  return items.reduce((sum, item) => sum + item.value, 0);
}

function fold(side: Map<string, number>, prefix: string, limit: number): FlowItem[] {
  const sorted = [...side].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const kept = sorted.length > limit ? sorted.slice(0, limit - 1) : sorted;
  const items: FlowItem[] = kept.map(([category, value]) => ({
    key: `${prefix}:${category}`,
    label: category,
    value,
    kind: 'category',
    folded: [],
  }));
  const rest = sorted.slice(kept.length);
  if (rest.length > 0) {
    items.push({
      key: `${prefix}*`,
      label: 'Other',
      value: rest.reduce((sum, [, value]) => sum + value, 0),
      kind: 'other',
      folded: rest.map(([category]) => category),
    });
  }
  return items;
}

export function moneyFlow(months: CashFlowMonth[], limit = 7): MoneyFlow {
  const ins = new Map<string, number>();
  const outs = new Map<string, number>();
  for (const [category, amount] of categoryTotals(months.map((month) => month.incomeBy))) {
    if (amount > 0) add(ins, category, amount);
    else if (amount < 0) add(outs, category, -amount);
  }
  for (const [category, amount] of categoryTotals(months.map((month) => month.spendingBy))) {
    if (amount > 0) add(outs, category, amount);
    else if (amount < 0) add(ins, category, -amount);
  }
  const sources = fold(ins, 'in', limit);
  const uses = fold(outs, 'out', limit);
  const net = sumOf(sources) - sumOf(uses);
  if (net > 0) uses.push({ key: 'saved', label: 'Saved', value: net, kind: 'savings', folded: [] });
  if (net < 0) {
    sources.push({ key: 'drawn', label: 'From savings', value: -net, kind: 'savings', folded: [] });
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
const CHAR_WIDTH = 7.5;
const MIN_WIDTH = 320;

function clip(text: string, chars: number): string {
  return text.length > chars ? `${text.slice(0, chars - 1).trimEnd()}…` : text;
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
  const chars = Math.floor((labelWidth - LABEL_GAP - 4) / CHAR_WIDTH);
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
          text: clip(item.label, chars),
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
