# Log archive: keep the history, let the log go

Upstream issue [#37](https://github.com/jmoyers/everquest-companion/issues/37) asks for log
rotation. This folder is the plan for the fork's answer to it. It is a plan only: nothing here is
built yet, and nothing is built until the rulings in [phase 0](phase-0-rulings.md) are made.

## The goal

A player can archive their EverQuest log and start a fresh one, and every tab still shows the
history it showed before.

## Why it needs a plan

Three facts, each read from the code or measured on a real log (2026-09-26):

1. **The log is the only copy of most history.** The engine folds the whole file from byte 0 at
   every launch. Kills, loot, level and AA history and past fights are rebuilt each time and are
   stored nowhere else. Quest turn-ins are the one exception
   (`ProgressState.questTurnIns`), and they are stored for exactly this reason.
2. **Filtering the log does not solve it.** On a 250.7 MB log covering 45 days, 71% of the bytes
   are combat involving the player's own party. Lines the engine does not parse are 13.8%, chat
   is 2.8%, and bystander combat is 2 to 3%. Removing everything that looks like noise saves 10
   to 20%.
3. **Counts are small.** The long-horizon facts of those 45 days fit in about 0.45 MB as counts,
   plus about 1.6 MB for fight summaries. gzip takes the raw file from 250 MB to 22 MB.

So the shape is: keep the raw log as a compressed archive, keep the totals the engine already
computed from it, and show both together.

## The rules every step follows

These come from the creator's own design notes and from the fork's rules. A step that cannot keep
them is redesigned, not excused.

| Rule | Where it comes from |
|---|---|
| The game's log is never rewritten. It is moved whole, or left alone. | `AGENTS.md` ("Never write to the game log"), `src/main/feedback/slice.ts` header |
| No engine file changes. The engine stays the only thing that folds a log. | The factoring ratchet in `engine/factoring-baseline.json`; the creator owns the engine |
| A count is never stored twice. History from an archived stretch is shown only when the live log does not contain that stretch. | The creator's note on seeding a fold with what it is about to re-derive (`AGENTS.md`, fold checkpoint section) |
| The raw archive is always kept. Stored totals are a convenience; the archive is the record. | Parser fixes keep landing, and only raw lines can benefit from them |
| Nothing touches the game's folder without the player opting in, and never while the game runs. | Owner and creator ruling, [phase 0](phase-0-rulings.md) |
| Every branch rule of the fork applies. | `docs/community/RULES.md`, on the fork's integration branch |

## The stop-anywhere contract

Every step in every phase ends in a state that can ship. For each step the phase document states:

- **Does**: what the step adds.
- **Touches**: the files it is expected to change.
- **After this step**: what a player sees, and what is different on disk.
- **Check**: how to know the step is right. The fork's gate (typecheck, lint, tests on Node 24)
  is assumed for every step and is not repeated.
- **Undo**: how to take the step back.

Three design choices make that contract hold:

1. **Inert first.** Reading and merging are built before anything that creates history to read.
   With no archived segment on disk, every read returns exactly what the engine served.
2. **Capture everything, merge gradually.** A segment stores every module the engine publishes
   from the first day. Merge rules are added one module at a time. A module with no merge rule
   yet simply shows the live log, as it does today, and gains its history when its rule lands.
3. **The log is the last thing touched.** Backup comes before rotation, recovery from an
   interrupted rotation comes before the button that starts one, and the player's own log is not
   moved until a verified archive of it exists.

## Phases

| Phase | What it delivers | Touches the game folder | Estimate |
|---|---|---|---|
| [0. Rulings](phase-0-rulings.md) | Decisions and one measurement. No code. | No | Owner's time |
| [1. History store](phase-1-history-store.md) | Segment format, merge rules for kills, loot and levels, wired in and inert | No | 3 to 4 h |
| [2. Capture and backup](phase-2-capture-and-backup.md) | The app can record a segment and make a verified compressed copy of the log | No (reads only) | 3 to 4 h |
| [3. Rotation](phase-3-rotation.md) | Opt-in "archive and start fresh", with recovery and restore | **Yes** | 4 to 5 h |
| [4. More history](phase-4-more-history.md) | Remaining modules, leveling charts, fight history | No | 5 to 8 h |
| [5. Engine files and re-derive](phase-5-engine-files-and-rederive.md) | Resist and learned-message history; refresh stored totals after a parser fix | No | 5 to 9 h |
| [6. Release](phase-6-release.md) | Help text, tester notes, offering it upstream | No | 1 to 2 h |

Estimates are working time for the agent that wrote this plan, not calendar time. Phases 1 to 3
are the core. Phases 4 and 5 are independent of each other and their steps can be taken in any
order.

## Words used in these documents

- **Live log**: the file the game writes, `Logs\eqlog_<Character>_<server>.txt`.
- **Segment**: one archived stretch of a character's log, with its identity, the totals captured
  from it, and the path of its compressed archive.
- **Capture**: asking the running engine for its module snapshots and writing them into a
  segment. Reads only.
- **Backup**: making a verified compressed copy of the live log. The live log is not changed.
- **Seal**: marking a segment as history that may be shown. Only a segment with a verified
  archive can be sealed.
- **Rotate**: moving the live log away so the next session starts a fresh one.
- **Merge**: answering a read with the live snapshot plus the eligible sealed segments.

## What is lost even when everything is built

These are stated here so nobody discovers them later.

- **Context at the start of a fresh log.** Until the next zone line, level line or group line
  prints, the engine does not know the current zone, level or group. Kills before the first zone
  line carry no tier. Most of this recovers within minutes of play. Carrying it over would need a
  new input to the engine, which is the creator's decision.
- **Detail inside archived fights.** Fight summaries are kept. The per-fight breakdown is about
  14.5 KB per fight (92 MB for the measured log) and is not kept. An archived fight opens as a
  summary.
- **Alerts and the event feed** are live only, today and after.
- **The engine-fed loot ledger** (the optional data-source toggle on the Loot tab) reads the
  engine directly and shows the live log only. The default ledger shows merged history.

## Not planned

- **Rotating while the game is running.** Other EverQuest tools do this by renaming the file
  mid-session. Whether the EverQuest Legends client allows it has one report behind it and no
  measurement. It stays out of scope until the test in [phase 0](phase-0-rulings.md) is run and
  the owner asks for it.
- **Removing lines from a log.** See the first rule above.
- **A resume checkpoint for the fold.** The creator built one and later removed it; this plan
  does not bring it back.

## Progress

Update this table in the same commit as the step it records.

| Step | Status | Commit |
|---|---|---|
| 0.1 to 0.5 | not started | |
| 1.1 to 1.7 | not started | |
| 2.1 to 2.5 | not started | |
| 3.1 to 3.7 | not started | |
| 4.1 to 4.9 | not started | |
| 5.1 to 5.5 | not started | |
| 6.1 to 6.4 | not started | |
