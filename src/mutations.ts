import { NotFoundError, ValidationError } from './errors.js';
import type {
  Category,
  CategoryItem,
  CategoryTotals,
  Item,
  Library,
  LibraryPreferences,
  List,
  ListOptionalFields,
  ListTotals,
} from './types.js';
import type { WeightUnit } from './weight.js';

export const DEFAULT_OPTIONAL_FIELDS: ListOptionalFields = {
  images: false,
  price: false,
  worn: true,
  consumable: true,
  listDescription: false,
  packWeight: false,
};

export const DEFAULT_PREFERENCES: LibraryPreferences = {
  sharedItemBubble: true,
  wornQtyHint: true,
  density: 'comfortable',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getItem(library: Library, id: number): Item {
  const item = library.items.find((i) => i.id === id);
  if (!item) throw new NotFoundError('Item', id);
  return item;
}

export function getCategory(library: Library, id: number): Category {
  const category = library.categories.find((c) => c.id === id);
  if (!category) throw new NotFoundError('Category', id);
  return category;
}

export function getList(library: Library, id: number): List {
  const list = library.lists.find((l) => l.id === id);
  if (!list) throw new NotFoundError('List', id);
  return list;
}

function getCategoryItem(category: Category, itemId: number): CategoryItem {
  const categoryItem = category.categoryItems.find((ci) => ci.itemId === itemId);
  if (!categoryItem) throw new NotFoundError(`Item ${itemId} in category`, category.id);
  return categoryItem;
}

export function findListContainingCategory(library: Library, categoryId: number): List | undefined {
  return library.lists.find((l) => l.categoryIds.includes(categoryId));
}

/** Every category (in any list) whose categoryItems reference this item id. */
export function findCategoriesReferencingItem(library: Library, itemId: number): Category[] {
  return library.categories.filter((c) => c.categoryItems.some((ci) => ci.itemId === itemId));
}

function findCategoryWithItemInList(library: Library, itemId: number, listId: number): Category {
  const list = getList(library, listId);
  const category = list.categoryIds
    .map((id) => library.categories.find((c) => c.id === id))
    .find((c): c is Category => !!c && c.categoryItems.some((ci) => ci.itemId === itemId));
  if (!category) throw new NotFoundError(`Item ${itemId} in list`, listId);
  return category;
}

function nextId(library: Library): number {
  library.sequence += 1;
  return library.sequence;
}

// ---------------------------------------------------------------------------
// Library-level
// ---------------------------------------------------------------------------

export function createEmptyLibrary(): Library {
  const library: Library = {
    version: '0.4',
    totalUnit: 'oz',
    itemUnit: 'oz',
    defaultListId: 0,
    sequence: 0,
    showSidebar: true,
    preferences: { ...DEFAULT_PREFERENCES },
    currencySymbol: '$',
    items: [],
    categories: [],
    lists: [],
  };
  const list = createList(library, {});
  const category = addCategory(library, list.id, {});
  addItemToCategory(library, category.id, {});
  return library;
}

export function setTotalUnit(library: Library, unit: WeightUnit): void {
  library.totalUnit = unit;
}

export function setItemUnit(library: Library, unit: WeightUnit): void {
  library.itemUnit = unit;
}

export function setCurrencySymbol(library: Library, symbol: string): void {
  if (!symbol || symbol.length > 4) {
    throw new ValidationError('Currency symbol must be 1-4 characters.');
  }
  library.currencySymbol = symbol;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export function createList(
  library: Library,
  { name = '', description = '', optionalFields }: { name?: string; description?: string; optionalFields?: Partial<ListOptionalFields> },
): List {
  const list: List = {
    id: nextId(library),
    name,
    description,
    externalId: '',
    categoryIds: [],
    optionalFields: { ...DEFAULT_OPTIONAL_FIELDS, ...optionalFields },
  };
  library.lists.push(list);
  // Mirrors Library.newList(): only claims defaultListId if none was set yet
  // (e.g. the very first list). Does NOT "switch to" every newly created
  // list the way the interactive UI does — that's a UI-layer convenience,
  // not a data-model rule, and would be surprising for programmatic use.
  if (!library.defaultListId) library.defaultListId = list.id;
  return list;
}

export function renameList(library: Library, listId: number, name: string): List {
  const list = getList(library, listId);
  list.name = name;
  return list;
}

export function setListDescription(library: Library, listId: number, description: string): List {
  const list = getList(library, listId);
  list.description = description;
  return list;
}

export function setListOptionalFields(library: Library, listId: number, patch: Partial<ListOptionalFields>): List {
  const list = getList(library, listId);
  list.optionalFields = { ...list.optionalFields, ...patch };
  return list;
}

export function deleteList(library: Library, listId: number): void {
  if (library.lists.length === 1) {
    throw new ValidationError('Cannot delete the only remaining list.');
  }
  const list = getList(library, listId);
  // Mirrors Library.removeList(): force-remove every category the list owns
  // (bypassing the last-category-in-a-list guard, since the whole list is
  // going away anyway).
  for (const categoryId of [...list.categoryIds]) {
    removeCategoryFromLibrary(library, categoryId);
  }
  library.lists.splice(library.lists.indexOf(list), 1);
  if (library.defaultListId === listId) {
    const fallback = library.lists[0];
    if (fallback) library.defaultListId = fallback.id;
  }
}

export function copyList(library: Library, listId: number, newName?: string): List {
  const original = getList(library, listId);
  const copy = createList(library, {
    name: newName ?? `Copy of ${original.name}`,
    optionalFields: original.optionalFields,
  });
  for (const categoryId of original.categoryIds) {
    const originalCategory = getCategory(library, categoryId);
    const copiedCategory = addCategory(library, copy.id, {
      name: originalCategory.name,
      ...(originalCategory.color !== undefined ? { color: originalCategory.color } : {}),
    });
    // Items are NOT cloned — the copy shares the same Item rows as the
    // original, matching Library.copyList()'s semantics (edit one, both
    // lists' rows update). Use forkItem() afterwards to detach a copy.
    for (const categoryItem of originalCategory.categoryItems) {
      copiedCategory.categoryItems.push({ ...categoryItem });
    }
  }
  return copy;
}

export function generateShareSlug(): string {
  const alphabet = '1234567890abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function setListExternalId(library: Library, listId: number, externalId: string): List {
  const list = getList(library, listId);
  list.externalId = externalId;
  return list;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function addCategory(
  library: Library,
  listId: number,
  { name = '', color }: { name?: string; color?: string },
): Category {
  const list = getList(library, listId);
  if (color !== undefined) assertValidHexColor(color);
  const category: Category = { id: nextId(library), name, categoryItems: [], ...(color !== undefined ? { color } : {}) };
  library.categories.push(category);
  list.categoryIds.push(category.id);
  return category;
}

export function renameCategory(library: Library, categoryId: number, name: string): Category {
  const category = getCategory(library, categoryId);
  category.name = name;
  return category;
}

export function setCategoryColor(library: Library, categoryId: number, color: string | undefined): Category {
  const category = getCategory(library, categoryId);
  if (color === undefined) {
    delete category.color;
  } else {
    assertValidHexColor(color);
    category.color = color;
  }
  return category;
}

export function removeCategory(library: Library, listId: number, categoryId: number, force = false): void {
  const list = getList(library, listId);
  if (!list.categoryIds.includes(categoryId)) {
    throw new NotFoundError(`Category ${categoryId} in list`, listId);
  }
  if (list.categoryIds.length === 1 && !force) {
    throw new ValidationError("Can't remove the last category in a list. Pass force=true to override.");
  }
  removeCategoryFromLibrary(library, categoryId);
}

function removeCategoryFromLibrary(library: Library, categoryId: number): void {
  const category = getCategory(library, categoryId);
  for (const list of library.lists) {
    const index = list.categoryIds.indexOf(categoryId);
    if (index !== -1) list.categoryIds.splice(index, 1);
  }
  library.categories.splice(library.categories.indexOf(category), 1);
}

export function reorderCategories(library: Library, listId: number, categoryIds: number[]): List {
  const list = getList(library, listId);
  const current = [...list.categoryIds].sort((a, b) => a - b);
  const requested = [...categoryIds].sort((a, b) => a - b);
  if (current.length !== requested.length || current.some((id, i) => id !== requested[i])) {
    throw new ValidationError('categoryIds must be a reordering of the list\'s existing categories, with none added or removed.');
  }
  list.categoryIds = [...categoryIds];
  return list;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface NewItemFields {
  name?: string;
  description?: string;
  weightMg?: number;
  authorUnit?: WeightUnit;
  price?: number;
  url?: string;
  imageUrl?: string;
}

export interface CategoryItemFlags {
  qty?: number;
  worn?: boolean;
  consumable?: boolean;
  star?: 0 | 1 | 2 | 3;
}

export function addItemToCategory(
  library: Library,
  categoryId: number,
  opts: { existingItemId?: number; itemUnit?: WeightUnit } & NewItemFields & CategoryItemFlags = {},
): { item: Item; categoryItem: CategoryItem } {
  const category = getCategory(library, categoryId);

  let item: Item;
  if (opts.existingItemId !== undefined) {
    item = getItem(library, opts.existingItemId);
    if (category.categoryItems.some((ci) => ci.itemId === item.id)) {
      throw new ValidationError(`Item ${item.id} is already in category ${categoryId}.`);
    }
  } else {
    item = {
      id: nextId(library),
      name: opts.name ?? '',
      description: opts.description ?? '',
      weight: opts.weightMg ?? 0,
      authorUnit: opts.authorUnit ?? opts.itemUnit ?? 'oz',
      price: opts.price ?? 0,
      image: '',
      imageUrl: opts.imageUrl ?? '',
      url: opts.url ?? '',
    };
    library.items.push(item);
  }

  const worn = opts.worn ?? false;
  const consumable = opts.consumable ?? false;
  if (worn && consumable) {
    throw new ValidationError('An item cannot be both worn and consumable.');
  }
  const categoryItem: CategoryItem = {
    itemId: item.id,
    qty: opts.qty ?? 1,
    worn: worn ? 1 : 0,
    consumable,
    star: opts.star ?? 0,
  };
  category.categoryItems.push(categoryItem);
  return { item, categoryItem };
}

export function updateItem(
  library: Library,
  itemId: number,
  patch: { name?: string; description?: string; price?: number; weightMg?: number; authorUnit?: WeightUnit; url?: string; imageUrl?: string },
): Item {
  const item = getItem(library, itemId);
  if (patch.name !== undefined) item.name = patch.name;
  if (patch.description !== undefined) item.description = patch.description;
  if (patch.price !== undefined) {
    if (patch.price < 0) throw new ValidationError('Price cannot be negative.');
    item.price = Math.round(patch.price * 100) / 100;
  }
  if (patch.weightMg !== undefined) {
    if (patch.weightMg < 0) throw new ValidationError('Weight cannot be negative.');
    item.weight = patch.weightMg;
  }
  if (patch.authorUnit !== undefined) item.authorUnit = patch.authorUnit;
  if (patch.url !== undefined) item.url = patch.url;
  if (patch.imageUrl !== undefined) item.imageUrl = patch.imageUrl;
  return item;
}

export function removeItemFromCategory(library: Library, categoryId: number, itemId: number): void {
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  category.categoryItems.splice(category.categoryItems.indexOf(categoryItem), 1);
}

export function deleteItem(library: Library, itemId: number): void {
  const item = getItem(library, itemId);
  for (const category of findCategoriesReferencingItem(library, itemId)) {
    const categoryItem = getCategoryItem(category, itemId);
    category.categoryItems.splice(category.categoryItems.indexOf(categoryItem), 1);
  }
  library.items.splice(library.items.indexOf(item), 1);
}

export function forkItem(library: Library, itemId: number, listId: number): Item {
  const original = getItem(library, itemId);
  const category = findCategoryWithItemInList(library, itemId, listId);
  const categoryItem = getCategoryItem(category, itemId);

  const forked: Item = { ...original, id: nextId(library) };
  library.items.push(forked);
  categoryItem.itemId = forked.id;
  return forked;
}

// ---------------------------------------------------------------------------
// Category-item flags (qty / worn / consumable / star live on the
// categoryItem — i.e. per placement, not per Item — matching the real model)
// ---------------------------------------------------------------------------

export function setItemQuantity(library: Library, categoryId: number, itemId: number, qty: number): CategoryItem {
  if (qty < 0) throw new ValidationError('Quantity cannot be negative.');
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  categoryItem.qty = qty;
  return categoryItem;
}

export function incrementItemQuantity(library: Library, categoryId: number, itemId: number, by = 1): CategoryItem {
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  categoryItem.qty += by;
  return categoryItem;
}

export function decrementItemQuantity(library: Library, categoryId: number, itemId: number, by = 1): CategoryItem {
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  categoryItem.qty = Math.max(0, categoryItem.qty - by);
  return categoryItem;
}

export function setItemWorn(library: Library, categoryId: number, itemId: number, worn: boolean): CategoryItem {
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  categoryItem.worn = worn ? 1 : 0;
  // worn and consumable are mutually exclusive in the real app (item-mixin.js
  // blocks toggling one while the other is set); a direct "set" call clears
  // the conflicting flag instead of silently no-op'ing like the UI toggle.
  if (worn) categoryItem.consumable = false;
  return categoryItem;
}

export function setItemConsumable(library: Library, categoryId: number, itemId: number, consumable: boolean): CategoryItem {
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  categoryItem.consumable = consumable;
  if (consumable) categoryItem.worn = 0;
  return categoryItem;
}

export function setItemStar(library: Library, categoryId: number, itemId: number, star: 0 | 1 | 2 | 3): CategoryItem {
  if (star < 0 || star > 3 || !Number.isInteger(star)) {
    throw new ValidationError('star must be an integer between 0 and 3.');
  }
  const category = getCategory(library, categoryId);
  const categoryItem = getCategoryItem(category, itemId);
  categoryItem.star = star;
  return categoryItem;
}

// ---------------------------------------------------------------------------
// Computed totals (never persisted — derived fresh on demand)
// ---------------------------------------------------------------------------

export function calculateCategorySubtotal(library: Library, category: Category, optionalFields: ListOptionalFields): CategoryTotals {
  const totals: CategoryTotals = {
    subtotalWeight: 0,
    subtotalWornWeight: 0,
    subtotalConsumableWeight: 0,
    subtotalPrice: 0,
    subtotalConsumablePrice: 0,
    subtotalQty: 0,
  };
  for (const categoryItem of category.categoryItems) {
    const item = library.items.find((i) => i.id === categoryItem.itemId);
    if (!item) continue;
    totals.subtotalWeight += item.weight * categoryItem.qty;
    totals.subtotalPrice += item.price * categoryItem.qty;
    // Worn weight only ever counts ONE unit, regardless of qty — matches
    // Category.calculateSubtotal in dataTypes.js.
    if (optionalFields.worn && categoryItem.worn) {
      totals.subtotalWornWeight += item.weight * (categoryItem.qty > 0 ? 1 : 0);
    }
    if (optionalFields.consumable && categoryItem.consumable) {
      totals.subtotalConsumableWeight += item.weight * categoryItem.qty;
      totals.subtotalConsumablePrice += item.price * categoryItem.qty;
    }
    totals.subtotalQty += categoryItem.qty;
  }
  return totals;
}

export function calculateListTotals(library: Library, list: List): ListTotals {
  const totals: ListTotals = {
    totalWeight: 0,
    totalWornWeight: 0,
    totalConsumableWeight: 0,
    totalBaseWeight: 0,
    totalPackWeight: 0,
    totalPrice: 0,
    totalConsumablePrice: 0,
    totalQty: 0,
  };
  for (const categoryId of list.categoryIds) {
    const category = library.categories.find((c) => c.id === categoryId);
    if (!category) continue;
    const sub = calculateCategorySubtotal(library, category, list.optionalFields);
    totals.totalWeight += sub.subtotalWeight;
    totals.totalWornWeight += sub.subtotalWornWeight;
    totals.totalConsumableWeight += sub.subtotalConsumableWeight;
    totals.totalPrice += sub.subtotalPrice;
    totals.totalConsumablePrice += sub.subtotalConsumablePrice;
    totals.totalQty += sub.subtotalQty;
  }
  totals.totalBaseWeight = totals.totalWeight - (totals.totalWornWeight + totals.totalConsumableWeight);
  totals.totalPackWeight = totals.totalWeight - totals.totalWornWeight;
  return totals;
}

function assertValidHexColor(color: string): void {
  if (!HEX_COLOR_RE.test(color)) {
    throw new ValidationError(`"${color}" is not a valid hex color (expected e.g. "#ff8800").`);
  }
}
