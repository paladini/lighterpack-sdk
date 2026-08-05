# @paladini/lighterpack

[![CI](https://github.com/paladini/lighterpack-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/paladini/lighterpack-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40paladini%2Flighterpack.svg)](https://www.npmjs.com/package/@paladini/lighterpack)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

A lightweight, modern TypeScript SDK for [LighterPack](https://lighterpack.com) — manage packing lists, categories, and items in code. Zero runtime dependencies, ESM-only, fully typed.

> **Unofficial.** Not affiliated with or endorsed by LighterPack. Talks to LighterPack's own web API (the same one lighterpack.com's browser client uses) — see [Architecture](#architecture) below. There's also an [MCP server](https://github.com/paladini/lighterpack-mcp) built on the same underlying layer, if you want an AI agent to use LighterPack directly instead of writing code against this SDK.

## Install

```bash
npm install @paladini/lighterpack
```

## Quick start

```ts
import { LighterPackClient } from '@paladini/lighterpack';

const lp = new LighterPackClient({ username: 'you', password: 'hunter2' });

const list = await lp.lists.create({ name: 'Desert trip' });
const shelter = await lp.categories.add(list.listId, { name: 'Shelter' });

await lp.items.add(shelter.categoryId, {
  name: 'Tent',
  weight: 850,       // grams by default
  price: 199.99,
});

const detail = await lp.lists.get(list.listId);
console.log(`${detail.name}: ${detail.totals.weightGrams}g`);
```

LighterPack has no separate API-key system — `username`/`password` are your regular account credentials. See [Authentication](#authentication) below.

## API reference

Every method is async and throws a typed error (see [Errors](#errors)) on failure — no error codes to check. Weights are always in **grams** at input/output boundaries (`weight`/`weightUnit` on input, `weightGrams` on output) regardless of what unit LighterPack's UI happens to display; pass `weightUnit: 'oz' | 'lb' | 'kg'` to use a different input unit.

### `lp.account`

| Method | Description |
|---|---|
| `get()` | Signed-in library summary: list/category/item counts, unit/currency settings. |
| `refresh()` | Force a re-fetch from LighterPack, discarding the local cache. |
| `setTotalUnit(unit)` | Unit LighterPack's own UI uses to display list totals. |
| `setItemUnit(unit)` | Default unit LighterPack's own UI pre-fills for new items. |
| `setCurrencySymbol(symbol)` | Currency symbol shown next to prices (1-4 chars). |

### `lp.lists`

| Method | Description |
|---|---|
| `create({ name?, description?, optionalFields? })` | Create a new, empty list. |
| `list()` | Summary of every list (name, category count, totals). |
| `get(listId)` | Full detail: categories, items, computed totals. |
| `rename(listId, name)` | Rename a list. |
| `setDescription(listId, description)` | Set a list's description. |
| `setOptionalFields(listId, fields)` | Toggle optional columns: `images`, `price`, `worn`, `consumable`, `listDescription`, `packWeight`. |
| `copy(listId, newName?)` | Duplicate a list (categories copied, items shared with the original). |
| `delete(listId)` | Delete a list. Throws if it's the only one. |
| `generateShareLink(listId)` | Mint a public read-only share link, returns the URL. |

### `lp.categories`

| Method | Description |
|---|---|
| `add(listId, { name?, color? })` | Add a category to a list. |
| `rename(categoryId, name)` | Rename a category. |
| `setColor(categoryId, color?)` | Set (hex) or clear a category's swatch color. |
| `remove(listId, categoryId, force?)` | Remove a category. Throws on a list's last category unless `force`. |
| `reorder(listId, categoryIds)` | Set a list's category display order. |

### `lp.items`

| Method | Description |
|---|---|
| `add(categoryId, input)` | Add a new item to a category, or link an existing item (`existingItemId`) as a shared item. |
| `update(itemId, patch)` | Patch name, description, price, weight, link, or image URL. |
| `removeFromCategory(categoryId, itemId)` | Unlink an item from one category (keeps it elsewhere). |
| `delete(itemId)` | Delete an item everywhere it's referenced. Cannot be undone. |
| `fork(itemId, listId)` | Detach a shared item into an independent copy for one list. |
| `setImageUrl(itemId, imageUrl)` | Point an item at an external image URL. |
| `uploadImage(itemId, { buffer, filename, mimeType })` | Upload a photo (JPEG/PNG/WebP, 5MB max) and attach it. |
| `setQuantity(categoryId, itemId, qty)` | Set exact quantity. |
| `incrementQuantity` / `decrementQuantity(categoryId, itemId, by?)` | Adjust quantity by N (floored at 0). |
| `setWorn(categoryId, itemId, worn)` | Mark worn/not worn — auto-clears `consumable` (mutually exclusive). |
| `setConsumable(categoryId, itemId, consumable)` | Mark consumable/not consumable — auto-clears `worn`. |
| `setStar(categoryId, itemId, star)` | Set favorite/priority level: `0` (none) to `3` — a 3-level rating, not a plain flag. |

### `lp.batch`

| Method | Description |
|---|---|
| `addItems(categoryId, items)` | Add several items to one category in a single save round-trip. |
| `createListWithItems({ name, description?, categories })` | Scaffold a whole list — categories and items — in one call. |
| `updateItems(updates)` | Apply field and/or flag edits across many items in one call. |

### Registering a new account

```ts
import { LighterPackClient } from '@paladini/lighterpack';

await LighterPackClient.register({ username: 'newuser', email: 'me@example.com', password: 'hunter22' });
const lp = new LighterPackClient({ username: 'newuser', password: 'hunter22' });
```

## Authentication

LighterPack has no API-key system — `signIn` accepts your regular account username/password, same as the website. The client caches the resulting session cookie in memory for its lifetime; there's no persistent token to revoke individually, so if you need to cut off access, change the account password.

## Self-hosted instances

LighterPack [is itself open source](https://github.com/galenmaly/lighterpack). Point the client at a self-hosted instance with `baseUrl`:

```ts
const lp = new LighterPackClient({ username, password, baseUrl: 'https://lighterpack.example.com' });
```

## Errors

All methods throw one of these (all exported):

| Error | When |
|---|---|
| `LighterPackAuthError` | Bad credentials, or the session was rejected. |
| `ValidationError` | Bad input caught before any network call (invalid unit, star out of 0-3, malformed hex color, business-rule guard). |
| `NotFoundError` | Unknown list/category/item id. |
| `SyncConflictError` | The library changed elsewhere while saving, even after one automatic retry. |
| `ApiError` | Any other unexpected HTTP failure — has `.status` and `.body`. |

## Architecture

LighterPack has no granular REST API — no "create list" or "add item" endpoint. A user's entire library (every list, category, item) is one JSON document, synced via `POST /saveLibrary` with an optimistic-concurrency token (`sync_token`). This SDK's [`SyncEngine`](src/sync-engine.ts) is the one place that fetch → mutate → save cycle is implemented: every method call runs a small mutation against a cached, cloned copy of the library and persists it, retrying once if another writer (e.g. your browser tab) saved in between. Business rules (worn/consumable exclusivity, id sequencing, shared items, etc.) live in [`mutations.ts`](src/mutations.ts), ported from LighterPack's own [open-source client](https://github.com/galenmaly/lighterpack).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
