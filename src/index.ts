export { LighterPackClient, type LighterPackClientOptions, type RegisterInput } from './client.js';

export { AccountApi, type AccountInfo } from './api/account.js';
export { ListsApi, type CreateListInput } from './api/lists.js';
export { CategoriesApi, type AddCategoryInput } from './api/categories.js';
export { ItemsApi, type AddItemInput, type UpdateItemInput, type UploadImageInput } from './api/items.js';
export { BatchApi, type CreateListWithItemsInput, type BatchUpdateEntry } from './api/batch.js';

export type {
  ItemView,
  CategoryItemView,
  CategoryView,
  ListSummaryView,
  ListDetailView,
  ListTotalsView,
  Totals,
} from './views.js';

export type { Library, List, Category, Item, CategoryItem, ListOptionalFields, LibraryPreferences } from './types.js';

export { WEIGHT_UNITS, weightToMg, mgToWeight, mgToDisplayWeight, type WeightUnit } from './weight.js';

export { LighterPackAuthError, SyncConflictError, ValidationError, NotFoundError, ApiError } from './errors.js';

// Advanced/composable building blocks — most consumers won't need these directly.
export { LighterPackHttpClient, type LighterPackHttpClientOptions, type SignInResult } from './http-client.js';
export { SyncEngine, type SyncEngineOptions, type LighterPackHttpClientPort } from './sync-engine.js';
