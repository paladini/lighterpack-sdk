import { addCategory, getList, removeCategory, renameCategory, reorderCategories, setCategoryColor } from '../mutations.js';
import type { SyncEngine } from '../sync-engine.js';
import { formatCategory, type CategoryView } from '../views.js';

export interface AddCategoryInput {
  name?: string;
  /** Hex string, e.g. "#ff8800". Omit to let LighterPack auto-assign one. */
  color?: string;
}

export class CategoriesApi {
  constructor(private readonly engine: SyncEngine) {}

  /** Adds a category to a list. */
  add(listId: number, input: AddCategoryInput = {}): Promise<CategoryView> {
    return this.engine.mutate((lib) => {
      const category = addCategory(lib, listId, input);
      return formatCategory(lib, category, getList(lib, listId).optionalFields);
    });
  }

  /** Renames a category. */
  async rename(categoryId: number, name: string): Promise<void> {
    await this.engine.mutate((lib) => renameCategory(lib, categoryId, name));
  }

  /** Sets a category's swatch color. Omit `color` (or pass undefined) to clear it and let LighterPack auto-assign one. */
  async setColor(categoryId: number, color?: string): Promise<void> {
    await this.engine.mutate((lib) => setCategoryColor(lib, categoryId, color));
  }

  /** Removes a category from a list. Throws if it's the list's last category, unless `force` is true. */
  async remove(listId: number, categoryId: number, force = false): Promise<void> {
    await this.engine.mutate((lib) => removeCategory(lib, listId, categoryId, force));
  }

  /** Sets a list's category display order. `categoryIds` must be exactly the list's existing category ids, just reordered. */
  async reorder(listId: number, categoryIds: number[]): Promise<void> {
    await this.engine.mutate((lib) => reorderCategories(lib, listId, categoryIds));
  }
}
