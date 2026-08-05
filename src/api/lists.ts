import {
  copyList,
  createList,
  deleteList,
  getList,
  renameList,
  setListDescription,
  setListExternalId,
  setListOptionalFields,
} from '../mutations.js';
import type { SyncEngine } from '../sync-engine.js';
import type { ListOptionalFields } from '../types.js';
import { formatListDetail, formatListSummary, type ListDetailView, type ListSummaryView } from '../views.js';

export interface CreateListInput {
  name?: string;
  description?: string;
  optionalFields?: Partial<ListOptionalFields>;
}

export class ListsApi {
  constructor(private readonly engine: SyncEngine) {}

  /** Creates a new, empty packing list. */
  create(input: CreateListInput = {}): Promise<ListSummaryView> {
    return this.engine.mutate((lib) => formatListSummary(lib, createList(lib, input)));
  }

  /** Summary of every list in the account (name, category count, totals). */
  list(): Promise<ListSummaryView[]> {
    return this.engine.read((lib) => lib.lists.map((l) => formatListSummary(lib, l)));
  }

  /** Full detail for one list: categories, items, computed totals. */
  get(listId: number): Promise<ListDetailView> {
    return this.engine.read((lib) => formatListDetail(lib, getList(lib, listId)));
  }

  /** Renames a list. */
  rename(listId: number, name: string): Promise<ListSummaryView> {
    return this.engine.mutate((lib) => formatListSummary(lib, renameList(lib, listId, name)));
  }

  /** Sets a list's description. */
  setDescription(listId: number, description: string): Promise<ListSummaryView> {
    return this.engine.mutate((lib) => formatListSummary(lib, setListDescription(lib, listId, description)));
  }

  /** Toggles which optional columns show for a list (images, price, worn, consumable, description, pack weight). Only the given keys change. */
  setOptionalFields(listId: number, fields: Partial<ListOptionalFields>): Promise<ListSummaryView> {
    return this.engine.mutate((lib) => formatListSummary(lib, setListOptionalFields(lib, listId, fields)));
  }

  /** Duplicates a list and its categories. The copy references the SAME item rows as the original (shared items — editing one updates both); use items.fork() to detach a specific item afterwards. */
  copy(listId: number, newName?: string): Promise<ListSummaryView> {
    return this.engine.mutate((lib) => formatListSummary(lib, copyList(lib, listId, newName)));
  }

  /** Deletes a list and its categories. Throws if it's the only remaining list. Items also referenced by other lists are left intact. */
  async delete(listId: number): Promise<void> {
    await this.engine.mutate((lib) => deleteList(lib, listId));
  }

  /** Mints a public, read-only share link (`https://lighterpack.com/r/<code>`) and attaches it to the list. */
  async generateShareLink(listId: number): Promise<string> {
    const slug = await this.engine.mintShareSlug();
    await this.engine.mutate((lib) => setListExternalId(lib, listId, slug));
    return `https://lighterpack.com/r/${slug}`;
  }
}
