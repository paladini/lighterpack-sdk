import { beforeEach, describe, expect, it } from 'vitest';
import { LighterPackClient } from '../../src/client.js';
import { createEmptyLibrary } from '../../src/mutations.js';
import type { Library } from '../../src/types.js';

/**
 * A minimal fake LighterPack server, wired in as `fetchImpl`. This exercises
 * the ENTIRE real stack (URL construction, JSON bodies, cookie auth,
 * sync_token contract, every API namespace class) — only the actual network
 * hop is faked, same sync_token semantics as the real server.
 */
function createFakeServer(username = 'tester', password = 'hunter2') {
  let library: Library = createEmptyLibrary();
  let syncToken = 0;
  let sessionCounter = 0;
  let shareSlugCounter = 0;
  const sessions = new Set<string>();

  function json(body: unknown, init: { status?: number; setCookie?: string } = {}): Response {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (init.setCookie) headers.set('Set-Cookie', init.setCookie);
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const rawBody = init?.body;
    const isJsonBody = typeof rawBody === 'string';
    const body = isJsonBody ? (JSON.parse(rawBody as string) as Record<string, unknown>) : null;
    const cookieHeader = new Headers(init?.headers as Record<string, string> | undefined).get('Cookie');
    const sessionToken = cookieHeader?.replace(/^lp=/, '');
    const authed = (sessionToken && sessions.has(sessionToken)) ?? false;

    if (path === '/signin' || path === '/register') {
      if (body?.username !== username || body?.password !== password) {
        return json({ message: 'Invalid username and/or password.' }, { status: 404 });
      }
      const token = `session-${(sessionCounter += 1)}`;
      sessions.add(token);
      return json({ username, library: JSON.stringify(library), sync_token: syncToken }, { setCookie: `lp=${token}; Path=/` });
    }

    if (path === '/saveLibrary') {
      if (!authed) return json({ message: 'Please log in.' }, { status: 401 });
      if (body?.sync_token !== syncToken) {
        return json({ message: 'Your list is out of date - please refresh your browser.' }, { status: 400 });
      }
      library = JSON.parse(body.data as string) as Library;
      syncToken += 1;
      return json({ message: 'success', sync_token: syncToken });
    }

    if (path === '/externalId') {
      if (!authed) return json({ message: 'Please log in.' }, { status: 401 });
      shareSlugCounter += 1;
      return json({ externalId: `slug${shareSlugCounter}` });
    }

    if (path === '/imageUpload') {
      if (!authed) return json({ message: 'Please log in.' }, { status: 401 });
      return json({ imageUrl: '/userimages/fake.webp' });
    }

    return json({ message: 'not found' }, { status: 404 });
  };

  return { fetchImpl, getLibrary: () => library };
}

