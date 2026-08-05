# Contributing

Thanks for considering a contribution to `@paladini/lighterpack`! This is a small, focused SDK — most contributions will be new API surface, bug fixes, or documentation improvements.

## Dev setup

```bash
git clone https://github.com/paladini/lighterpack-sdk.git
cd lighterpack-sdk
npm install
npm run build
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | `tsup --watch` — rebuilds on save. |
| `npm run typecheck` | `tsc --noEmit` across `src/`, `tests/`, and `scripts/`. |
| `npm run lint` / `npm run lint:fix` | ESLint. |
| `npm test` | Unit tests (`tests/unit/**`) — fast, no network. |
| `npm run test:integration` | Opt-in live test against a real LighterPack account — see below. |
| `npm run verify-live-login` | Registers a disposable LighterPack test account and writes its credentials to `.env`. |
| `npm run changeset` | Records an intent-to-release note for your change (see Releasing below). |

## Testing

Two tiers:

- **Unit tests** (`tests/unit/`) never touch the network. `mutations.ts` is tested against in-memory fixtures; `http-client.ts` and `sync-engine.ts` are tested with a mocked fetch/mocked client; `sdk.test.ts` drives the full public `LighterPackClient` API against a fake in-memory LighterPack server (real HTTP layer, real cookie/sync_token contract, only the network hop is faked).
- **Integration test** (`tests/integration/live-smoke.test.ts`) hits the real LighterPack API end-to-end. Skipped by default, gated behind `RUN_INTEGRATION=1` plus real `LIGHTERPACK_USERNAME`/`LIGHTERPACK_PASSWORD` — run `npm run verify-live-login` first if you don't have a disposable test account handy. Not part of CI (no credentials are stored in this repo).

## How to add to the API surface

1. Add the pure business logic to [`src/mutations.ts`](src/mutations.ts) (or extend an existing function) — the single source of truth for what's a valid mutation. Add a unit test in `tests/unit/mutations.test.ts`.
2. Add or extend the relevant namespace class under `src/api/` (`account.ts`, `lists.ts`, `categories.ts`, `items.ts`, `batch.ts`). Format return values through `src/views.ts` helpers (`formatItem`, `formatCategory`, `formatListDetail`, etc.) rather than returning raw internal types — keeps output units (grams, not milligrams) and shapes consistent.
3. Export any new public types from `src/index.ts`.
4. Add a case to `tests/unit/sdk.test.ts` that calls the new method on a real `LighterPackClient` (against the fake server) and asserts on the result.
5. Add a row to the API reference table in `README.md`.

**`mutations.ts` is the highest-value review surface in this codebase.** It's an independent reimplementation of the business rules in LighterPack's own [`client/dataTypes.js`](https://github.com/galenmaly/lighterpack/blob/main/client/dataTypes.js) (worn/consumable exclusivity, star range, id sequencing, shared-item semantics, last-category/last-list guards). A subtle divergence there won't fail loudly — it'll silently write data LighterPack's own UI didn't expect. If you're touching it, cross-check against the upstream source.

## Code style

- TypeScript, `strict: true`. Prefer explicit types on public method signatures; let inference handle the rest.
- No comments explaining *what* code does — name things clearly instead. A comment is for a non-obvious *why*.
- Run `npm run lint:fix` and `npm run typecheck` before opening a PR.

## Releasing

This repo uses [Changesets](https://github.com/changesets/changesets). If your PR changes published behavior, run:

```bash
npm run changeset
```

and follow the prompts (pick a semver bump, describe the change). Commit the generated `.changeset/*.md` file alongside your change. On merge to `main`, a bot opens/updates a "Version Packages" PR; merging that PR publishes the new version to npm and GitHub Packages automatically. PRs that don't change published behavior (docs, CI, tests) don't need a changeset.

## Pull requests

- Keep PRs focused.
- Update the README's API reference table if you add/change public behavior.
- CI runs lint, typecheck, unit tests, and build on every PR. Please make sure it's green.
