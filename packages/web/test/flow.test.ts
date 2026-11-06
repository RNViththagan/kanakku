import { cashFlowByMonth } from '@kanakku/core';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../core/test/helpers/world';
import { type FlowItem, flowLayout, moneyFlow, ribbonPath } from '../src/flow';
import { month } from './helpers/months';

const worldMonths = cashFlowByMonth(loadWorld(), { from: '2026-01-01', to: '2026-02-20' });

function pick(items: FlowItem[]): Array<[string, number]> {
  return items.map((item) => [item.label, item.value]);
}

describe('moneyFlow', () => {
  it('flows income into the spending categories and what was saved', () => {
    const flow = moneyFlow(worldMonths);
    expect(pick(flow.sources)).toEqual([
      ['Other income', 21000000],
      ['Salary', 15000000],
      ['Interest', 16060],
    ]);
    expect(pick(flow.uses)).toEqual([
      ['Cash', 2000000],
      ['Rent', 2000000],
      ['Uncategorised', 1120050],
      ['Fees', 11000],
      ['Saved', 30885010],
    ]);
    expect(flow.total).toBe(36016060);
    expect(flow.income).toBe(36016060);
    expect(flow.outgoing).toBe(5131050);
  });

  it('draws the shortfall from savings when more went out than came in', () => {
    const flow = moneyFlow([month({ Salary: 1000 }, { Rent: 600 }), month({}, { Rent: 900 })]);
    expect(pick(flow.sources)).toEqual([
      ['Salary', 1000],
      ['From savings', 500],
    ]);
    expect(pick(flow.uses)).toEqual([['Rent', 1500]]);
    expect(flow.total).toBe(1500);
    expect(flow.sources.at(-1)?.kind).toBe('savings');
  });

  it('counts refunds as money in and returned income as money out', () => {
    const flow = moneyFlow([
      month({ Salary: 2000, Bonus: -200 }, { Groceries: 1000, Refunds: -300 }),
    ]);
    expect(pick(flow.sources)).toEqual([
      ['Salary', 2000],
      ['Refunds', 300],
    ]);
    expect(pick(flow.uses)).toEqual([
      ['Groceries', 1000],
      ['Bonus', 200],
      ['Saved', 1100],
    ]);
    expect(flow.income).toBe(1800);
    expect(flow.outgoing).toBe(700);
  });

  it('joins a category that goes out as both income and spending', () => {
    const flow = moneyFlow([month({ Salary: 1000, Gifts: -100 }, { Gifts: 400 })]);
    expect(pick(flow.uses)).toEqual([
      ['Gifts', 500],
      ['Saved', 500],
    ]);
  });

  it('folds the smallest categories into Other', () => {
    const flow = moneyFlow(
      [month({ Salary: 5000 }, { A: 500, B: 400, C: 300, D: 200, E: 100 })],
      3,
    );
    expect(pick(flow.uses)).toEqual([
      ['A', 500],
      ['B', 400],
      ['Other', 600],
      ['Saved', 3500],
    ]);
    expect(flow.uses[2]).toMatchObject({ kind: 'other', folded: ['C', 'D', 'E'] });
    expect(new Set(flow.uses.map((item) => item.key)).size).toBe(4);
  });

  it('keeps a category called Other apart from the folded ones', () => {
    const flow = moneyFlow([month({ Salary: 5000 }, { Other: 500, B: 400, C: 300 })], 2);
    expect(pick(flow.uses)).toEqual([
      ['Other', 500],
      ['Other', 700],
      ['Saved', 3800],
    ]);
    expect(new Set(flow.uses.map((item) => item.key)).size).toBe(3);
  });

  it('leaves out categories that come to nothing', () => {
    const flow = moneyFlow([month({ Salary: 1000 }, { Rent: 1000, Fees: 0 })]);
    expect(pick(flow.sources)).toEqual([['Salary', 1000]]);
    expect(pick(flow.uses)).toEqual([['Rent', 1000]]);
  });

  it('is empty when nothing came in or went out', () => {
    expect(moneyFlow([month({}, {}), month({}, {})])).toEqual({
      sources: [],
      uses: [],
      total: 0,
      income: 0,
      outgoing: 0,
    });
  });
});

