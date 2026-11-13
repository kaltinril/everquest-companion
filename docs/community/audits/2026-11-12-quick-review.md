# Quick review, 2026-11-12

One hour, three read-only reviewers (overlays and rate math; `src/main`; commits since 2026-11-07),
each finding read against the code before it was fixed. Not reviewed: `store.ts`, `storeCache.ts`,
`storeFile.ts`, `windows.ts`, the overlay window management, `engineHost.ts`, the engine crates.

## Fixed (test.48)

- `MobCopyDialog.tsx`: `draft` (a new closure every parent render) was a memo dependency, so the
  page was merged again on each render and the whole page put back on the clipboard, over a field
  the player had just copied by hand. Read through a ref now. No unit test (a component).
- `progressionStats.ts`: five loops re-ran `lowerBound(col, t1)` on every pass. Hoisted.
  `rangeStats` over 50,000 exp and 50,000 kill samples: 8.34 ms to 5.82 ms per call.
- `shotIpc.ts` `catalogNames`: `Object.values` over the item catalog ran on every `known()` call
  before the cached list was returned (0.105 ms per call over 11,850 items). Now inside the `??=`;
  the list is `itemShotKeep.ts catalogNameList`, unit tested.
- `userSounds.ts`: `manifest.json` was written in place; a kill mid-write left a torn file that
  reads as empty, and the next import then dropped every earlier sound. Written beside and renamed.
- `tests/symbolicate.test.mts`: threw `ENOENT` when a dev launch left `out/renderer` with no
  `assets`; it skips now, so `known-reds.sh` passes in the main clone again.

## Open, not fixed (ranked)

1. `respawnWatchList.ts respawnWithSharedName`: switching "shared name" on for a mob whose watch
   went away re-watches it without taking its kept typed number back and without the
   `RESPAWN_MAX_WATCHES` check (`respawnWithWatch` does both). The comment says the kept list is
   untouched on purpose; owner's call.
2. `logArchive/rotate.ts:159`: the second journal write (`step: 'moved'`) truncates the journal in
   place just after the log was renamed away; a kill inside it strands the log at `<id>.moving`.
   `recoverRotation` already treats `moving` with an existing `movedPath` as moved, so the write
   can go, or become tmp plus rename.
3. `lootRates.ts windowItemRows` / `windowLootTotals`: the whole loot history is scanned for a
   window that is usually its tail. The list is oldest first (`zoneHistory.ts firstLootAt` already
   binary-searches it); start at a lower bound on `t0`. Unmeasured.
4. `XpOverlay.tsx`: `attributeSales(prog, loot)` runs in the view memo even with the coin row off.
5. `progressionStats.ts buildRows`, `intersectSpans`, `subtractSpans`: O(segments x spans) over
   inputs that are ascending and disjoint; a two-pointer merge. Bites on `All` and `Zone` slices.
6. `pictureInbox.ts:81`: the whole file is read before the 40 MB cap is applied; `statSync` first.
7. `gapImages.ts pagesMet`: a name with exactly one imageless page skips the zone check, so a
   single zone-titled page can be offered in another zone. Not checked against the data.
8. `gaps_locs.rs target`: a /loc joins the first cluster within range, not the nearest.
9. `HealMeter.tsx`: `now` in a `useMemo` dependency list, so the memo never hits.
10. `useOverlayModule.ts`: a re-hydrate on a character change does not invalidate an in-flight
    fetch, and an empty answer keeps the previous character's state. Low confidence.
