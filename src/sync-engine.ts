import { ApiError, SyncConflictError } from './errors.js';
import type { Library } from './types.js';

/** The subset of LighterPackHttpClient the engine depends on — kept narrow so tests can mock it directly. */
export interface LighterPackHttpClientPort {
  signIn(input: { username: string; password: string }): Promise<{ username: string; library: string; syncToken: number }>;
  saveLibrary(input: { syncToken: number; data: string }): Promise<{ syncToken: number }>;
  uploadImage(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<{ imageUrl: string }>;
  generateExternalId(): Promise<{ externalId: string }>;
}

export interface SyncEngineOptions {
  client: LighterPackHttpClientPort;
  username: string;
  password: string;
}

function isStaleSyncTokenError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && /out of date/i.test(err.message);
}

/**
 * The single choke point every read/write operation goes through. LighterPack
 * has no granular CRUD API — the whole library is one JSON blob guarded by
 * optimistic concurrency (sync_token) — so this engine owns the
 * fetch-mutate-save cycle once instead of every method reimplementing it.
 */
export class SyncEngine {
  private readonly client: LighterPackHttpClientPort;
  private readonly username: string;
  private readonly password: string;

  private library: Library | null = null;
  private syncToken: number | null = null;

  /** Serializes every mutate()/refresh() call so concurrent calls can't race on sync_token. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Dedups concurrent first-load calls so parallel reads don't each trigger their own signIn(). */
  private loadingPromise: Promise<void> | null = null;

  constructor(options: SyncEngineOptions) {
    this.client = options.client;
    this.username = options.username;
    this.password = options.password;
  }

  async ensureLoaded(): Promise<void> {
    if (this.library !== null) return;
    if (!this.loadingPromise) {
      this.loadingPromise = this.loadFresh().finally(() => {
        this.loadingPromise = null;
      });
    }
    await this.loadingPromise;
  }

  /** Re-fetches the library from the server, discarding the local cache. Queued like a mutation. */
  refresh(): Promise<void> {
    const run = this.queue.then(() => this.loadFresh());
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Uploads an image and returns its hosted URL. Not part of the library blob, so it bypasses the mutate queue. */
  async uploadImage(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<string> {
    await this.ensureLoaded();
    const { imageUrl } = await this.client.uploadImage(input);
    return imageUrl;
  }

  /** Mints a public share-link slug. Caller is responsible for writing it onto a List's externalId via mutate(). */
  async mintShareSlug(): Promise<string> {
    await this.ensureLoaded();
    const { externalId } = await this.client.generateExternalId();
    return externalId;
  }

  private async loadFresh(): Promise<void> {
    const result = await this.client.signIn({ username: this.username, password: this.password });
    this.library = JSON.parse(result.library) as Library;
    this.syncToken = result.syncToken;
  }

  /** Read-only access: loads on first use, then serves the cached library with no network round-trip. */
  async read<T>(fn: (library: Library) => T): Promise<T> {
    await this.ensureLoaded();
    return fn(this.library!);
  }

  /**
   * Runs `fn` against a private clone of the library and persists the result.
   * `fn` may mutate its `library` argument in place and/or return a value.
   * On a stale sync_token conflict, refetches once and re-runs `fn` from
   * scratch against fresh state; a second conflict surfaces as SyncConflictError.
   */
  mutate<T>(fn: (library: Library) => T): Promise<T> {
    const run = this.queue.then(() => this.runMutation(fn));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runMutation<T>(fn: (library: Library) => T, attempt = 0): Promise<T> {
    await this.ensureLoaded();
    const draft = structuredClone(this.library!);
    // Business-rule errors (NotFoundError/ValidationError) throw here, before
    // any network call — no partial save, nothing to retry.
    const result = fn(draft);

    try {
      const { syncToken } = await this.client.saveLibrary({ syncToken: this.syncToken!, data: JSON.stringify(draft) });
      // Commit only after a successful save, so a failed attempt never
      // leaves `this.library` reflecting a mutation that was never persisted.
      this.library = draft;
      this.syncToken = syncToken;
      return result;
    } catch (err) {
      if (isStaleSyncTokenError(err) && attempt === 0) {
        await this.loadFresh();
        return this.runMutation(fn, attempt + 1);
      }
      if (isStaleSyncTokenError(err)) {
        throw new SyncConflictError(`LighterPack library changed elsewhere while saving, even after retrying once: ${(err as Error).message}`);
      }
      throw err;
    }
  }
}
