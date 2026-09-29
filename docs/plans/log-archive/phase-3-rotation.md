# Phase 3: rotation

The app moves the live log into the archive and leaves a fresh one in its place. This is the
first and only phase that changes anything in the game's folder.

[Back to the plan](README.md) · Needs: phase 2 and rulings 0.2, 0.3 · Touches the game folder: **yes**

The order of the steps is the safety design. The checks, the journal and the recovery are built
and tested before the button exists, and the restore is built before the owner's trial.

## What rotation does, in order

1. Run the preflight checks.
2. Capture, back up and verify, as in phase 2. The live log has not been touched yet.
3. Run the preflight checks again, and confirm the log's length and SHA-256 are still the ones
   captured.
4. Write a journal entry naming the log, the segment and the step about to be taken.
5. Rename the live log into the archive folder. On the same drive this is a single operation
   that either happens or does not.
6. Create an empty file at the live log's path, and close it at once.
7. Seal the segment and add it to the set sealed during this attach.
8. Confirm the moved file's SHA-256 matches the verified archive, then delete the moved file.
   The compressed archive remains.
9. Clear the journal entry.

If anything fails before step 5, the log was never touched. After step 5, the moved file stays
in the archive folder until step 8 proves the compressed copy is good.

## Steps

### 3.1 Preflight checks

- **Does**: one pure function that answers "may this log be rotated now" with a list of reasons
  when the answer is no.
- **Checks**: the player has opted in; the game is not running; the log has not grown for ten
  minutes; the engine is live on this log and has finished folding; the archive folder is on the
  same drive, or the player has accepted a slower copy; free space covers the log's size.
- **On the game check**: the app's presence watcher starts only when a feature needs it, begins
  by assuming the game is running, and keeps its last answer when a check fails. The preflight
  therefore asks for a fresh reading of its own, and treats a failed reading as "running".
- **Touches**: one new file in `src/shared/` for the rule, one in `src/main/` for the readings.
- **After this step**: no behaviour change. The panel can show why rotation is unavailable.
- **Check**: a unit test per reason, including the failed reading.
- **Undo**: delete the files.

### 3.2 The opt-in

- **Does**: adds the setting, off by default, with a plain statement of what it allows: moving
  the log file with the game closed. The panel shows the preflight result. There is still no
  rotate button.
- **Touches**: the store shape (an optional key, so no migration is needed), the panel.
- **After this step**: a player can opt in and see whether rotation would be allowed.
- **Check**: the setting persists; an older build reading the store ignores it.
- **Undo**: revert the commit. The stored key is left on disk and ignored.

### 3.3 The rotation itself, on test folders only

- **Does**: the nine steps above as one function that takes every path as an argument. Nothing
  calls it with a real log.
- **Reports in plain words when**: the rename is refused because another program holds the
  file. Nothing has changed at that point, and the player is told so.
- **Touches**: one new file in `src/main/`.
- **After this step**: no behaviour change.
- **Check**: tests on temp folders for the clean run and for a failure injected after each of
  the nine steps. After every injected failure, either the log is where it was or the moved
  file is intact in the archive folder.
- **Undo**: delete the file.

### 3.4 Recovery at launch

- **Does**: at launch, before the engine attaches, reads the journal. An entry from before step
  5 is cleared. An entry from step 5 or later is finished from where it stopped. If the live
  log's path has no file, an empty one is created, because the app does not retry a log that
  was missing when it started.
- **Touches**: one new file in `src/main/`; one call from the launch sequence in
  `src/main/session.ts`.
- **After this step**: no behaviour change when there is no journal, which is every launch
  until step 3.5.
- **Check**: a launch test for each interrupted state from step 3.3.
- **Undo**: revert the commit.

### 3.5 The button

- **Does**: adds "Archive this log and start fresh" to the panel. It is enabled only when the
  preflight passes. It states the log's size, where the archive will go, and that the game must
  stay closed until it finishes.
- **What the player sees afterwards**: the same history as before. During this session it comes
  from the engine's memory. From the next launch it comes from the sealed segment merged with
  the fresh log.
- **Touches**: the panel; an IPC channel.
- **After this step**: the feature is complete for kills, loot and levels.
- **Check**: an e2e run on a fixture log: rotate, compare Bosses, Loot and Leveling before and
  after, relaunch, compare again, append lines to the fresh log, compare a third time.
- **Undo**: revert the commit. Logs already rotated stay rotated and their history stays
  visible, because phases 1 and 2 remain.

### 3.6 Restore

- **Does**: "Put this log back" for the newest segment. Allowed when the game is closed and the
  live log is empty. It decompresses the archive to the live log's path, confirms the SHA-256,
  and sets the segment back to `backed-up`.
- **When the fresh log already has lines**: the panel explains that the two files can be joined
  by hand, oldest first, and gives both paths. The app does not join them, because that would
  be writing the game's log.
- **Touches**: the rotation file; the panel.
- **After this step**: a rotation can be taken back.
- **Check**: rotate then restore on a fixture; the restored file's SHA-256 equals the original.
- **Undo**: revert the commit.

### 3.7 The owner's trial

- **Does**: no code. The owner rotates a copy of their real log in a test folder, then a real
  log on a throwaway character, and compares the tabs.
- **Compares**: boss kill counts and first and last seen; this week's lockout rungs; loot row
  count and three item totals; level and AA history; Plane of Sky held counts.
- **After this step**: the result is recorded here, with anything that differed.
- **Undo**: step 3.6.

Result: _not yet run_

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Behind the unreleased gate and an opt-in: one button that archives the log and keeps the history. |
| Did the app change the game's folder? | Yes: it moved the log and left an empty one, with the game closed. |
| Can work stop here for good? | Yes. This is the core feature. |
| What is not covered yet? | Fight history, leveling charts, learned buff durations, resist history. See phases 4 and 5. |
