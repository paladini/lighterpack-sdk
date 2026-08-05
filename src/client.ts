import { AccountApi } from './api/account.js';
import { BatchApi } from './api/batch.js';
import { CategoriesApi } from './api/categories.js';
import { ItemsApi } from './api/items.js';
import { ListsApi } from './api/lists.js';
import { LighterPackHttpClient } from './http-client.js';
import { SyncEngine } from './sync-engine.js';

export interface LighterPackClientOptions {
  /** Your LighterPack account username. */
  username: string;
  /** Your LighterPack account password. */
  password: string;
  /** Point at a self-hosted LighterPack instance. @default 'https://lighterpack.com' */
  baseUrl?: string;
  /** Override the fetch implementation (mainly for testing). */
  fetchImpl?: typeof fetch;
}

export interface RegisterInput {
  /** 3-32 characters. */
  username: string;
  email: string;
  /** 5-60 characters. */
  password: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * A LighterPack API client. Talks to the same HTTP endpoints lighterpack.com's
 * own browser client uses — there's no separate API-key system, so this
 * authenticates with your regular account username/password.
 *
 * @example
 * ```ts
 * const lp = new LighterPackClient({ username: 'me', password: 'hunter2' });
 * const list = await lp.lists.create({ name: 'Desert trip' });
 * const category = await lp.categories.add(list.listId, { name: 'Shelter' });
 * await lp.items.add(category.categoryId, { name: 'Tent', weight: 850, weightUnit: 'g' });
 * ```
 */
export class LighterPackClient {
  readonly account: AccountApi;
  readonly lists: ListsApi;
  readonly categories: CategoriesApi;
  readonly items: ItemsApi;
  readonly batch: BatchApi;

  constructor(options: LighterPackClientOptions) {
    const httpClient = new LighterPackHttpClient({ baseUrl: options.baseUrl, fetchImpl: options.fetchImpl });
    const engine = new SyncEngine({ client: httpClient, username: options.username, password: options.password });

    this.account = new AccountApi(engine);
    this.lists = new ListsApi(engine);
    this.categories = new CategoriesApi(engine);
    this.items = new ItemsApi(engine);
    this.batch = new BatchApi(engine);
  }

  /**
   * Registers a brand new LighterPack account. Not part of the instance API
   * (there's no client yet without credentials) — construct a
   * `new LighterPackClient(...)` with the same credentials afterwards to
   * start using it.
   */
  static async register(input: RegisterInput): Promise<{ username: string }> {
    const httpClient = new LighterPackHttpClient({ baseUrl: input.baseUrl, fetchImpl: input.fetchImpl });
    const result = await httpClient.register({ username: input.username, email: input.email, password: input.password });
    return { username: result.username };
  }
}
