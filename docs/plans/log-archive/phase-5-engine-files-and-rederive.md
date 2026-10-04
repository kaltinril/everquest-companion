# Phase 5: engine files, and refreshing stored totals

Two separate pieces of work. Steps 5.1 and 5.2 cover the two files the engine writes itself.
Steps 5.3 to 5.5 cover refreshing a segment's totals after a parser fix. Either piece can be
done without the other.

[Back to the plan](README.md) · Needs: phase 2 · Touches the game folder: no

Both pieces carry more uncertainty than the earlier phases. Each begins with a step that finds
out whether the rest is possible, and the plan accepts "no" as an answer.

## The two engine files

`resist-ledger.json` and `message-overlay.json` hold what the engine has learned about resists
and about spell messages, in one bucket per character. At every attach the engine sets aside the
attached character's bucket and rebuilds it from the log. After a rotation the rebuilt bucket
holds only what the fresh log shows, and about a minute into the session the file is written
with the smaller bucket.

This happens today to any player who shortens their log by hand. It is not caused by this plan.

### 5.1 Find out how buckets are read

- **Does**: no code. Reads the engine to answer one question: when a bucket exists under a key
  that is not the attached character, do the resist card and the message register include it?
- **Records here**: the answer, with file and line.
- **If yes**: step 5.2 can be built without touching the engine.
- **If no**: step 5.2 is not built. The loss is added to the README's list, and the question is
  put to the creator, since the fix would be in the engine.

Finding (2026-10-03, read from the code): **yes, with conditions; no engine change needed.**

- Keys are `name_server` in lower case (`engine/crates/engined/src/foldsink.rs` 208-214). The
  key `baseline` is dropped on read and write; `log` is the engine's fallback name. Avoid both.
- Resist evidence is pooled across every bucket: `src/main/resist/ledger.ts rowsFor` (219-229)
  reads all of them, and so do the whole-ledger figures in `src/main/ipc/resist.ts`. Learned
  messages are pooled too: the engine sums every bucket (`message_overlay.rs aggregate`, 348-373)
  and the app's `appSpellDb.ts` merges every user bucket (76-80).
- At attach the engine restores every bucket and empties only the attached character's
  (`fold/src/lib.rs` 451-462). Other keys are written back unchanged; there is no cap and no
  pruning by key. Empty buckets are dropped.
- The engine reads both files once at attach and rewrites them every 60th live beat with its
  whole store, so a key added while a fold is live is lost within about a minute. The copy must
  be made after the old fold stops and before `session.attach` (`engineClientHost.ts` 584-600).
  The app reads each file once per run, so the copy reaches the resist card from the next launch.
- The copy must be made exactly at the rotation, or the live log and the copy both count the
  same lines.

So step 5.2 is possible. It writes into a file format the creator owns, which the plan already
says needs the owner's agreement.

### 5.2 Keep the bucket

- **Does**: at launch, before the engine is told where its files are, copies the attached
  character's bucket to a key named for the newest sealed segment, once per segment. The engine
  leaves buckets for other keys alone.
- **Needs**: step 5.1 answered yes, and the owner's agreement, because this writes to a file
  whose format belongs to the creator.
- **Touches**: one new file in `src/main/`; one call before the attach.
- **After this step**: resist history and learned messages continue across a rotation.
- **Check**: a launch test on fixture files: the copied bucket is still there after the engine
  has written the file. The file's version number is checked first, and an unknown version is
  left alone.
- **Undo**: revert the commit. Copied buckets stay in the file and are harmless.

Agreement (owner, 2026-10-04): build it. What is best for the player decides it.

## Refreshing totals after a parser fix

Today a parser fix corrects history by itself, because the next launch folds the whole log
again. A segment's totals were computed by the parser of their day. The archive still holds
every line, so the totals can be recomputed.

### 5.3 Say which parser made a segment

- **Does**: the panel shows, for each segment, the app version that captured it, and marks
  segments captured by an older engine build.
- **Touches**: the panel only. The fields are recorded since step 1.1.
- **After this step**: a player can see which history predates a parser fix. Nothing is
  recomputed. An older segment is as correct as it was on the day it was captured.
- **Undo**: revert the commit.

### 5.4 Trial: fold an archive with a second engine

- **Does**: a developer-only command. It decompresses an archive to a temp folder, starts a
  second engine process pointed at it with no state folder, waits for the fold, and reads its
  snapshots.
- **Known obstacles, to be measured by this step**:
  - The app's supervisor is written for one engine process.
  - The engine finds the client's spell table relative to the log's folder, so a log in a temp
    folder is folded without it.
  - A full fold of the measured 250 MB log took 55 seconds.
- **Touches**: one new file in `src/main/`, reachable only from owner tools.
- **After this step**: a written answer, recorded here: does the second fold produce the same
  totals as the segment, given the same engine build?
- **Undo**: delete the file.

Finding: _not yet run_

### 5.5 Refresh a segment

- **Does**: "Refresh this history" on a segment marked as older. It runs step 5.4 in the
  background, writes the new totals to a new segment file, confirms it reads back, and swaps it
  for the old one. The old file is kept until the next launch.
- **Needs**: step 5.4 to have worked.
- **Touches**: the file from 5.4; the panel.
- **After this step**: a parser fix reaches archived history when the player asks for it.
- **Check**: on a fixture, a segment captured with a snapshot that lacks one event kind gains
  it after the refresh.
- **Undo**: the old segment file is restored from its kept copy.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Resist history continues across a rotation, and archived history can be brought up to date. |
| Can work stop after any single step? | Yes. Steps 5.1 and 5.4 produce findings only. |
| What if 5.1 or 5.4 says no? | The plan stops there for that piece, and the README's list of losses is updated. |
