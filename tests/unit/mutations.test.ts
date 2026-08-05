import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../src/errors.js';
import {
  addCategory,
  addItemToCategory,
  calculateCategorySubtotal,
  calculateListTotals,
  copyList,
  createEmptyLibrary,
  createList,
  decrementItemQuantity,
  deleteItem,
  deleteList,
  forkItem,
  getCategory,
  getItem,
  getList,
  incrementItemQuantity,
  removeCategory,
  removeItemFromCategory,
  renameCategory,
  renameList,
  reorderCategories,
  setCategoryColor,
  setItemConsumable,
  setItemQuantity,
  setItemStar,
  setItemWorn,
  setListOptionalFields,
  updateItem,
} from '../../src/mutations.js';
import type { Library } from '../../src/types.js';

describe('createEmptyLibrary', () => {
  it('produces a library with one list, one category, one item (firstRun)', () => {
    const lib = createEmptyLibrary();
    expect(lib.lists).toHaveLength(1);
    expect(lib.categories).toHaveLength(1);
    expect(lib.items).toHaveLength(1);
    expect(lib.defaultListId).toBe(lib.lists[0]!.id);
  });
});

describe('id sequencing', () => {
  it('mints strictly increasing, never-reused ids via ++sequence', () => {
    const lib = createEmptyLibrary();
    const before = lib.sequence;
    const list = createList(lib, { name: 'Trip' });
    const category = addCategory(lib, list.id, { name: 'Shelter' });
    const { item } = addItemToCategory(lib, category.id, { name: 'Tent' });
    expect(list.id).toBe(before + 1);
    expect(category.id).toBe(before + 2);
    expect(item.id).toBe(before + 3);
    expect(lib.sequence).toBe(before + 3);
  });
});

describe('lists', () => {
  let lib: Library;
  beforeEach(() => {
    lib = createEmptyLibrary();
  });

  it('creates, renames, and reads back a list', () => {
    const list = createList(lib, { name: 'Desert trip' });
    renameList(lib, list.id, 'Desert trip v2');
    expect(getList(lib, list.id).name).toBe('Desert trip v2');
  });

  it('throws NotFoundError for an unknown list id', () => {
    expect(() => getList(lib, 999999)).toThrow(NotFoundError);
  });

  it('refuses to delete the only remaining list', () => {
    expect(lib.lists).toHaveLength(1);
    expect(() => deleteList(lib, lib.lists[0]!.id)).toThrow(ValidationError);
  });

  it('deletes a non-last list and force-removes its categories/items links', () => {
    const list = createList(lib, { name: 'Second list' });
    addCategory(lib, list.id, { name: 'Cat' });
    deleteList(lib, list.id);
    expect(() => getList(lib, list.id)).toThrow(NotFoundError);
  });

  it('falls back defaultListId to a remaining list when the default is deleted', () => {
    const second = createList(lib, { name: 'Second' });
    const firstId = lib.defaultListId;
    deleteList(lib, firstId);
    expect(lib.defaultListId).toBe(second.id);
  });

  it('copyList duplicates categories/items but shares the same item ids', () => {
    const list = getList(lib, lib.defaultListId);
    const originalCategory = getCategory(lib, list.categoryIds[0]!);
    const originalItemId = originalCategory.categoryItems[0]!.itemId;

    const copy = copyList(lib, list.id, 'Copy!');
    expect(copy.name).toBe('Copy!');
    expect(copy.categoryIds).toHaveLength(1);

    const copiedCategory = getCategory(lib, copy.categoryIds[0]!);
    expect(copiedCategory.categoryItems[0]!.itemId).toBe(originalItemId);
    // same item row, not a clone
    expect(lib.items.filter((i) => i.id === originalItemId)).toHaveLength(1);
  });

  it('setListOptionalFields patches only the given keys', () => {
    const list = getList(lib, lib.defaultListId);
    setListOptionalFields(lib, list.id, { price: true });
    expect(list.optionalFields.price).toBe(true);
    expect(list.optionalFields.worn).toBe(true); // untouched default
  });
});

