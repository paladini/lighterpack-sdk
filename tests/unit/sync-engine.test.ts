import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SyncConflictError, ValidationError } from '../../src/errors.js';
import { createEmptyLibrary, createList } from '../../src/mutations.js';
import { SyncEngine, type LighterPackHttpClientPort } from '../../src/sync-engine.js';
import type { Library } from '../../src/types.js';

function staleTokenError(): ApiError {
  return new ApiError('Your list is out of date - please refresh your browser.', 400);
}

describe('SyncEngine', () => {
  let library: Library;
  let client: LighterPackHttpClientPort;
  let signIn: ReturnType<typeof vi.fn>;
  let saveLibrary: ReturnType<typeof vi.fn>;
  let engine: SyncEngine;

  beforeEach(() => {
    library = createEmptyLibrary();
    signIn = vi.fn().mockResolvedValue({ username: 'tester', library: JSON.stringify(library), syncToken: 1 });
    saveLibrary = vi.fn();
    client = {
      signIn,
      saveLibrary,
      uploadImage: vi.fn().mockResolvedValue({ imageUrl: '/userimages/fake.webp' }),
      generateExternalId: vi.fn().mockResolvedValue({ externalId: 'abc123' }),
    };
    engine = new SyncEngine({ client, username: 'tester', password: 'hunter2' });
  });

  it('loads lazily on first read and reuses the cache afterwards', async () => {
    const a = await engine.read((lib) => lib.lists.length);
    const b = await engine.read((lib) => lib.lists.length);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('dedups concurrent first-load reads into a single signIn() call', async () => {
    const [a, b, c] = await Promise.all([
      engine.read((lib) => lib.lists.length),
      engine.read((lib) => lib.lists.length),
      engine.read((lib) => lib.lists.length),
    ]);
    expect([a, b, c]).toEqual([1, 1, 1]);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('mutate() persists via saveLibrary and commits the new sync_token', async () => {
    saveLibrary.mockResolvedValue({ syncToken: 2 });

    const newListId = await engine.mutate((lib) => createList(lib, { name: 'Desert trip' }).id);

    expect(saveLibrary).toHaveBeenCalledTimes(1);
    const call = saveLibrary.mock.calls[0]![0] as { syncToken: number; data: string };
    expect(call.syncToken).toBe(1);
    const savedLibrary = JSON.parse(call.data) as Library;
    expect(savedLibrary.lists.some((l) => l.id === newListId && l.name === 'Desert trip')).toBe(true);

    // Committed cache reflects the mutation without another network round-trip.
    const cached = await engine.read((lib) => lib.lists.length);
    expect(cached).toBe(2);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('a validation error inside the callback never calls saveLibrary and leaves the cache untouched', async () => {
    await engine.read(() => undefined); // force initial load
    await expect(
      engine.mutate((_lib) => {
        throw new ValidationError('nope');
      }),
    ).rejects.toThrow(ValidationError);

    expect(saveLibrary).not.toHaveBeenCalled();
    const count = await engine.read((lib) => lib.lists.length);
    expect(count).toBe(1);
  });

  it('retries exactly once on a stale sync_token, re-running the mutation against fresh state', async () => {
    const refreshedLibrary = createEmptyLibrary();
    createList(refreshedLibrary, { name: 'Someone else added this' }); // simulate a concurrent edit

    saveLibrary.mockRejectedValueOnce(staleTokenError()).mockResolvedValueOnce({ syncToken: 9 });
    signIn
      .mockResolvedValueOnce({ username: 'tester', library: JSON.stringify(library), syncToken: 1 }) // initial load
      .mockResolvedValueOnce({ username: 'tester', library: JSON.stringify(refreshedLibrary), syncToken: 5 }); // refresh after conflict

    const result = await engine.mutate((lib) => createList(lib, { name: 'My new list' }).id);

    expect(saveLibrary).toHaveBeenCalledTimes(2);
    expect((saveLibrary.mock.calls[0]![0] as { syncToken: number }).syncToken).toBe(1);
    expect((saveLibrary.mock.calls[1]![0] as { syncToken: number }).syncToken).toBe(5);

    // The retried mutation ran against the REFRESHED library (2 lists), not the stale one.
    const savedOnRetry = JSON.parse((saveLibrary.mock.calls[1]![0] as { data: string }).data) as Library;
    expect(savedOnRetry.lists).toHaveLength(3); // refreshed's 2 lists + the newly created one
    expect(savedOnRetry.lists.some((l) => l.name === 'My new list' && l.id === result)).toBe(true);
    expect(savedOnRetry.lists.some((l) => l.name === "Someone else added this")).toBe(true);
  });

  it('throws SyncConflictError after a second consecutive stale-token failure', async () => {
    saveLibrary.mockRejectedValue(staleTokenError());

    await expect(engine.mutate((lib) => createList(lib, { name: 'X' }).id)).rejects.toThrow(SyncConflictError);
    expect(saveLibrary).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenCalledTimes(2); // initial load + one refresh
  });

  it('propagates non-conflict ApiErrors from saveLibrary without retrying', async () => {
    saveLibrary.mockRejectedValue(new ApiError('boom', 500));
    await expect(engine.mutate((lib) => createList(lib, { name: 'X' }).id)).rejects.toThrow('boom');
    expect(saveLibrary).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent mutate() calls so each sees the prior one\'s committed sync_token', async () => {
    saveLibrary.mockResolvedValueOnce({ syncToken: 2 }).mockResolvedValueOnce({ syncToken: 3 });

    const [firstId, secondId] = await Promise.all([
      engine.mutate((lib) => createList(lib, { name: 'First' }).id),
      engine.mutate((lib) => createList(lib, { name: 'Second' }).id),
    ]);

    expect(firstId).not.toBe(secondId);
    expect(saveLibrary).toHaveBeenCalledTimes(2);
    expect((saveLibrary.mock.calls[0]![0] as { syncToken: number }).syncToken).toBe(1);
    expect((saveLibrary.mock.calls[1]![0] as { syncToken: number }).syncToken).toBe(2);

    // The second mutation's draft must include the first mutation's list —
    // proof it ran against the already-committed state, not a stale clone.
    const secondSavedLibrary = JSON.parse((saveLibrary.mock.calls[1]![0] as { data: string }).data) as Library;
    expect(secondSavedLibrary.lists.some((l) => l.name === 'First')).toBe(true);
    expect(secondSavedLibrary.lists.some((l) => l.name === 'Second')).toBe(true);
  });

  it('one rejected mutation does not wedge the queue for the next call', async () => {
    saveLibrary.mockRejectedValueOnce(new ApiError('boom', 500)).mockResolvedValueOnce({ syncToken: 2 });

    await expect(engine.mutate((lib) => createList(lib, { name: 'Fails' }))).rejects.toThrow('boom');
    const id = await engine.mutate((lib) => createList(lib, { name: 'Succeeds' }).id);
    expect(id).toBeGreaterThan(0);
    expect(saveLibrary).toHaveBeenCalledTimes(2);
  });

  it('refresh() re-fetches and read() reflects the refreshed state afterwards', async () => {
    await engine.read(() => undefined); // initial load, 1 list
    const refreshedLibrary = createEmptyLibrary();
    createList(refreshedLibrary, { name: 'Extra' });
    signIn.mockResolvedValueOnce({ username: 'tester', library: JSON.stringify(refreshedLibrary), syncToken: 42 });

    await engine.refresh();
    const count = await engine.read((lib) => lib.lists.length);
    expect(count).toBe(2);
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});
