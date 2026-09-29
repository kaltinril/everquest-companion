# Phase 0: rulings

No code. Each step is a decision or a measurement, recorded here when it is made. Phases 1 and 2
need steps 0.1 and 0.2. Phase 3 also needs step 0.3. The fight steps of phase 4 need step 0.4.
Step 0.5 is optional.

[Back to the plan](README.md)

## 0.1 Does issue #37 become the fork's work?

- **Decides**: whether the fork builds this at all.
- **Background**: `docs/community/ISSUES.md`, on the fork's integration branch, records #37 as
  waiting on the owner, because the request involves the game's own folder. The creator has not
  yet commented on the issue.
- **Recommendation**: yes for phases 1 and 2, which never change anything in the game's folder.
  Phase 3 is decided separately in step 0.3.
- **After this step**: the ISSUES.md row names this branch and this plan.
- **Undo**: restore the row.

Ruling: _not yet made_

## 0.2 Where do archives and segments live?

- **Decides**: the folder for compressed archives and for segment files.
- **Options**:

| Option | For | Against |
|---|---|---|
| The app's own data folder (recommended) | Phases 1 and 2 never write outside the app. Nothing new appears in the game's folder. | Players who look for old logs will look beside the live one first. |
| `Logs\archive\` inside the game's folder | Where players expect it. Log discovery does not look in subfolders, so nothing there is mistaken for a character. | Creates a folder in the game's install. |
| A folder the player picks | Flexible. | A folder on another drive turns a rename into a copy, which phase 3 must then handle. |

- **Fixed whatever is chosen**: an archive's name never matches `eqlog_*.txt` in a folder that
  log discovery reads, because discovery would list it as a character.
- **Undo**: a later change of folder moves files; segment files record the archive path.

Ruling: _not yet made_

## 0.3 May the app move the live log?

- **Decides**: whether phase 3 is built.
- **What is being asked**: with the game closed and the player opted in, the app renames the live
  log into the archive folder and leaves an empty file in its place.
- **What is not being asked**: editing the log, removing lines from it, or touching it while the
  game runs.
- **Who decides**: the owner for the fork. The creator's view is asked for on the issue before
  anything is offered upstream (step 6.4).
- **If the answer is no**: phases 1, 2, 4 and 5 still stand. The player clears the log by hand
  with the game closed, and step 3.4's launch check recognises that the log was replaced.

Ruling: _not yet made_

## 0.4 How much of each fight is kept?

- **Decides**: what phase 4 stores for archived fights.
- **Measured**: summaries for 6,299 fights are 1.6 MB. Full breakdowns are 92 MB.
- **Recommendation**: summaries only. The archive still holds every line, so a full breakdown can
  be rebuilt from it by step 5.5 if it is ever wanted.

Ruling: _not yet made_

## 0.5 Does the client let go of the log between lines?

- **Measures**: whether the EverQuest Legends client holds the log open.
- **Needed for**: nothing in this plan. It is recorded because the question keeps coming up, and
  because a client that holds the file would make a rename fail cleanly, which step 3.3 must
  report in plain words.
- **How**: on a throwaway character, with the game running and `/log on`, rename the live log in
  Explorer. Then say something in game. Note whether the rename succeeded and whether a new file
  appeared.
- **Owner's time**: about ten minutes.

Result: _not yet measured_