describe('categories', () => {
  let lib: Library;
  beforeEach(() => {
    lib = createEmptyLibrary();
  });

  it('adds and renames a category', () => {
    const list = getList(lib, lib.defaultListId);
    const category = addCategory(lib, list.id, { name: 'Cooking' });
    renameCategory(lib, category.id, 'Kitchen');
    expect(getCategory(lib, category.id).name).toBe('Kitchen');
  });

  it('validates hex color format', () => {
    const list = getList(lib, lib.defaultListId);
    const category = addCategory(lib, list.id, { name: 'Cooking' });
    expect(() => setCategoryColor(lib, category.id, 'not-a-color')).toThrow(ValidationError);
    setCategoryColor(lib, category.id, '#ff8800');
    expect(getCategory(lib, category.id).color).toBe('#ff8800');
    setCategoryColor(lib, category.id, undefined);
    expect(getCategory(lib, category.id).color).toBeUndefined();
  });

  it('refuses to remove the last category in a list without force', () => {
    const list = getList(lib, lib.defaultListId);
    expect(list.categoryIds).toHaveLength(1);
    expect(() => removeCategory(lib, list.id, list.categoryIds[0]!)).toThrow(ValidationError);
  });

  it('removes the last category when forced', () => {
    const list = getList(lib, lib.defaultListId);
    const categoryId = list.categoryIds[0]!;
    removeCategory(lib, list.id, categoryId, true);
    expect(list.categoryIds).toHaveLength(0);
    expect(() => getCategory(lib, categoryId)).toThrow(NotFoundError);
  });

  it('removes a non-last category cleanly', () => {
    const list = getList(lib, lib.defaultListId);
    const second = addCategory(lib, list.id, { name: 'Second' });
    removeCategory(lib, list.id, second.id);
    expect(list.categoryIds).not.toContain(second.id);
  });

  it('reorders categories only when given a permutation of the existing set', () => {
    const list = getList(lib, lib.defaultListId);
    const second = addCategory(lib, list.id, { name: 'Second' });
    const third = addCategory(lib, list.id, { name: 'Third' });
    const original = [...list.categoryIds];

    reorderCategories(lib, list.id, [third.id, original[0]!, second.id]);
    expect(list.categoryIds).toEqual([third.id, original[0]!, second.id]);

    expect(() => reorderCategories(lib, list.id, [third.id, second.id])).toThrow(ValidationError);
    expect(() => reorderCategories(lib, list.id, [999999, original[0]!, second.id])).toThrow(ValidationError);
  });
});

describe('items', () => {
  let lib: Library;
  beforeEach(() => {
    lib = createEmptyLibrary();
  });

  function category() {
    const list = getList(lib, lib.defaultListId);
    return getCategory(lib, list.categoryIds[0]!);
  }

  it('adds a new item to a category with defaults', () => {
    const cat = category();
    const { item, categoryItem } = addItemToCategory(lib, cat.id, { name: 'Stove', weightMg: 250_000 });
    expect(item.name).toBe('Stove');
    expect(item.weight).toBe(250_000);
    expect(categoryItem.qty).toBe(1);
    expect(categoryItem.worn).toBe(0);
    expect(categoryItem.consumable).toBe(false);
    expect(categoryItem.star).toBe(0);
  });

  it('links an existing item id into another category (shared item)', () => {
    const cat = category();
    const list = getList(lib, lib.defaultListId);
    const second = addCategory(lib, list.id, { name: 'Second' });
    const { item } = addItemToCategory(lib, cat.id, { name: 'Shared knife' });

    addItemToCategory(lib, second.id, { existingItemId: item.id });
    expect(getCategory(lib, second.id).categoryItems[0]!.itemId).toBe(item.id);
    expect(lib.items.filter((i) => i.id === item.id)).toHaveLength(1);
  });

  it('refuses to add the same item twice to one category', () => {
    const cat = category();
    const { item } = addItemToCategory(lib, cat.id, { name: 'Knife' });
    expect(() => addItemToCategory(lib, cat.id, { existingItemId: item.id })).toThrow(ValidationError);
  });

  it('refuses to create an item that is both worn and consumable', () => {
    const cat = category();
    expect(() => addItemToCategory(lib, cat.id, { name: 'X', worn: true, consumable: true })).toThrow(ValidationError);
  });

  it('updateItem patches only given fields, rounds price to 2dp, rejects negatives', () => {
    const cat = category();
    const { item } = addItemToCategory(lib, cat.id, { name: 'Pack', price: 10 });
    updateItem(lib, item.id, { price: 199.999, url: 'https://example.com' });
    expect(getItem(lib, item.id).price).toBe(200);
    expect(getItem(lib, item.id).url).toBe('https://example.com');
    expect(getItem(lib, item.id).name).toBe('Pack'); // untouched

    expect(() => updateItem(lib, item.id, { price: -1 })).toThrow(ValidationError);
    expect(() => updateItem(lib, item.id, { weightMg: -1 })).toThrow(ValidationError);
  });

  it('removeItemFromCategory unlinks without deleting the item row', () => {
    const cat = category();
    const { item } = addItemToCategory(lib, cat.id, { name: 'Solo' });
    removeItemFromCategory(lib, cat.id, item.id);
    expect(getCategory(lib, cat.id).categoryItems).toHaveLength(1); // the firstRun seed item remains
    expect(getItem(lib, item.id)).toBeDefined();
  });

  it('deleteItem removes the item everywhere it is referenced', () => {
    const cat = category();
    const list = getList(lib, lib.defaultListId);
    const second = addCategory(lib, list.id, { name: 'Second' });
    const { item } = addItemToCategory(lib, cat.id, { name: 'Shared' });
    addItemToCategory(lib, second.id, { existingItemId: item.id });

    deleteItem(lib, item.id);
    expect(() => getItem(lib, item.id)).toThrow(NotFoundError);
    expect(getCategory(lib, cat.id).categoryItems.some((ci) => ci.itemId === item.id)).toBe(false);
    expect(getCategory(lib, second.id).categoryItems.some((ci) => ci.itemId === item.id)).toBe(false);
  });

  it('forkItem detaches a shared item into an independent copy for one list', () => {
    const cat = category();
    const list = getList(lib, lib.defaultListId);
    const second = addCategory(lib, list.id, { name: 'Second' });
    const secondList = createList(lib, { name: 'Other list' });
    const secondListCategory = addCategory(lib, secondList.id, { name: 'Cat' });

    const { item } = addItemToCategory(lib, cat.id, { name: 'Shared', price: 5 });
    addItemToCategory(lib, second.id, { existingItemId: item.id });
    addItemToCategory(lib, secondListCategory.id, { existingItemId: item.id });

    const forked = forkItem(lib, item.id, secondList.id);
    expect(forked.id).not.toBe(item.id);
    expect(forked.name).toBe('Shared');
    expect(getCategory(lib, secondListCategory.id).categoryItems[0]!.itemId).toBe(forked.id);
    // original list's placements still point at the original item
    expect(getCategory(lib, cat.id).categoryItems.some((ci) => ci.itemId === item.id)).toBe(true);
    expect(getCategory(lib, second.id).categoryItems.some((ci) => ci.itemId === item.id)).toBe(true);
  });
});

