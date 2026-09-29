# Phase 4: more history

One merge rule per step. Every step is independent of the others: they can be taken in any
order, and any of them can be left out.

[Back to the plan](README.md) · Needs: phase 1 · Touches the game folder: no

Segments captured before a step lands already hold the module's snapshot, because capture stores
every module from the start. So a merge rule added here applies to logs that were archived
earlier.

Each step has the same shape:

- **Touches**: one new merge file in `src/shared/`, one line in the merge lookup.
- **Check**: unit tests, and the module added to the split-log test of step 1.6.
- **Undo**: remove the line from the lookup. The module goes back to showing the live log only.

Until a module's step lands, that module shows what the live log holds, as it does today.

## Steps

### 4.1 Drops seen per mob

- **Does**: merges the `consider` module's own-loot index (mob, item, count, last seen), and the
  separate served read for a single mob's drops.
- **After this step**: the Mobs page shows drops from archived logs.

### 4.2 Item tiers

- **Does**: merges the highest upgrade seen per item. The higher value wins.
- **After this step**: gear and planner surfaces keep the tiers learned from archived logs.

### 4.3 Class unlocks and raw turn-ins

- **Does**: merges class unlocks (the earliest sighting wins) and the raw turn-in rows for
  trades that did not match a Plane of Sky quest. Matched turn-ins are already stored.
- **After this step**: an unlock seen only in an archived log is still shown.

### 4.4 Learned respawn gaps

- **Does**: merges the learned gaps per mob, keeping the engine's own limits (the six most
  recent gaps per mob, the 800 most recent mobs).
- **After this step**: respawn timers keep what they learned.

### 4.5 Leveling charts

- **Does**: joins the `progression` module's series, older first, and then applies the same
  caps the engine applies, so the merged series is never longer than a live one could be. The
  charts already tell the player when a range reaches history that was dropped; that wording is
  reused.
- **After this step**: XP and kill-rate charts continue across a rotation.
- **Note**: this is the largest merge after loot, and the one most tied to the engine's own
  shape. If the split-log test cannot be made to pass with a short list of allowed differences,
  the step is left out and the charts start fresh after a rotation.

### 4.6 Learned buff durations

- **Does**: merges the duration samples per spell from the `buffs` module. Live bars and active
  buffs are not merged; they belong to the present.
- **After this step**: buff bars keep their learned lengths instead of falling back to the
  database value.

### 4.7 Fight history

- **Does**: adds archived fight summaries to the history list served by `serveCombatSnapshot`.
  Archived fights are marked as archived, and are listed after the live ones in time order.
- **Depends on**: ruling 0.4.
- **Touches**: `src/main/dataServer/serveShim.ts` (a few lines), one merge file.
- **After this step**: the fight picker lists fights from archived logs.

### 4.8 Fight search

- **Does**: `serveSearchFights` also searches archived summaries, with the same matching rule
  and the same limit, and adds their number to the corpus count.
- **Note**: the matching rule lives in the engine. This step writes it a second time, so the
  test pins both to the same fixture and fails if they drift.
- **After this step**: searching finds archived fights.

### 4.9 Opening an archived fight

- **Does**: an archived fight opens to its summary with a line saying the full breakdown is in
  the archive, and the archive's name.
- **Touches**: the combat drill-down in the renderer.
- **After this step**: no dead end when a player clicks an archived fight.
- **Should follow**: step 4.7. Without it there is nothing to open.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Every history surface continues across a rotation. |
| Can work stop after any single step? | Yes. Each step adds one module's history and nothing else. |
| What is still not covered? | Resist history and learned messages, which the engine stores in its own files. See phase 5. |
