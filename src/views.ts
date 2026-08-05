import { calculateCategorySubtotal, calculateListTotals } from './mutations.js';
import type { Category, CategoryItem, Item, Library, List, ListOptionalFields } from './types.js';
import { mgToWeight } from './weight.js';

export interface ItemView {
  itemId: number;
  name: string;
  description: string;
  /** Convenience — see weightMg for the lossless canonical value. */
  weightGrams: number;
  /** Canonical stored value; always milligrams regardless of authorUnit. */
  weightMg: number;
  authorUnit: string;
  price: number;
  url?: string;
  imageUrl?: string;
}

export interface CategoryItemView extends ItemView {
  qty: number;
  worn: boolean;
  consumable: boolean;
  star: 0 | 1 | 2 | 3;
}

export interface Totals {
  weightGrams: number;
  wornWeightGrams: number;
  consumableWeightGrams: number;
  price: number;
  consumablePrice: number;
  qty: number;
}

export interface ListTotalsView extends Totals {
  baseWeightGrams: number;
  packWeightGrams: number;
}

export interface CategoryView {
  categoryId: number;
  name: string;
  color?: string;
  items: CategoryItemView[];
  subtotal: Totals;
}

export interface ListSummaryView {
  listId: number;
  name: string;
  description: string;
  isDefault: boolean;
  shareUrl?: string;
  categoryCount: number;
  totalWeightGrams: number;
  totalPrice: number;
}

export interface ListDetailView {
  listId: number;
  name: string;
  description: string;
  shareUrl?: string;
  optionalFields: ListOptionalFields;
  categories: CategoryView[];
  totals: ListTotalsView;
}

const GRAMS_DECIMALS = 100;

function toGrams(mg: number): number {
  return Math.round(mgToWeight(mg, 'g') * GRAMS_DECIMALS) / GRAMS_DECIMALS;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatItem(item: Item, categoryItem?: CategoryItem): ItemView | CategoryItemView {
  const base: ItemView = {
    itemId: item.id,
    name: item.name,
    description: item.description,
    weightGrams: toGrams(item.weight),
    weightMg: item.weight,
    authorUnit: item.authorUnit,
    price: item.price,
    url: item.url || undefined,
    imageUrl: item.imageUrl || undefined,
  };
  if (!categoryItem) return base;
  return {
    ...base,
    qty: categoryItem.qty,
    worn: !!categoryItem.worn,
    consumable: categoryItem.consumable,
    star: categoryItem.star,
  };
}

export function formatCategory(library: Library, category: Category, optionalFields: ListOptionalFields): CategoryView {
  const subtotal = calculateCategorySubtotal(library, category, optionalFields);
  return {
    categoryId: category.id,
    name: category.name,
    color: category.color,
    items: category.categoryItems
      .map((ci) => {
        const item = library.items.find((i) => i.id === ci.itemId);
        return item ? (formatItem(item, ci) as CategoryItemView) : undefined;
      })
      .filter((v): v is CategoryItemView => v !== undefined),
    subtotal: {
      weightGrams: toGrams(subtotal.subtotalWeight),
      wornWeightGrams: toGrams(subtotal.subtotalWornWeight),
      consumableWeightGrams: toGrams(subtotal.subtotalConsumableWeight),
      price: round2(subtotal.subtotalPrice),
      consumablePrice: round2(subtotal.subtotalConsumablePrice),
      qty: subtotal.subtotalQty,
    },
  };
}

export function formatListDetail(library: Library, list: List): ListDetailView {
  const totals = calculateListTotals(library, list);
  return {
    listId: list.id,
    name: list.name,
    description: list.description,
    shareUrl: list.externalId ? `https://lighterpack.com/r/${list.externalId}` : undefined,
    optionalFields: list.optionalFields,
    categories: list.categoryIds
      .map((id) => library.categories.find((c) => c.id === id))
      .filter((c): c is Category => !!c)
      .map((c) => formatCategory(library, c, list.optionalFields)),
    totals: {
      weightGrams: toGrams(totals.totalWeight),
      wornWeightGrams: toGrams(totals.totalWornWeight),
      consumableWeightGrams: toGrams(totals.totalConsumableWeight),
      baseWeightGrams: toGrams(totals.totalBaseWeight),
      packWeightGrams: toGrams(totals.totalPackWeight),
      price: round2(totals.totalPrice),
      consumablePrice: round2(totals.totalConsumablePrice),
      qty: totals.totalQty,
    },
  };
}

export function formatListSummary(library: Library, list: List): ListSummaryView {
  const totals = calculateListTotals(library, list);
  return {
    listId: list.id,
    name: list.name,
    description: list.description,
    isDefault: library.defaultListId === list.id,
    shareUrl: list.externalId ? `https://lighterpack.com/r/${list.externalId}` : undefined,
    categoryCount: list.categoryIds.length,
    totalWeightGrams: toGrams(totals.totalWeight),
    totalPrice: round2(totals.totalPrice),
  };
}
