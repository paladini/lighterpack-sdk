// Opt-in end-to-end test against the REAL lighterpack.com API (or LIGHTERPACK_BASE_URL,
// for self-hosted instances). Requires LIGHTERPACK_USERNAME/PASSWORD for an account it's
// safe to create and delete a list in. Run with: RUN_INTEGRATION=1 npm run test:integration

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LighterPackClient } from '../../src/client.js';

function loadDotEnvIfPresent(): void {
  const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnvIfPresent();

describe.skipIf(process.env.RUN_INTEGRATION !== '1')('LighterPack SDK live integration smoke test', () => {
  const username = process.env.LIGHTERPACK_USERNAME;
  const password = process.env.LIGHTERPACK_PASSWORD;
  if (!username || !password) {
    throw new Error('LIGHTERPACK_USERNAME/LIGHTERPACK_PASSWORD are required to run the integration suite.');
  }
  const lp = new LighterPackClient({
    username,
    password,
    baseUrl: process.env.LIGHTERPACK_BASE_URL,
  });

  it(
    'lists.create -> categories.add -> batch.addItems -> items.setWorn -> lists.generateShareLink -> lists.delete',
    async () => {
      const list = await lp.lists.create({ name: `sdk-integration-test-${Date.now()}` });
      expect(list.listId).toBeGreaterThan(0);

      const category = await lp.categories.add(list.listId, { name: 'Gear' });

      const items = await lp.batch.addItems(category.categoryId, [
        { name: 'Tent', weight: 850, weightUnit: 'g', price: 199.99 },
        { name: 'Rain jacket', weight: 300, weightUnit: 'g', worn: true },
      ]);
      expect(items).toHaveLength(2);
      expect(items[0]!.weightGrams).toBe(850);

      const wornItem = items.find((i) => i.name === 'Rain jacket')!;
      const wornResult = await lp.items.setWorn(category.categoryId, wornItem.itemId, true);
      expect(wornResult.worn).toBe(true);
      expect(wornResult.consumable).toBe(false);

      const shareUrl = await lp.lists.generateShareLink(list.listId);
      expect(shareUrl).toMatch(/^https:\/\/lighterpack\.com\/r\/\S+$/);

      const detail = await lp.lists.get(list.listId);
      expect(detail.totals.weightGrams).toBeCloseTo(1150, 0);

      await lp.lists.delete(list.listId);
    },
    30_000,
  );
});
