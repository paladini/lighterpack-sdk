import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addItemToCategory,
  createEmptyLibrary,
  getCategory,
  getList,
  setItemQuantity,
  setItemWorn,
  setListOptionalFields,
} from '../../src/mutations.js';
import type { Library } from '../../src/types.js';
import { formatCategory, formatItem, formatListDetail, formatListSummary } from '../../src/views.js';

describe('formatItem', () => {
  it('converts weight to grams and strips empty url/imageUrl to undefined', () => {
    const lib = createEmptyLibrary();
    const cat = getCategory(lib, getList(lib, lib.defaultListId).categoryIds[0]!);
    const { item } = addItemToCategory(lib, cat.id, { name: 'Stove', weightMg: 123_450 });

    const view = formatItem(item);
    expect(view.weightGrams).toBe(123.45);
    expect(view.weightMg).toBe(123_450);
    expect(view.url).toBeUndefined();
    expect(view.imageUrl).toBeUndefined();
    expect('qty' in view).toBe(false); // no categoryItem passed -> plain ItemView, no placement fields
  });

  it('includes placement fields (qty/worn/consumable/star) when a categoryItem is passed', () => {
    const lib = createEmptyLibrary();
    const cat = getCategory(lib, getList(lib, lib.defaultListId).categoryIds[0]!);
    const { item, categoryItem } = addItemToCategory(lib, cat.id, { name: 'Jacket', worn: true, qty: 2, star: 3 });

    const view = formatItem(item, categoryItem);
    expect(view).toMatchObject({ qty: 2, worn: true, consumable: false, star: 3 });
  });

  it('preserves non-empty url and imageUrl', () => {
    const lib = createEmptyLibrary();
    const cat = getCategory(lib, getList(lib, lib.defaultListId).categoryIds[0]!);
    const { item } = addItemToCategory(lib, cat.id, { name: 'Knife', url: 'https://example.com', imageUrl: 'https://img.example.com/x.jpg' });

    const view = formatItem(item);
    expect(view.url).toBe('https://example.com');
    expect(view.imageUrl).toBe('https://img.example.com/x.jpg');
  });
});

describe('formatCategory', () => {
  let lib: Library;

  function freshCategoryWithItems() {
    lib = createEmptyLibrary();
    const list = getList(lib, lib.defaultListId);
    setListOptionalFields(lib, list.id, { worn: true, consumable: true });
    const category = addCategory(lib, list.id, { name: 'Gear', color: '#ff8800' });
    addItemToCategory(lib, category.id, { name: 'Socks', weightMg: 100_000, worn: true });
    addItemToCategory(lib, category.id, { name: 'Fuel', weightMg: 200_000, price: 5, consumable: true, qty: 2 });
    return { list, category };
  }

  it('lists every item with its placement fields and a correct subtotal', () => {
    const { list, category } = freshCategoryWithItems();
    const view = formatCategory(lib, getCategory(lib, category.id), list.optionalFields);

    expect(view.categoryId).toBe(category.id);
    expect(view.color).toBe('#ff8800');
    expect(view.items).toHaveLength(2);
    expect(view.items.map((i) => i.name)).toEqual(['Socks', 'Fuel']);
    expect(view.subtotal.weightGrams).toBe(500); // 100g + 200g*2
    expect(view.subtotal.wornWeightGrams).toBe(100);
    expect(view.subtotal.consumableWeightGrams).toBe(400);
    expect(view.subtotal.consumablePrice).toBe(10);
  });

  it('silently skips a categoryItem whose item row is missing (defensive against inconsistent data)', () => {
    const { list, category } = freshCategoryWithItems();
    const cat = getCategory(lib, category.id);
    cat.categoryItems.push({ itemId: 999_999, qty: 1, worn: 0, consumable: false, star: 0 });

    const view = formatCategory(lib, cat, list.optionalFields);
    expect(view.items).toHaveLength(2); // the dangling reference is dropped, not crashed on
  });
});

describe('formatListDetail / formatListSummary', () => {
  it('computes list-wide totals across multiple categories and reports the share URL when set', () => {
    const lib = createEmptyLibrary();
    const list = getList(lib, lib.defaultListId);
    const secondCategory = addCategory(lib, list.id, { name: 'Second' });
    const { item } = addItemToCategory(lib, secondCategory.id, { name: 'Bag', weightMg: 300_000 });
    setItemQuantity(lib, secondCategory.id, item.id, 1);
    setItemWorn(lib, secondCategory.id, item.id, true);
    setListOptionalFields(lib, list.id, { worn: true });

    const detail = formatListDetail(lib, getList(lib, list.id));
    expect(detail.categories).toHaveLength(2); // firstRun default category + Second
    expect(detail.totals.weightGrams).toBe(300); // firstRun item has 0 weight
    expect(detail.totals.wornWeightGrams).toBe(300);
    expect(detail.totals.packWeightGrams).toBe(detail.totals.weightGrams - detail.totals.wornWeightGrams);
    expect(detail.shareUrl).toBeUndefined();

    list.externalId = 'abc123';
    const detailWithShare = formatListDetail(lib, getList(lib, list.id));
    expect(detailWithShare.shareUrl).toBe('https://lighterpack.com/r/abc123');
  });

  it('formatListSummary reports isDefault correctly and omits categories/items detail', () => {
    const lib = createEmptyLibrary();
    const defaultList = getList(lib, lib.defaultListId);

    const summary = formatListSummary(lib, defaultList);
    expect(summary.isDefault).toBe(true);
    expect('categories' in summary).toBe(false);
  });
});
