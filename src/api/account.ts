import { setCurrencySymbol, setItemUnit, setTotalUnit } from '../mutations.js';
import type { SyncEngine } from '../sync-engine.js';
import type { WeightUnit } from '../weight.js';

export interface AccountInfo {
  listCount: number;
  categoryCount: number;
  itemCount: number;
  totalUnit: WeightUnit;
  itemUnit: WeightUnit;
  currencySymbol: string;
}

export class AccountApi {
  constructor(private readonly engine: SyncEngine) {}

  /** Signed-in library summary: list/category/item counts and library-wide settings. */
  get(): Promise<AccountInfo> {
    return this.engine.read((lib) => ({
      listCount: lib.lists.length,
      categoryCount: lib.categories.length,
      itemCount: lib.items.length,
      totalUnit: lib.totalUnit,
      itemUnit: lib.itemUnit,
      currencySymbol: lib.currencySymbol,
    }));
  }

  /** Forces a re-fetch from LighterPack, discarding the local cache. */
  refresh(): Promise<void> {
    return this.engine.refresh();
  }

  /** Unit LighterPack's own UI uses to display list totals. */
  async setTotalUnit(unit: WeightUnit): Promise<void> {
    await this.engine.mutate((lib) => setTotalUnit(lib, unit));
  }

  /** Default unit LighterPack's own UI pre-fills for new items. */
  async setItemUnit(unit: WeightUnit): Promise<void> {
    await this.engine.mutate((lib) => setItemUnit(lib, unit));
  }

  /** Currency symbol shown next to prices (1-4 characters). */
  async setCurrencySymbol(symbol: string): Promise<void> {
    await this.engine.mutate((lib) => setCurrencySymbol(lib, symbol));
  }
}
