# The fork's branch model

This fork (`kaltinril/everquest-companion`, git remote `origin`) tracks the creator's repo
(`jmoyers/everquest-companion`, git remote `upstream`). The creator is on hiatus and is not
merging pull requests. This directory holds the rules and the recipe that let the fork keep
moving without losing the ability to hand everything back when he returns.

Read [RULES.md](RULES.md) before touching any branch. [BRANCHES.md](BRANCHES.md) is the ordered
list of branches that make up `main_community`. [ADOPTIONS.md](ADOPTIONS.md) records every
third-party pull request that was vetted, adopted or deferred. [ISSUES.md](ISSUES.md) records
every upstream issue that was looked at and what became of it.

## Why

Three things have to stay true at once:

1. **`main` stays the creator's.** It mirrors `upstream/main` and is never committed to, so his
   history is our history and a sync is always a fast-forward.
2. **Every change of ours stays a separate branch off `main`.** Each one is a pull request he can
   review and merge on its own when he is back. A branch never closes until he closes it from his
   side, and that close is warranted.
3. **We still get one build with everything in it.** Our branches, the community's fixes to his
   repo that we have vetted, and the local test-build neutering, all merged together.

`main_community` is the third thing. It is `main` plus every branch listed in
[BRANCHES.md](BRANCHES.md), merged in that order. It carries nothing of its own. It can be deleted
and rebuilt from the recipe at any time, and the rebuild script exists to prove that.

## The branches

| Branch | Base | Lifetime | Purpose |
|---|---|---|---|
| `main` | `origin/main` = `upstream/main` | forever | The creator's main. Never committed to. Pushed to `origin` only, never to `upstream`. |
| `main_community_rules` | `main` | never closes, never a PR | This directory, the rebuild script, and the root `CLAUDE.md` hook. The recipe lives here. |
| feature branches | `main` | until the creator merges them | Our work, one branch per feature, each an open or future upstream PR. Listed in BRANCHES.md. |
| `community/pr-N-slug` | the upstream PR's own base | until upstream merges the PR | Our copy of an adopted third-party PR. The recipe depends on these, never on `upstream/pr/N` refs, which vanish when a PR closes and move when a contributor force-pushes. |
| `local-data-refresh` | `main` | never closes, never a PR | The locally re-scraped item and mob corpus. The official refresh is the creator's to run, so this stays off the PRs. |
| `test-neutering` | `main` | never closes, never a PR | The TEST build: its own appId and userData, telemetry and feedback dark, updater guarded, the UNRELEASED gate forced open, and the `0.1.0-test.N` version with each build's tester notes. Always the last merge, so it wins. |
| `main_community` | rebuilt from the recipe | disposable | What the dev app runs and test builds are cut from. Nothing lands here directly. |

## How a change flows

```
upstream/main ──fast-forward──▶ main ──branch──▶ feature branch ──merge──▶ main_community
                                                        │
                                                        └──push origin──▶ PR to upstream (when he is back)

upstream PR #N ──vet──▶ community/pr-N-slug ──merge──▶ main_community
                              │
                              └── row in ADOPTIONS.md, line in BRANCHES.md
```

- A fix goes on the branch that owns the code, in that branch's worktree, then merges into
  `main_community` from the main tree. A fix committed on `main_community` is lost on the next
  rebuild and never reaches a PR.
- A new branch of ours is not part of the build until it has a line in the recipe. The line
  says where in the order it merges. See rule 9 in RULES.md.
- A third-party PR is not part of the build until it has been vetted per RULES.md, copied to a
  `community/` branch, given a row in ADOPTIONS.md and a line in the recipe.

## Procedures

**Sync main.** `git fetch upstream && git checkout main && git merge --ff-only upstream/main && git push origin main`.
Then merge `main` into `main_community`. Feature branches do not take `main` unless they conflict
with it or his change alters the purpose of the feature (stale-branch policy, BRANCHES.md).

**See every upstream PR locally.** The `upstream` remote carries a second fetch refspec,
`+refs/pull/*/head:refs/remotes/upstream/pr/*`, so `git fetch upstream` refreshes a read-only
`upstream/pr/N` ref per open PR. `gh pr list --repo jmoyers/everquest-companion` lists them.

**Adopt a third-party PR.** Vet it (RULES.md, rules 2 to 5). `git branch community/pr-N-slug upstream/pr/N`.
Run the gate on that branch alone. Add the ADOPTIONS.md row and the recipe line. Merge into
`main_community`. Run the gate again. Push the `community/` branch to `origin`.

**Add a branch of ours.** Branch from `main`, in its own worktree. Add its recipe line, in order,
with a one-line purpose in the BRANCHES.md table. Merge into `main_community`.

**Rebuild main_community.** `scripts/community/rebuild-main-community.sh` reads the recipe and
merges each branch in order into a fresh branch off `main`. Conflict resolutions are recorded by
`git rerere` (enabled in this clone), so a resolution made once replays on the next rebuild. The
script ends by printing a tree diff against the previous `main_community`, which should be empty.

**Cut a test build.** Bump the version and write the tester notes as a commit on `test-neutering`,
merge it into `main_community`, then `npm run dist`. The notes stay on a branch that survives a
rebuild. Read the previous build's notes first; they list what the testers caught. The installer
is `release/<version>/everquest-companion-test-Setup-<version>.exe` in this clone, next to the
earlier builds (RULES.md, rule 17). `npm run dist` runs in this clone, never in a worktree (rule
16): a junctioned `node_modules` ships an asar missing dependencies. Before handing a build out,
`npx @electron/asar list release/<version>/win-unpacked/resources/app.asar` must list
`node_modulesnf`; a build without it fails at launch.

**When the creator is back.** Each feature branch is already a PR or ready to be one. As he merges
them, `main` gains them, the merged branch's recipe line is removed, and `main_community` is
rebuilt. A `community/` branch is dropped the same way when its upstream PR merges. A branch is
never closed before that (RULES.md, rule 10).
