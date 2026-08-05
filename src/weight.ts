export const WEIGHT_UNITS = ['oz', 'lb', 'g', 'kg'] as const;

export type WeightUnit = (typeof WEIGHT_UNITS)[number];

const MG_PER_UNIT: Record<WeightUnit, number> = {
  g: 1000,
  kg: 1_000_000,
  oz: 28349.5,
  lb: 453592,
};

// LighterPack always stores Item.weight in milligrams, independent of the
// unit the user last typed it in — ported 1:1 from client/utils/weight.js.
export function weightToMg(value: number, unit: WeightUnit): number {
  return value * MG_PER_UNIT[unit];
}

export function mgToWeight(value: number, unit: WeightUnit): number {
  return Math.round((100 * value) / MG_PER_UNIT[unit]) / 100;
}

// Grams round to whole numbers for display; every other unit keeps its
// 2-decimal precision from mgToWeight.
export function mgToDisplayWeight(value: number, unit: WeightUnit): number {
  const weight = mgToWeight(value, unit);
  return unit === 'g' ? Math.round(weight) : weight;
}
