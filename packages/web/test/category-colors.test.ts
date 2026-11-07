import { describe, expect, it } from 'vitest';
import { categoryColors } from '../src/ui';

describe('categoryColors', () => {
  it('greys out unsorted spending and the rest, and gives each named category its own hue', () => {
    const colors = categoryColors(['Uncategorised', 'Cash', 'Fees', 'Other'], false);
    expect(colors).toEqual(['#9e9e9e', '#e34948', '#eda100', '#c7c7c7']);
  });

  it('has its own steps for dark mode', () => {
    expect(categoryColors(['Cash', 'Uncategorised'], true)).toEqual(['#e66767', '#8a8a8a']);
  });

  it('never paints a category in the colours that mean money in, out or kept', () => {
    const colors = categoryColors(['A', 'B', 'C', 'D', 'E'], false);
    expect(new Set(colors).size).toBe(5);
    for (const money of ['#2a78d6', '#eb6834', '#1baf7a']) expect(colors).not.toContain(money);
  });
});
