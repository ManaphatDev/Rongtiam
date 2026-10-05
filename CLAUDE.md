# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"โรงเตี๊ยม" (Rongtiam): a realtime multiplayer virtual tabletop (in the spirit of Owlbear Rodeo) with a Thai UI. Vite + TypeScript + Svelte 5 frontend (static, deployed to Vercel) on Supabase (Postgres + RLS, Realtime broadcast/presence, Storage, anonymous auth). Keep user-facing strings in Thai. `legacy/dnd-table.html` is the original single-file app; it is the reference the table code was ported from — don't edit it.

The roadmap (phases 2–5: fog, 3D dice, ruleset plugins + D&D 2024 sheets, character builder) lives in the approved plan; phase 1 (foundation) is what exists now.

## Commands

```bash
npm run dev            # Vite dev server; /local is an offline single-player table (dev only, no Supabase needed)
npm test               # Vitest: unit tests (src/**/*.test.ts) + database tests (tests/db) in PGlite
npx vitest run src/sync/state.test.ts   # one file;  add  -t "name"  for one test
npm run test:db        # only the SQL/RLS tests
npm run check          # svelte-check + tsc
npm run build
npm run e2e            # Playwright GM+player flow against the real Supabase dev project (skips without .env.local)
npm run db:push        # supabase db push (after `supabase link --project-ref <ref>`)
```

Supabase config comes from `.env.local` (see `.env.example`). There is no Docker here: develop against a cloud dev project and change the schema only through new files in `supabase/migrations/` (never dashboard edits).

## Architecture

**Server is the permission boundary.** `supabase/migrations/` holds everything:
- Tables `rooms`, `room_members` (role gm|player, status pending|approved|banned), `items` (kind map|char|sticker|fog, `props` flat jsonb, `meta` jsonb namespaced per ruleset, `z`, `locked`, `hidden`), `assets`, `roll_log`; `room_secrets` (GM key hash, no policies) and `room_clock` (per-room `seq`).
- RLS: maps/fog/lock/hide are GM-only; players add/move/delete unlocked, visible chars and stickers. Membership changes go through the security-definer RPCs `create_room`, `request_join`, `claim_gm`; `members_guard` blocks non-GMs from changing role/status on direct updates (it checks `current_user = 'authenticated'`, so trusted RPCs pass).
- All item writes go through `apply_ops(room, ops)` (security **invoker**, so RLS applies; one transaction per batch; patch props merge with `null` deleting a key; meta merges per namespace; raises 42501 when an update matches nothing; returns rows actually written/deleted).
- BEFORE triggers stamp `rev = private.tick(room)` (monotonic per room); AFTER triggers broadcast committed rows with `realtime.send` to `room:<id>:db` (members) or `room:<id>:gm` (GMs). **Hidden items are only ever sent on the gm topic**; hiding a visible item also sends `{op:'del', reason:'hidden'}` on db. `room:<id>:live` is the only client-writable topic (ephemeral drags/pings + presence).
- `room_snapshot(room)` returns everything the caller may see in one statement.
- `tests/db/` runs the real migrations in PGlite on top of `tests/db/supabase-stubs.sql` (fake `auth`, `realtime`, `storage`, roles). Add a test there for every policy/RPC change; they run in `npm test`.

**Client sync** (`src/sync/`):
- `state.ts` `RoomState`: confirmed rows + this client's pending (optimistic) layer. Events older than the stored `rev` are ignored; deletes are tombstoned; events that arrive while a snapshot loads are buffered and replayed if `rev > snapshot.seq`. `get(id)` = confirmed ⊕ pending.
- `opqueue.ts`: coalesces patches per item (delay param: sliders ~150 ms, typing ~400 ms, drag commit 0), sends one batch at a time, retries network errors, rolls back on permanent errors (42501 etc.).
- `ephemeral.ts`: throttled live messages; rate `budgetHz(online)` keeps the project under Supabase's free 100 msg/s (deliveries count).
- `room.svelte.ts` `RoomStore`: wires backend + state + queue + bus + `AssetCache`; exposes `*Version` rune counters that Svelte `$derived` blocks read (`void store.itemsVersion`). Resyncs on channel rejoin, `online`, and tab visible after >30 s.
- `backend.ts` interface; `src/supa/backend.ts` (Supabase) and `local.ts` (in-memory, dev `/local`).

**Table** (`src/table/`): `Stage.ts` is the imperative port of the legacy IIFE (view transform with `--inv`, pointer/pinch/drag/rotate, map snapping via `lib/geometry.ts`). It renders from `store.item(id)` plus its own drag `overrides` and eased remote `previews`; a drag broadcasts throttled previews and commits **one** patch on pointerup (with `z = topZ` to lift non-maps). `canEdit`/`canSelect` mirror RLS so the UI never offers refused actions. Stacking is by `z` within the maps layer vs the items layer. `actions.ts` adds maps/chars/stickers: images go through `images.ts` (resize/re-encode, file named `<sha256>.<ext>`), upload once to the private `room-assets/<room>/` bucket, are cached in IndexedDB, and items reference the file name in `props.img`.

**Routes**: `/` create/join, `/r/<slug>` (anonymous sign-in → optional `#gm=<key>` claim, fragment stripped → join form / waiting poll / table), `/local` (dev). Per-viewer prefs (view, snap, profile, recent rooms, GM keys) live in localStorage.

## Conventions

- CSS tokens in `src/app.css` `:root`, redefined for dark mode under `prefers-color-scheme` (guarded by `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]` — add new colours in all three.
- Destructive buttons use `ui/TwoStepButton.svelte`. Keyboard shortcuts live in `Stage.onKey` (V/1, 2, 3, Space, F, H, T, Q/E, +/-, Esc, Delete); update tooltips and Thai help text with them.
- Real `<button>`s with `aria-pressed`/`aria-label`; respect `prefers-reduced-motion`.
- Rolls use `lib/rand.ts` (`crypto`, rejection sampling).
