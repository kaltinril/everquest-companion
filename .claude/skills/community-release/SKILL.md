---
name: community-release
description: Cut and publish a community build of EQ Legends Companion to the fork's GitHub Releases page (kaltinril/everquest-companion). Use when the owner asks to release, publish, ship, cut a build, make a new version, or tag a community build.
---

# Release a community build

The release is built and published by GitHub Actions (`.github/workflows/community-release.yml`)
when a `community-<version>` tag is pushed on a `main_community` commit. Nothing is built on the
owner's machine. `docs/community/RELEASING.md` is the full procedure and the reasons; this is the
checklist. The script publishes the release NOT marked Latest; every install from test.20 on
updates itself from the release marked Latest, so promoting it (step 4) reaches players within
hours and has no undo. Only publish or promote what the owner has asked for.

Players see **EQ Legends Companion CE (Community Edition)**, versions are plain `0.1.N` since 0.1.55,
and the installer is `everquest-companion-ce-Setup-<version>.exe`. The appId, exe name, package
name, folders and `test.yml` keep the word "test" for good (RELEASING.md, "The name changed; the
ids did not"). Never tidy them.

## 0. Two gates before anything (owner, 2026-10-22, after test.31 went out without either)

1. **Only on the owner's explicit word to make a GITHUB RELEASE.** "build it", "run it", "load it"
   or a yes to a question about something else is not it. Always say "GitHub release" for this
   (public, every tester's install updates) and "local build" for anything that stays on the
   owner's PC (owner, 2026-10-22: "be specific about releases going forward ... say github
   release"). Ask in one line: "Publish GitHub release 0.1.N now (public, staged until you
   promote it)?" and wait. Promoting it is a second, separate word from the owner (step 4).
2. **The GitHub pack compare and a delta scrape first, always, both** (owner, 2026-10-25).
   Since 2026-11-08: `bash scripts/community/wiki-delta.sh` from the main clone does all of this
   step, merged (the `wiki-delta` skill). By hand it is
   `npx tsx scripts/eoz-compare.mts`, then the delta with `--titles-from-compare` (it also reads the
   pages the compare found our scrape never listed; the first run after 2026-10-29 adds `--all-pages`;
   `docs/community/agent/DATA_REFRESH.md`; the
   data committed on a work branch off `main_community`, gated and merged), then `npx tsx scripts/eoz-compare.mts
   --release` (exits 1 while anything is behind). No pack age stands in for the delta. A release ships the wiki as it stands today,
   owner's and testers' edits included.
3. **The two tradeskill guides, after the delta has merged** (owner, 2026-11-20: "as part of the
   delta refresh we do from the wiki every time we release can we do a fresh pull from the google
   sheets"). `npx tsx scripts/community/guides-pull.mts` in a work tree off `main_community`
   (`docs/community/agent/DATA_REFRESH.md`, "The two tradeskill guides"; the `wiki-delta` skill's
   "After" has the three outcomes). A refused pull does not stop the release: it ships the last
   good copy, and the owner is told what was refused.

## 1. Before the tag

1. **Read the previous build's notes** (`git log -E --grep="^(Community|Test) build " -2 main_community`):
   they are the release notes players read and the list of what testers caught last time.
2. **No finished work is left unmerged.** `git worktree list`, and the unmerged branches that are
   not retired (a retired one carries `RETIRED.md`; RULES.md rule 9):
   `for b in $(git branch --no-merged main_community --format='%(refname:short)'); do git cat-file -e "$b:RETIRED.md" 2>/dev/null || echo "$b"; done`.
   A finished, gated work branch that is not in yet is merged first, or the owner is told why not.
3. **Bump and write the notes on a work branch** off `main_community`, in a temporary worktree
   (`git worktree add -b release-0.1.N .claude/worktrees/release-0.1.N main_community`):
   `package.json` version to the next plain `0.1.N` (0.1.55 follows 0.1.0-test.54), and one commit
   titled with the NEW version, `Community build 0.1.<N>: <one line>` (the script looks for the
   `package.json` version), whose body is the player-facing notes under a `NEW IN 0.1.<N>` label:
   ONLY what changed since the previous version, then the known issues; short. Never repeat the
   cumulative "what this build adds" list: test.20, the first release, carries it, and the script
   links to it from every later release (it stops if the heading reappears). The script takes the
   NEWEST notes commit for the version, so a correction is a new empty commit (`--allow-empty`),
   never an amend of a pushed one.
   Then, on the same branch, `node scripts/community/community-release-notes.mjs` and commit
   `src/shared/communityReleaseNotes.ts` as `What's new: 0.1.<N>` (the in-app list is generated
   from the notes commit; `tests/communityReleaseNotes.test.mts` fails without it). A correction
   to the notes means regenerating again.
4. **Merge the work branch into `main_community`** from the main tree (`git merge --no-ff --no-edit`),
   then remove the worktree and the branch (RULES.md rule 18).
5. **Gate locally, the full suite** (RULES.md rule 11): `npm run typecheck`, `npm run lint`,
   `bash scripts/community/known-reds.sh` (Node 24; the list is empty since 2026-11-27, so the unit
   suite must be green). The workflow runs the same, but a red found here costs minutes, not a CI
   run. Also, locally only: `cargo test --workspace` in `engine/` when an engine input changed since
   the previous release (`bash scripts/community/engine-changed.sh community-<previous>` on
   `main_community` prints yes), and `npm run test:e2e` (about 10 minutes; the known e2e
   red is in BRANCHES.md). Restore `tsconfig.*.tsbuildinfo` afterwards.
6. **Push** `main_community` to `origin` (never `upstream`).

## 2. The tag

```
v=$(node -p "require('./package.json').version")
git tag "community-$v" main_community
git push origin "community-$v"
```

The tag must be exactly `community-<package.json version>`; the workflow stops otherwise. Never a
`v*` tag: that starts the creator's release job in `build.yml`.

## 3. Watch it

```
gh run list --repo kaltinril/everquest-companion --workflow community-release.yml --limit 1
gh run watch <id> --repo kaltinril/everquest-companion --exit-status
gh release view "community-$v" --repo kaltinril/everquest-companion
```

About 25 minutes cold (the engine's release build dominates; the cargo cache shortens later runs).
The release must carry the installer, `test.yml`, the installer's `.blockmap`, `SHA256SUMS.txt`, and
the previous release's `.blockmap` under its `-ce-` name; it must NOT be marked Latest yet:
`gh release view --repo kaltinril/everquest-companion` with no tag must still print the previous tag.

## 4. Try it, then promote on the owner's word

On a test install (never the owner's own), point `resources\app-update.yml`'s `url` at
`https://github.com/kaltinril/everquest-companion/releases/download/community-$v/` and let the real
updater take it. Tell the owner the result and ask in one line: "Promote GitHub release 0.1.N to
Latest now (every install updates, no way back)?" A release request alone is not this word. On a
yes:

```
gh release edit "community-$v" --repo kaltinril/everquest-companion --latest
```

## 5. If it fails

- **Before "Publish the release":** nothing is public. Fix on a work branch, merge, push, then
  move the tag only if it was never published: `git push origin :refs/tags/community-$v`,
  `git tag -d community-$v`, tag again, push again.
- **After publishing, before promoting:** no install has it. Leave it unpromoted and fix it in the
  next version.
- **After promoting:** a mistake is fixed by the next version (`0.1.N+1`), never by replacing an
  asset someone may have downloaded. Deleting a release is the owner's call.
- **`known-reds.sh` stops:** a new failing test is a real regression; a known red that now passes
  means `scripts/community/known-reds.txt` should shrink (a work branch off `main_community`).

## 6. After

Tell the owner the release URL (`https://github.com/kaltinril/everquest-companion/releases/latest`
once promoted) and the run URL. Update the release memory.

**Clean up the build and test data** (owner, 2026-11-27: "delete only on a release ... that's when
you clean up the test data"). Once the release is out, in the main clone:

1. `cd engine && nice -n 10 cargo clean --profile dev`: the debug `cargo test` builds (56 GB on
   2026-11-27). The release `engined.exe` the dev app runs stays; the next `cargo test` rebuilds
   debug in about a minute from the shared build cache.
2. Delete `tests/e2e/artifacts/*` older than the release's own gate run.
3. List `.claude/worktrees/*` folders that `git worktree list` does not register, and any
   registered worktree whose branch is merged into `main_community`, with their sizes. Delete only
   what this session made, or what the owner confirms; another session may still be using a
   worktree. Unlink a `node_modules` junction before removing its worktree (WORKFLOW.md).
4. Tell the owner how much space was freed.

## Fallback: publish from the owner's machine

`npm run dist` in the main clone (never a junctioned worktree), then
`bash scripts/community/publish-release.sh` (dry run) and `--publish`, then step 4. Same checks,
same assets; use it only when Actions is unavailable.
