import { ValidationError } from '../errors.js';
import {
  addItemToCategory,
  decrementItemQuantity,
  deleteItem,
  forkItem,
  getItem,
  incrementItemQuantity,
  removeItemFromCategory,
  setItemConsumable,
  setItemQuantity,
  setItemStar,
  setItemWorn,
  updateItem,
} from '../mutations.js';
import type { SyncEngine } from '../sync-engine.js';
import { weightToMg, type WeightUnit } from '../weight.js';
import { formatItem, type CategoryItemView, type ItemView } from '../views.js';

export interface AddItemInput {
  /** Link an already-existing item into this category (shared item) instead of creating a new one. */
  existingItemId?: number;
  name?: string;
  description?: string;
  weight?: number;
  /** @default 'g' */
  weightUnit?: WeightUnit;
  price?: number;
  url?: string;
  imageUrl?: string;
  /** @default 1 */
  qty?: number;
  worn?: boolean;
  consumable?: boolean;
  star?: 0 | 1 | 2 | 3;
}

export interface UpdateItemInput {
  name?: string;
  description?: string;
  price?: number;
  weight?: number;
  /** Required if `weight` is provided. */
  weightUnit?: WeightUnit;
  url?: string;
  imageUrl?: string;
}

export interface UploadImageInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class ItemsApi {
  constructor(private readonly engine: SyncEngine) {}

  /** Adds a new item to a category, or — with `existingItemId` — links an already-existing item as a shared item (editing it later updates every category it appears in). */
  add(categoryId: number, input: AddItemInput = {}): Promise<CategoryItemView> {
    const weightUnit = input.weightUnit ?? 'g';
    return this.engine.mutate((lib) => {
      const { item, categoryItem } = addItemToCategory(lib, categoryId, {
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
      });
      return formatItem(item, categoryItem) as CategoryItemView;
    });
  }

  /**
   * Patches any subset of an item's own fields — name, description, price, weight, link (url), or image URL.
   * The item may be shared across multiple categories/lists; this updates it everywhere it appears.
   */
  update(itemId: number, patch: UpdateItemInput): Promise<ItemView> {
    if (patch.weight !== undefined && patch.weightUnit === undefined) {
      throw new ValidationError('weightUnit is required when weight is provided.');
    }
    return this.engine.mutate((lib) =>
      formatItem(
        updateItem(lib, itemId, {
          name: patch.name,
          description: patch.description,
          price: patch.price,
          weightMg: patch.weight !== undefined ? weightToMg(patch.weight, patch.weightUnit!) : undefined,
          authorUnit: patch.weightUnit,
          url: patch.url,
          imageUrl: patch.imageUrl,
        }),
      ),
    );
  }

  /** Unlinks an item from a single category. The item row (and its placement in any other category) is untouched. */
  async removeFromCategory(categoryId: number, itemId: number): Promise<void> {
    await this.engine.mutate((lib) => removeItemFromCategory(lib, categoryId, itemId));
  }

  /** Deletes an item from the library and unlinks it from every category/list that references it. Cannot be undone. */
  async delete(itemId: number): Promise<void> {
    await this.engine.mutate((lib) => deleteItem(lib, itemId));
  }

  /** Detaches a shared item into an independent copy for one specific list, so future edits to the original no longer affect this list's copy. */
  fork(itemId: number, listId: number): Promise<ItemView> {
    return this.engine.mutate((lib) => formatItem(forkItem(lib, itemId, listId)));
  }

  /** Points an item at an externally-hosted image URL (no upload). Use uploadImage() to upload a local/binary image instead. */
  setImageUrl(itemId: number, imageUrl: string): Promise<ItemView> {
    return this.engine.mutate((lib) => formatItem(updateItem(lib, itemId, { imageUrl })));
  }

  /** Uploads an image (JPEG/PNG/WebP, 5MB max) to LighterPack and sets it as the item's photo. */
  async uploadImage(itemId: number, input: UploadImageInput): Promise<ItemView> {
    const imageUrl = await this.engine.uploadImage(input);
    return this.engine.mutate((lib) => formatItem(updateItem(lib, itemId, { imageUrl })));
  }

  // -------------------------------------------------------------------------
  // Per-placement flags — qty/worn/consumable/star live on the item's
  // categoryItem (its placement in one specific category), not on the item
  // itself, matching LighterPack's own model.
  // -------------------------------------------------------------------------

  /** Sets an item's exact quantity within a category. */
  setQuantity(categoryId: number, itemId: number, qty: number): Promise<CategoryItemView> {
    return this.engine.mutate((lib) => {
      const categoryItem = setItemQuantity(lib, categoryId, itemId, qty);
      return formatItem(getItem(lib, itemId), categoryItem) as CategoryItemView;
    });
  }

  /** Increases an item's quantity by `by` (default 1). */
  incrementQuantity(categoryId: number, itemId: number, by = 1): Promise<CategoryItemView> {
    return this.engine.mutate((lib) => {
      const categoryItem = incrementItemQuantity(lib, categoryId, itemId, by);
      return formatItem(getItem(lib, itemId), categoryItem) as CategoryItemView;
    });
  }

  /** Decreases an item's quantity by `by` (default 1), floored at 0. */
  decrementQuantity(categoryId: number, itemId: number, by = 1): Promise<CategoryItemView> {
    return this.engine.mutate((lib) => {
      const categoryItem = decrementItemQuantity(lib, categoryId, itemId, by);
      return formatItem(getItem(lib, itemId), categoryItem) as CategoryItemView;
    });
  }

  /** Marks an item worn/not worn. `worn` and `consumable` are mutually exclusive — setting worn=true auto-clears consumable on this placement. */
  setWorn(categoryId: number, itemId: number, worn: boolean): Promise<CategoryItemView> {
    return this.engine.mutate((lib) => {
      const categoryItem = setItemWorn(lib, categoryId, itemId, worn);
      return formatItem(getItem(lib, itemId), categoryItem) as CategoryItemView;
    });
  }

  /** Marks an item consumable/not consumable. `worn` and `consumable` are mutually exclusive — setting consumable=true auto-clears worn on this placement. */
  setConsumable(categoryId: number, itemId: number, consumable: boolean): Promise<CategoryItemView> {
    return this.engine.mutate((lib) => {
      const categoryItem = setItemConsumable(lib, categoryId, itemId, consumable);
      return formatItem(getItem(lib, itemId), categoryItem) as CategoryItemView;
    });
  }

  /** Sets the favorite/priority level for this placement: 0 (none) to 3 — LighterPack's star is a 3-level rating, not a plain flag. */
  setStar(categoryId: number, itemId: number, star: 0 | 1 | 2 | 3): Promise<CategoryItemView> {
    return this.engine.mutate((lib) => {
      const categoryItem = setItemStar(lib, categoryId, itemId, star);
      return formatItem(getItem(lib, itemId), categoryItem) as CategoryItemView;
    });
  }
}