describe('category-item flags', () => {
  let lib: Library;
  let categoryId: number;
  let itemId: number;

  beforeEach(() => {
    lib = createEmptyLibrary();
    const list = getList(lib, lib.defaultListId);
    const cat = addCategory(lib, list.id, { name: 'Gear' });
    categoryId = cat.id;
    const { item } = addItemToCategory(lib, cat.id, { name: 'Jacket' });
    itemId = item.id;
  });

  it('sets exact quantity, rejects negative', () => {
    setItemQuantity(lib, categoryId, itemId, 3);
    expect(getCategory(lib, categoryId).categoryItems[0]!.qty).toBe(3);
    expect(() => setItemQuantity(lib, categoryId, itemId, -1)).toThrow(ValidationError);
  });

  it('increments and decrements quantity, floored at 0', () => {
    incrementItemQuantity(lib, categoryId, itemId, 2);
    expect(getCategory(lib, categoryId).categoryItems[0]!.qty).toBe(3);
    decrementItemQuantity(lib, categoryId, itemId, 10);
    expect(getCategory(lib, categoryId).categoryItems[0]!.qty).toBe(0);
  });

  it('worn and consumable are mutually exclusive: setting one clears the other', () => {
    setItemConsumable(lib, categoryId, itemId, true);
    expect(getCategory(lib, categoryId).categoryItems[0]!.consumable).toBe(true);

    setItemWorn(lib, categoryId, itemId, true);
    const ci = getCategory(lib, categoryId).categoryItems[0]!;
    expect(ci.worn).toBe(1);
    expect(ci.consumable).toBe(false); // auto-cleared

    setItemConsumable(lib, categoryId, itemId, true);
    const ci2 = getCategory(lib, categoryId).categoryItems[0]!;
    expect(ci2.consumable).toBe(true);
    expect(ci2.worn).toBe(0); // auto-cleared
  });

  it('star cycles 0-3 and rejects out-of-range values', () => {
    setItemStar(lib, categoryId, itemId, 2);
    expect(getCategory(lib, categoryId).categoryItems[0]!.star).toBe(2);
    expect(() => setItemStar(lib, categoryId, itemId, 4 as never)).toThrow(ValidationError);
    expect(() => setItemStar(lib, categoryId, itemId, -1 as never)).toThrow(ValidationError);
  });
});

describe('totals', () => {
  it('worn weight counts only once regardless of qty; consumable scales with qty', () => {
    const lib = createEmptyLibrary();
    const list = getList(lib, lib.defaultListId);
    setListOptionalFields(lib, list.id, { worn: true, consumable: true });
    const cat = addCategory(lib, list.id, { name: 'Gear' });

    const { item: wornItem, categoryItem: wornCi } = addItemToCategory(lib, cat.id, { name: 'Socks', weightMg: 100_000, worn: true });
    setItemQuantity(lib, cat.id, wornItem.id, 3);
    expect(wornCi.worn).toBe(1);

    const { item: consumableItem } = addItemToCategory(lib, cat.id, { name: 'Fuel', weightMg: 200_000, price: 5, consumable: true });
    setItemQuantity(lib, cat.id, consumableItem.id, 2);

    const sub = calculateCategorySubtotal(lib, getCategory(lib, cat.id), list.optionalFields);
    expect(sub.subtotalWornWeight).toBe(100_000); // one unit only, not x3
    expect(sub.subtotalConsumableWeight).toBe(400_000); // 200_000 x 2
    expect(sub.subtotalConsumablePrice).toBe(10); // 5 x 2

    const totals = calculateListTotals(lib, list);
    expect(totals.totalWeight).toBe(sub.subtotalWeight + calculateCategorySubtotal(lib, getCategory(lib, list.categoryIds[0]!), list.optionalFields).subtotalWeight);
    expect(totals.totalPackWeight).toBe(totals.totalWeight - totals.totalWornWeight);
    expect(totals.totalBaseWeight).toBe(totals.totalWeight - totals.totalWornWeight - totals.totalConsumableWeight);
  });
});
