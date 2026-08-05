import type { WeightUnit } from './weight.js';

export interface Item {
  id: number;
  name: string;
  description: string;
  /** Always milligrams, regardless of authorUnit — see weight.ts. */
  weight: number;
  authorUnit: WeightUnit;
  price: number;
  /** Legacy Imgur id, superseded by imageUrl. Kept only for round-tripping old data. */
  image: string;
  imageUrl: string;
  url: string;
}

export interface CategoryItem {
  itemId: number;
  qty: number;
  /** Mutually exclusive with consumable in the real app; enforced in mutations.ts. */
  worn: 0 | 1;
  consumable: boolean;
  /** 0 = unstarred, 1-3 = the app's 3-level star cycle. */
  star: 0 | 1 | 2 | 3;
}

export interface Category {
  id: number;
  name: string;
  /** Hex string, e.g. "#ff8800". Unset means the UI auto-assigns from a palette. */
  color?: string;
  categoryItems: CategoryItem[];
}

export interface ListOptionalFields {
  images: boolean;
  price: boolean;
  worn: boolean;
  consumable: boolean;
  listDescription: boolean;
  packWeight: boolean;
}

export interface List {
  id: number;
  name: string;
  description: string;
  /** Public share-link slug, minted separately via POST /externalId. Empty string if unshared. */
  externalId: string;
  categoryIds: number[];
  optionalFields: ListOptionalFields;
}

export interface LibraryPreferences {
  sharedItemBubble: boolean;
  wornQtyHint: boolean;
  density: 'comfortable' | 'compact';
}

/** The exact shape saved/loaded via POST /saveLibrary's `data` field. */
export interface Library {
  version: '0.4';
  totalUnit: WeightUnit;
  itemUnit: WeightUnit;
  defaultListId: number;
  /** Monotonic counter; every new id is ++sequence. Never reused. */
  sequence: number;
  showSidebar: boolean;
  preferences: LibraryPreferences;
  currencySymbol: string;
  items: Item[];
  categories: Category[];
  lists: List[];
}

/** Computed, not persisted — derived on demand for API responses. */
export interface CategoryTotals {
  subtotalWeight: number;
  subtotalWornWeight: number;
  subtotalConsumableWeight: number;
  subtotalPrice: number;
  subtotalConsumablePrice: number;
  subtotalQty: number;
}

export interface ListTotals {
  totalWeight: number;
  totalWornWeight: number;
  totalConsumableWeight: number;
  totalBaseWeight: number;
  totalPackWeight: number;
  totalPrice: number;
  totalConsumablePrice: number;
  totalQty: number;
}