describe('flowLayout', () => {
  const flow = moneyFlow(worldMonths);
  const layout = flowLayout(flow, 720);
  const side = (name: 'in' | 'out') => layout.nodes.filter((node) => node.side === name);

  it('draws every flow on one scale', () => {
    const scale = layout.hub.height / flow.total;
    expect(scale).toBeGreaterThan(0);
    for (const node of layout.nodes) expect(node.height).toBeCloseTo(node.item.value * scale, 6);
  });

  it('stacks the flows against the total without gaps', () => {
    const into = side('in').map((node) => node.link.to);
    const outOf = side('out').map((node) => node.link.from);
    for (const ends of [into, outOf]) {
      expect(ends[0]?.top).toBeCloseTo(layout.hub.y, 6);
      for (const [index, end] of ends.entries()) {
        if (index > 0) expect(end.top).toBeCloseTo(ends[index - 1]?.bottom ?? Number.NaN, 6);
      }
      expect(ends.at(-1)?.bottom).toBeCloseTo(layout.hub.y + layout.hub.height, 6);
    }
    expect(into.every((end) => end.x === layout.hub.x)).toBe(true);
    expect(outOf.every((end) => end.x === layout.hub.x + layout.nodeWidth)).toBe(true);
  });

  it('starts each flow at its own bar', () => {
    for (const node of side('in')) {
      expect(node.link.from).toEqual({
        x: node.x + layout.nodeWidth,
        top: node.y,
        bottom: node.y + node.height,
      });
    }
    for (const node of side('out')) {
      expect(node.link.to).toEqual({ x: node.x, top: node.y, bottom: node.y + node.height });
    }
  });

  it('leaves room for two lines of label beside even the smallest flow', () => {
    for (const name of ['in', 'out'] as const) {
      const rows = side(name).map((node) => node.label.y);
      for (const [index, row] of rows.entries()) {
        if (index > 0) expect(row - (rows[index - 1] ?? Number.NaN)).toBeGreaterThanOrEqual(34);
      }
    }
  });

  it('keeps everything inside the drawing', () => {
    const short = flowLayout(moneyFlow([month({ Salary: 1000 }, { Rent: 600 })]), 720);
    for (const drawing of [layout, short]) {
      expect(drawing.hub.y - 36).toBeGreaterThanOrEqual(0);
      expect(drawing.hub.y + drawing.hub.height).toBeLessThanOrEqual(drawing.height);
      for (const node of drawing.nodes) {
        expect(node.label.y - 17).toBeGreaterThanOrEqual(0);
        expect(node.label.y + 17).toBeLessThanOrEqual(drawing.height);
        expect(node.label.x).toBeGreaterThan(0);
        expect(node.label.x).toBeLessThan(drawing.width);
      }
    }
  });

  it('fits the drawing to the tallest column', () => {
    const uses = side('out');
    const top = Math.min(...uses.map((node) => Math.min(node.y, node.label.y - 17)));
    const bottom = Math.max(
      ...uses.map((node) => Math.max(node.y + node.height, node.label.y + 17)),
    );
    expect(top).toBeCloseTo(0, 6);
    expect(bottom).toBeCloseTo(layout.height, 6);
  });

  it('puts the labels outside the columns', () => {
    for (const node of side('in')) {
      expect(node.label.anchor).toBe('end');
      expect(node.label.x).toBeLessThan(node.x);
    }
    for (const node of side('out')) {
      expect(node.label.anchor).toBe('start');
      expect(node.label.x).toBeGreaterThan(node.x + layout.nodeWidth);
    }
  });

  it('keeps the columns apart when the space is too narrow', () => {
    const tiny = flowLayout(flow, 160);
    const ins = tiny.nodes.filter((node) => node.side === 'in');
    const outs = tiny.nodes.filter((node) => node.side === 'out');
    expect(Math.max(...ins.map((node) => node.x + tiny.nodeWidth))).toBeLessThan(tiny.hub.x);
    expect(tiny.hub.x + tiny.nodeWidth).toBeLessThan(Math.min(...outs.map((node) => node.x)));
    expect(tiny.width).toBeGreaterThan(160);
  });

  it('shortens long names to fit a narrow screen', () => {
    const long = 'Household and kitchen supplies';
    const narrow = flowLayout(
      moneyFlow([month({ Salary: 1000 }, { [long]: 600, Rent: 400 })]),
      320,
    );
    const labels = narrow.nodes.map((node) => node.label.text);
    expect(labels).toContain('Rent');
    const shortened = labels.find((label) => label.startsWith('House'));
    expect(shortened?.endsWith('…')).toBe(true);
    expect(shortened?.length).toBeLessThan(12);
  });
});

describe('ribbonPath', () => {
  it('curves a band from one end to the other with a hairline gap at each edge', () => {
    expect(
      ribbonPath({ from: { x: 0, top: 0, bottom: 10 }, to: { x: 100, top: 40, bottom: 50 } }),
    ).toBe('M0,1C50,1 50,41 100,41L100,49C50,49 50,9 0,9Z');
  });

  it('keeps a very thin band visible', () => {
    expect(
      ribbonPath({ from: { x: 0, top: 5, bottom: 5.2 }, to: { x: 100, top: 7, bottom: 7.2 } }),
    ).toBe('M0,4.6C50,4.6 50,6.6 100,6.6L100,7.6C50,7.6 50,5.6 0,5.6Z');
  });
});