describe('LighterPackClient (SDK, against a fake in-memory server)', () => {
  let lp: LighterPackClient;

  beforeEach(() => {
    const server = createFakeServer();
    lp = new LighterPackClient({ username: 'tester', password: 'hunter2', fetchImpl: server.fetchImpl });
  });

  it('account.get() reflects the freshly-registered library', async () => {
    const info = await lp.account.get();
    expect(info).toMatchObject({ listCount: 1, categoryCount: 1, itemCount: 1 });
  });

  it('rejects with LighterPackAuthError for wrong credentials', async () => {
    const server = createFakeServer();
    const bad = new LighterPackClient({ username: 'tester', password: 'WRONG', fetchImpl: server.fetchImpl });
    await expect(bad.account.get()).rejects.toThrow(/Invalid/);
  });

  it('LighterPackClient.register() creates an account usable by a subsequent instance', async () => {
    const server = createFakeServer('newuser', 'newpass123');
    const result = await LighterPackClient.register({
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'newpass123',
      fetchImpl: server.fetchImpl,
    });
    expect(result.username).toBe('newuser');

    const freshClient = new LighterPackClient({ username: 'newuser', password: 'newpass123', fetchImpl: server.fetchImpl });
    const info = await freshClient.account.get();
    expect(info.listCount).toBe(1);
  });

  it('creates a list, adds a category, adds an item, and reads it back via lists.get()', async () => {
    const list = await lp.lists.create({ name: 'Desert trip' });
    const category = await lp.categories.add(list.listId, { name: 'Shelter' });
    const item = await lp.items.add(category.categoryId, { name: 'Tent', weight: 850, weightUnit: 'g', price: 199.99 });
    expect(item.weightGrams).toBe(850);

    const detail = await lp.lists.get(list.listId);
    const shelter = detail.categories.find((c) => c.categoryId === category.categoryId);
    expect(shelter?.items.some((i) => i.itemId === item.itemId && i.name === 'Tent')).toBe(true);
  });

  it('rename/setDescription/setOptionalFields all persist', async () => {
    const list = await lp.lists.create({});
    await lp.lists.rename(list.listId, 'Renamed');
    await lp.lists.setDescription(list.listId, 'A trip.');
    await lp.lists.setOptionalFields(list.listId, { price: true });

    const detail = await lp.lists.get(list.listId);
    expect(detail.name).toBe('Renamed');
    expect(detail.description).toBe('A trip.');
    expect(detail.optionalFields.price).toBe(true);
  });

  it('throws when removing the last category in a list without force', async () => {
    const lists = await lp.lists.list();
    const detail = await lp.lists.get(lists[0]!.listId);
    const onlyCategoryId = detail.categories[0]!.categoryId;

    await expect(lp.categories.remove(lists[0]!.listId, onlyCategoryId)).rejects.toThrow(/last category/i);
  });

  it('worn and consumable are mutually exclusive through items.setWorn/setConsumable', async () => {
    const lists = await lp.lists.list();
    const detail = await lp.lists.get(lists[0]!.listId);
    const categoryId = detail.categories[0]!.categoryId;
    const itemId = detail.categories[0]!.items[0]!.itemId;

    await lp.items.setConsumable(categoryId, itemId, true);
    const afterWorn = await lp.items.setWorn(categoryId, itemId, true);
    expect(afterWorn.worn).toBe(true);
    expect(afterWorn.consumable).toBe(false);
  });

  it('setStar accepts 0-3 and rejects out of range', async () => {
    const lists = await lp.lists.list();
    const detail = await lp.lists.get(lists[0]!.listId);
    const categoryId = detail.categories[0]!.categoryId;
    const itemId = detail.categories[0]!.items[0]!.itemId;

    const starred = await lp.items.setStar(categoryId, itemId, 2);
    expect(starred.star).toBe(2);
    await expect(lp.items.setStar(categoryId, itemId, 5 as never)).rejects.toThrow();
  });

  it('batch.addItems adds several items in one call', async () => {
    const list = await lp.lists.create({});
    const category = await lp.categories.add(list.listId, { name: 'Cooking' });
    const added = await lp.batch.addItems(category.categoryId, [
      { name: 'Stove', weight: 100, weightUnit: 'g' },
      { name: 'Pot', weight: 300, weightUnit: 'g' },
    ]);
    expect(added.map((i) => i.name)).toEqual(['Stove', 'Pot']);
  });

  it('batch.createListWithItems scaffolds a full list in one call', async () => {
    const result = await lp.batch.createListWithItems({
      name: 'Full trip',
      categories: [
        { name: 'Shelter', items: [{ name: 'Tent', weight: 800, weightUnit: 'g' }] },
        { name: 'Sleep', items: [{ name: 'Bag', weight: 600, weightUnit: 'g' }, { name: 'Pad', weight: 400, weightUnit: 'g' }] },
      ],
    });
    expect(result.name).toBe('Full trip');
    expect(result.categories.map((c) => c.name)).toEqual(['Shelter', 'Sleep']);
    expect(result.categories[1]!.items.map((i) => i.name)).toEqual(['Bag', 'Pad']);
  });

  it('batch.updateItems edits fields and flags for multiple items in one call', async () => {
    const list = await lp.lists.create({});
    const category = await lp.categories.add(list.listId, { name: 'Gear' });
    const added = await lp.batch.addItems(category.categoryId, [
      { name: 'A', weight: 1, weightUnit: 'g' },
      { name: 'B', weight: 1, weightUnit: 'g' },
    ]);

    const updated = await lp.batch.updateItems([
      { itemId: added[0]!.itemId, categoryId: category.categoryId, fields: { price: 10 }, flags: { qty: 3 } },
      { itemId: added[1]!.itemId, fields: { price: 20 } },
    ]);
    expect(updated[0]).toMatchObject({ price: 10 });
    expect((updated[0] as { qty?: number }).qty).toBe(3);
    expect(updated[1]).toMatchObject({ price: 20 });
  });

  it('generateShareLink mints a slug and writes it onto the list', async () => {
    const list = await lp.lists.create({ name: 'Shareable' });
    const shareUrl = await lp.lists.generateShareLink(list.listId);
    expect(shareUrl).toMatch(/^https:\/\/lighterpack\.com\/r\/\S+$/);

    const detail = await lp.lists.get(list.listId);
    expect(detail.shareUrl).toBe(shareUrl);
  });

  it('items.fork detaches a shared item so editing the original no longer affects the fork', async () => {
    const list = await lp.lists.create({});
    const catA = await lp.categories.add(list.listId, { name: 'A' });
    const item = await lp.items.add(catA.categoryId, { name: 'Shared knife' });

    const list2 = await lp.lists.create({ name: 'Second list' });
    const catB = await lp.categories.add(list2.listId, { name: 'B' });
    await lp.items.add(catB.categoryId, { existingItemId: item.itemId });

    const forked = await lp.items.fork(item.itemId, list2.listId);
    expect(forked.itemId).not.toBe(item.itemId);

    await lp.items.update(item.itemId, { name: 'Renamed original' });
    const secondListDetail = await lp.lists.get(list2.listId);
    const forkedItem = secondListDetail.categories[0]!.items.find((i) => i.itemId === forked.itemId);
    expect(forkedItem?.name).toBe('Shared knife'); // untouched by the rename on the original
  });

  it('items.delete removes it from every category that referenced it', async () => {
    const list = await lp.lists.create({});
    const cat = await lp.categories.add(list.listId, { name: 'Cat' });
    const item = await lp.items.add(cat.categoryId, { name: 'Doomed' });

    await lp.items.delete(item.itemId);

    const detail = await lp.lists.get(list.listId);
    expect(detail.categories[0]!.items.some((i) => i.itemId === item.itemId)).toBe(false);
  });

  it('uploadImage sets imageUrl on the item', async () => {
    const list = await lp.lists.create({});
    const cat = await lp.categories.add(list.listId, { name: 'Cat' });
    const item = await lp.items.add(cat.categoryId, { name: 'Photo item' });

    const updated = await lp.items.uploadImage(item.itemId, { buffer: Buffer.from('fake'), filename: 'x.jpg', mimeType: 'image/jpeg' });
    expect(updated.imageUrl).toBe('/userimages/fake.webp');
  });
});
