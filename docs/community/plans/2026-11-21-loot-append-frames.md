# Loot history: stop re-sending it whole on each pickup (designed, not built)

Read from the code at `e54fdce12`; nothing was built or re-measured. On 2026-11-20 the owner heard
this explained and had no complaint, so building it is the owner's choice.

## What happens today

- A pickup moves the loot cursor. Each window with a mounted loot reader then asks for the whole
  ledger: the main window on a tab that reads loot (Overview does), and the XP overlay while its
  motes or coin row shows. Several pickups in one 100 ms beat share one read.
- The engine rebuilds the ledger, main parses it and merges archive rows, and the whole array crosses
  IPC separately to each window (`serveShim.ts`, `ipc/world.ts`, `moduleStore.ts`).
- Measured 2026-11-19 at 110,000 rows: 155 to 410 ms of main (`agent/MEASURED.md`, the large-log
  section). Merged history has no size limit: the 32 MiB gate sees only the engine's reply.

## Step 1: append frames (no engine or protocol change)

- One new IPC channel, for `loot` only: `getLootFrame(known: { gen, length } | null)`.
- Main reads the existing merged snapshot and keeps the last array. An exact prefix keeps `gen`;
  anything else raises it. A matching mark gets `rows.slice(length)`; any other mark gets everything.
- The window applies `from === held.length ? held.concat(rows) : refetch with null`. Zero new rows
  keeps the array identity. `useModule` and its consumers do not change.
- Character switch, world change, a null reply or a bad mark clear the mark. A rebirth clear regrown
  to the same length fails the prefix check. Do not use `seq` as the base: it follows every event.
- Files: new `shared/lootFrame.ts`; `shared/ipc.ts`, `dataServer/serveShim.ts`, `ipc/world.ts`, the
  two preloads, `lib/moduleStore.ts`, `overlay/useOverlayModule.ts`. About 160 product lines, 250 test.
- Estimated main stall after it: 40 to 65 ms. Not measured. Engine build, parse, first load and
  renderer folds stay as they are.
- Risks: shared rows now live across pickups (pin with a frozen-row test); main retains the ledger.

## Later steps, each separate

2. Paged first load, about 20,000 rows a message. 3. Incremental renderer folds, where measured.
4. An engine tail op (schema, codegen, ingest), decided after step 1's measurements.

## Tests

- Unit: `tests/lootFrame.test.mts` (one row crosses; same-length rebirth; changed archive prefix;
  missed pickups; two windows; bad mark; a seeded walk equals a full read; frozen rows), plus
  `moduleStore`, `overlayModuleRows` and `logArchive` cases.
- Needs the app closed: a new `loot-append` e2e, then `xp-overlay`, `loot-window`, `engine-loot-view`,
  `character-switch`, `character-switch-storm`, `overlay-sync`, and before/after timing.

## Owner decisions

1. Build step 1, or leave it. 2. How to bound merged history: paging is suggested, because a hard
limit empties Loot for archive users and keeping only the newest rows changes totals and drop rates.
