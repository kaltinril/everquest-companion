---
name: wiki-delta
description: Refresh the committed wiki data with a delta scrape of eqlwiki (GitHub pack compare, delta, data commit, gate, merge) using scripts/community/wiki-delta.sh. Use when the owner asks for a delta scrape, a wiki refresh, a data update, or before any release (the release skill requires it).
---

# The wiki delta

One script does the run that `docs/community/agent/DATA_REFRESH.md` ("Delta procedure") describes
step by step: `scripts/community/wiki-delta.sh`. Read that file when something the script prints
needs a decision (new census reds, a page that folds nowhere, a stale wiki-derived file); this is
the checklist.

Every run reads the wiki, so it runs on the owner's word only (RULES.md rule 15). "Do a delta",
"refresh the wiki data", "update the data" and a release request are that word; a development
check never is. Every request lands in `docs/community/wiki-usage/ledger.jsonl` and is committed
with the data.

## Run it

From the MAIN clone (not a worktree), on a clean `main_community`, Git Bash:

```
bash scripts/community/wiki-delta.sh            # compare, dry run, delta, diff, commit, gate, merge, clean up
bash scripts/community/wiki-delta.sh --dry-run  # how much changed, nothing written (2 wiki requests)
bash scripts/community/wiki-delta.sh --push     # also push main_community to origin at the end
bash scripts/community/wiki-delta.sh --no-merge # stop after the data commit; branch and junctions kept
bash scripts/community/wiki-delta.sh --all-pages            # read every article no cache holds (rare; costs ~60 requests)
bash scripts/community/wiki-delta.sh --extra="Title|Title"  # hand-named pages
```

It takes 2 to 10 minutes: a day's delta is a handful of requests at one a second, the unit gate
is most of the time. The dev app can stay up. Run it in the foreground with a long timeout (or in
the background and wait for the task), never two at once: the item and mob caches are shared.

What it does, in order: `eoz-compare.mts` (GitHub, no wiki); `scrape-delta.mts --dry-run`;
worktree `delta-<date>` off `main_community` with the gitignored caches junctioned in
(`node_modules`, `cache/items`, `cache/mobs`, `cache/rendered`, `cache/eoz`); the dry run's ledger
line carried into the branch and the main clone's tree cleared; `scrape-delta.mts
--titles-from-compare` (reads the changed pages and the pages the compare found never listed, then
every follow-up: redirects, respawns, factions, races, page era, posky, bosses, images, drop
groups, the page index); `data-diff.mts` and `validate-data.mts`; one commit on the branch with
the page counts, the wiki request counts and the data-diff summary; `eoz-compare.mts --release`;
`known-reds.sh` on the branch; `git merge --no-ff` from the main tree; junctions deleted by
handle, worktree and branch removed.

## Read the output

- **Dry run:** `N pages changed`, then the pages per file (items, mobs, spells, quests, no DB yet).
  Tell the owner the count before a big run (hundreds of pages is a holiday's worth; the normal
  day is under ten).
- **`Extra titles`** at the end of the delta: a page the compare named that has no item or mob
  template is kept as a page, not folded (standing since 2026-10-29: Drake lava powder,
  Exaltations). It is fixed on the wiki or left; it never fails the release compare.
- **`Not refreshed by the delta`:** a committed wiki-derived file the run left stale, with the
  command that refreshes it. Run that command in the branch (use `--no-merge` first if you expect
  one) and commit it with the data.
- **data-diff:** record counts per file and the changed fields with an example. Cite it to the owner
  in one line; the script already puts it in the commit.
- **The gate goes red:** new wiki content turns the census tests red (DATA_REFRESH.md, "Expect new
  reds, and clear them"). The script keeps the branch and its junctions and stops before merging.
  Clear the reds there (tokens into the hand tables, floors moved in the data branch, a wiki typo
  reported to the owner with page, text and replacement), commit, run `known-reds.sh` there again,
  merge from the main clone, then delete the junctions by handle (`(Get-Item <path>).Delete()`),
  `git worktree remove --force`, `git branch -d`.
- **`compare --release` says something is behind:** the wiki moved between the compare and the
  delta. Run the script again; the second run is seconds.

## After

- Tell the owner: pages changed, what changed (data-diff), the request count, and the merged
  commit. Push with the next work or with `--push`.
- A release follows the delta directly (community-release skill, step 0.2): the compare, the delta
  and `--release` are exactly this script.
- Before 2026-11-08 the steps were run by hand every time; the commits `Delta scrape <date>` on
  `main_community` show the shape of the data commit the script writes.

## When the script cannot run

- `main clone is not clean`: commit or revert first; a dry run's ledger line from an earlier
  `--dry-run` counts (carry it into the branch by hand or `git checkout -- ledger.jsonl`).
- `the item and mob caches are missing`: this clone has no `scripts/sources/cache/{items,mobs}`
  (gitignored, DATA_REFRESH.md "Where the caches are"). The run tree needs them, or the text of
  the read pages is lost.
- A delta refused for age (over 90 days since the stamp) means a full scrape, owner's decision
  (DATA_REFRESH.md, "When").
- Anything else: fall back to the hand procedure in DATA_REFRESH.md, which the script follows line
  for line.
