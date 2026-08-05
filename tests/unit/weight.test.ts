import { describe, expect, it } from 'vitest';
import { mgToDisplayWeight, mgToWeight, weightToMg } from '../../src/weight.js';

describe('weightToMg', () => {
  it.each([
    ['g', 100, 100_000],
    ['kg', 2, 2_000_000],
    ['oz', 1, 28349.5],
    ['lb', 1, 453592],
  ] as const)('converts %s to mg', (unit, value, expectedMg) => {
    expect(weightToMg(value, unit)).toBeCloseTo(expectedMg, 5);
  });

  it('returns 0 for a 0 value in any unit', () => {
    expect(weightToMg(0, 'oz')).toBe(0);
  });
});

describe('mgToWeight', () => {
  it.each([
    ['g', 100_000, 100],
    ['kg', 2_000_000, 2],
    ['oz', 28349.5, 1],
    ['lb', 453592, 1],
  ] as const)('converts mg back to %s', (unit, mg, expected) => {
    expect(mgToWeight(mg, unit)).toBeCloseTo(expected, 2);
  });

  it('rounds to 2 decimal places', () => {
    // 1.005 oz worth of mg, should round to 2dp not carry float noise
    expect(mgToWeight(28349.5 * 1.005, 'oz')).toBe(1.01);
  });

  it('round-trips weightToMg -> mgToWeight for every unit', () => {
    for (const unit of ['g', 'kg', 'oz', 'lb'] as const) {
      const mg = weightToMg(12.34, unit);
      expect(mgToWeight(mg, unit)).toBeCloseTo(12.34, 2);
    }
  });
});

describe('mgToDisplayWeight', () => {
  it('rounds grams to a whole number', () => {
    expect(mgToDisplayWeight(1234, 'g')).toBe(1);
    expect(mgToDisplayWeight(1_600_000, 'g')).toBe(1600);
    expect(mgToDisplayWeight(555, 'g')).toBe(1);
  });

  it('keeps 2-decimal precision for non-gram units', () => {
    expect(mgToDisplayWeight(28349.5 * 1.005, 'oz')).toBe(1.01);
  });
});
