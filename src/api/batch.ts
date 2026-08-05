import { ValidationError } from '../errors.js';
import {
  addCategory,
  addItemToCategory,
  createList,
  getCategory,
  getItem,
  setItemConsumable,
  setItemQuantity,
  setItemStar,
  setItemWorn,
  updateItem,
} from '../mutations.js';
import type { SyncEngine } from '../sync-engine.js';
import { weightToMg, type WeightUnit } from '../weight.js';
import { formatItem, formatListDetail, type CategoryItemView, type ItemView, type ListDetailView } from '../views.js';
import type { AddItemInput } from './items.js';

function toNewItemFields(input: AddItemInput) {
  const weightUnit = input.weightUnit ?? 'g';
  return {
    existingItemId: input.existingItemId,
    name: input.name,
    description: input.description,
    weightMg: input.weight !== undefined ? weightToMg(input.weight, weightUnit) : undefined,
    authorUnit: weightUnit,
    price: input.price,
    url: input.url,
    imageUrl: input.imageUrl,
    qty: input.qty,
    worn: input.worn,
    consumable: input.consumable,
    star: input.star,
  };
}

export interface CreateListWithItemsInput {
  name: string;
  description?: string;
  categories: {
    name: string;
    color?: string;
    items?: AddItemInput[];
  }[];
}

export interface BatchUpdateEntry {
  itemId: number;
  /** Required if `flags` is set — flags live on the item's placement in a specific category. */
  categoryId?: number;
  fields?: {
    name?: string;
    description?: string;
    price?: number;
    weight?: number;
    weightUnit?: WeightUnit;
    url?: string;
    imageUrl?: string;
  };
  flags?: {
    qty?: number;
    worn?: boolean;
    consumable?: boolean;
    star?: 0 | 1 | 2 | 3;
  };
}

export class BatchApi {
  constructor(private readonly engine: SyncEngine) {}

  /** Adds several items to one category in a single save round-trip — much more efficient than calling items.add() repeatedly. */
  addItems(categoryId: number, items: AddItemInput[]): Promise<CategoryItemView[]> {
    return this.engine.mutate((lib) =>
      items.map((input) => {
        const { item, categoryItem } = addItemToCategory(lib, categoryId, toNewItemFields(input));
        return formatItem(item, categoryItem) as CategoryItemView;
      }),
    );
  }

  /** Scaffolds a complete new list — categories and their items — in a single save round-trip. */
  createListWithItems(input: CreateListWithItemsInput): Promise<ListDetailView> {
    return this.engine.mutate((lib) => {
      const list = createList(lib, { name: input.name, description: input.description });
      for (const categoryInput of input.categories) {
        const category = addCategory(lib, list.id, { name: categoryInput.name, color: categoryInput.color });
        for (const itemInput of categoryInput.items ?? []) {
          addItemToCategory(lib, category.id, toNewItemFields(itemInput));
        }
      }
      return formatListDetail(lib, list);
    });
  }

  /** Applies field edits and/or flag edits across many items in a single save round-trip. */
  updateItems(updates: BatchUpdateEntry[]): Promise<ItemView[]> {
    return this.engine.mutate((lib) =>
      updates.map((update) => {
        if (update.fields) {
          if (update.fields.weight !== undefined && update.fields.weightUnit === undefined) {
            throw new ValidationError(`weightUnit is required alongside weight for item ${update.itemId}.`);
          }
          updateItem(lib, update.itemId, {
            name: update.fields.name,
            description: update.fields.description,
            price: update.fields.price,
            weightMg: update.fields.weight !== undefined ? weightToMg(update.fields.weight, update.fields.weightUnit as WeightUnit) : undefined,
            authorUnit: update.fields.weightUnit,
            url: update.fields.url,
            imageUrl: update.fields.imageUrl,
          });
        }
        if (update.flags) {
          if (update.categoryId === undefined) {
            throw new ValidationError(`categoryId is required to update flags for item ${update.itemId}.`);
          }
          if (update.flags.qty !== undefined) setItemQuantity(lib, update.categoryId, update.itemId, update.flags.qty);
          if (update.flags.worn !== undefined) setItemWorn(lib, update.categoryId, update.itemId, update.flags.worn);
          if (update.flags.consumable !== undefined) setItemConsumable(lib, update.categoryId, update.itemId, update.flags.consumable);
          if (update.flags.star !== undefined) setItemStar(lib, update.categoryId, update.itemId, update.flags.star);
        }
        const categoryItem =
          update.categoryId !== undefined ? getCategory(lib, update.categoryId).categoryItems.find((ci) => ci.itemId === update.itemId) : undefined;
        return formatItem(getItem(lib, update.itemId), categoryItem);
      }),
    );
  }
}
