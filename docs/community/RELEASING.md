# Releasing a community build

How a build of EQ Legends Companion CE (Community Edition) goes from `main_community` to a download
link anyone can use, on the fork's own Releases page:
<https://github.com/kaltinril/everquest-companion/releases>. The script it describes is
`scripts/community/publish-release.sh`. The build, the version bump, the notes and the release all
come from `main_community`, the trunk (RULES.md, rule 1); changes to this procedure land there
through a work branch like any other.

## What a community release is

The `everquest-companion-ce-Setup-<version>.exe` installer that `main_community` produces, attached
to a GitHub Release on the fork. Versions are plain `0.1.N` since 0.1.55, which continues the old
`0.1.0-test.N` count and sorts above all of it (the core number is higher). Nothing about the build
changes for the release; its identity, which the retired `test-neutering` branch brought in, is
what makes it safe to hand to strangers:

- **It installs beside the original app, not over it.** Its own appId, product name, install
  folder and settings.
- **It updates itself from this fork's Releases page, and only from it** (since test.20).
  `electron-builder.yml` points the app's updater at a generic feed,
  `https://github.com/kaltinril/everquest-companion/releases/latest/download/`, so an install reads
  `test.yml` from the release marked Latest here, downloads the newer installer quietly and applies
  it when the app closes. Nothing points at the original repo, so the original app never replaces
  this one and a release here never reaches an original install. The updates are unsigned, which
  is the same trust a manual download from this page has: the fork's GitHub account and HTTPS.
- **Telemetry and feedback are off.** Both addresses are compiled in empty, so nothing is sent to
  the original author's servers or anywhere else.
- **It is not code-signed.** Windows SmartScreen says "Windows protected your PC" on first run;
  the player clicks **More info**, then **Run anyway**. The release notes say so.

The app's licence (FSL-1.1-MIT) permits this: redistribution for any purpose other than a
competing commercial product.

## The name changed; the ids did not

Players see **EQ Legends Companion CE**: the title bar, tray, Start menu, Apps list and installer
file. These keep the word "test" for good, because every install in players' hands is matched on
them (the reasons are in `plans/2026-11-19-own-project.md`, Part 2):

- `appId` `com.kaltinril.everquest-companion.test`, and no `nsis.guid`
- `executableName` `EQ Legends Companion TEST`, so the exe and uninstaller keep their file names
- the package name `everquest-companion-test`: the install folder and the updater cache
- the settings folder `%APPDATA%\everquest-companion-test` (`PROD_DIR_NAME`)
- `channel: test`, so the update file is `test.yml` on every release

`tests/communityIdentity.test.mts` pins them. `publish-release.sh` runs
`scripts/community/check-release-identity.mts` on the build it is about to publish and stops if
`test.yml`, the exe name or the updater settings inside `win-unpacked` are wrong.

## Why the tag is `community-<version>`

A GitHub Release always creates a tag. `.github/workflows/build.yml` runs its `release` job on
any `v*` tag. That job is the original repo's release path: it expects the original app's file
names (`latest.yml`, `everquest-companion-Setup-<version>.exe`), which this repo's
`electron-builder.yml` never produces, so a `v0.1.N` tag here would publish nothing: the
job fails, at the latest when it looks for those files after the build. `community-0.1.N`
matches only `community-release.yml`, the workflow that builds this project's releases (Procedure,
below).

## Procedure

**Two gates come first** (owner, 2026-10-22: "i never told you to release something, we should
ALWAYS do a delta scrape before a release"): a release is cut only on the owner's explicit word to
release, and only after a delta scrape has brought the data up to today's wiki. test.31 went out
without either. Say "GitHub release" for this and "local build" for anything that stays on the
owner's PC; ask "Publish GitHub release 0.1.N now?" and wait (owner: "be specific about releases
going forward ... say github release").

**The GitHub pack compare AND the delta, every release** (owner, 2026-10-25: "wiki github pack
from eoz and delta scrape should always run before a release"; "should run when i ask"): first
`npx tsx scripts/eoz-compare.mts`, then the delta with `--titles-from-compare` (DATA_REFRESH.md;
it also reads the wiki pages the compare found our scrape never listed; the first run after
2026-10-29 adds `--all-pages`), both on every release, then
the compare once more over the refreshed data with `--release`, which exits 1 while anything is
behind. No age of the pack
stands in for the delta (the 2026-10-23 five-hour rule is withdrawn). The same pair runs whenever
the owner asks for a delta or a data refresh, with no condition attached.

**The two tradeskill guides, every release, after the delta** (owner, 2026-11-20: "as part of the
delta refresh we do from the wiki every time we release can we do a fresh pull from the google
sheets"): `npx tsx scripts/community/guides-pull.mts` in a work tree off `main_community`, once the
delta has merged (DATA_REFRESH.md, "The two tradeskill guides").

- "Byte for byte the last good copy": nothing to commit.
- "Written": read the diff, commit `scripts/sources/cache/guides` and
  `src/main/data/tradeskillGuides.json`, merge before the version bump.
- "REFUSED" (exit 1): nothing was written; the release ships the last good copy. A `[change]`
  refusal (a tab gone or new, over 10% of a tab's rows lost, over 30% changed) is taken with
  `--accept` once the owner has read the diff. A `[response]`, `[content]` or `[layout]` refusal is
  never taken by a flag: report it to the owner.

Since 2026-10-08 a release is built and published by GitHub Actions
(`.github/workflows/community-release.yml`) when a `community-<version>` tag is pushed, as the
creator's releases are by `build.yml` on a `v*` tag. Nothing is built on the owner's machine. The
step-by-step checklist is the `community-release` skill (`.claude/skills/community-release/SKILL.md`).

**Pushing branches never releases anything** (owner, 2026-10-08: branches go up between
releases without starting a version). Only the `community-*` tag starts `community-release.yml`;
`build.yml` builds on a push to `main` (a CI check that publishes nothing) and releases only on a
`v*` tag, which the fork never pushes. Pushing `main_community` starts no workflow at all, so it is
pushed whenever the work is done and tested, and a release is only ever the deliberate tag in
step 4.

1. **Prepare** as for any tester build: read the previous build's notes commit (`Community build
   0.1.N:`, or `Test build 0.1.0-test.N:` before 0.1.55), check no finished work branch is left
   unmerged, bump `package.json` to the next plain `0.1.N` and write the notes as a commit titled
   `Community build 0.1.N: <one line>` on a work branch off `main_community`, with a `NEW IN 0.1.N`
   section (they become the release notes, so they are written for players,
   and hold only what changed since the previous version plus the known issues: the cumulative
   list, the release body's `WHAT THIS BUILD ADDS` section, lives once, on the test.20 release, and
   every later release links to it). Then regenerate the in-app What's new list on the same branch,
   `node scripts/community/community-release-notes.mjs`, and commit
   `src/shared/communityReleaseNotes.ts` (the unit suite fails without it). Merge the branch into
   `main_community`, and run the gate (`bash scripts/community/known-reds.sh` is the unit suite with only
   the known reds allowed).
2. **The owner says to release.** A release is public the moment it exists and may be mirrored or
   indexed, so this is always the owner's word. Once promoted (step 7) it reaches every install from
   test.20 on within hours.
3. **Push** `main_community` to `origin`.
4. **Tag and push the tag:** `git tag community-<version> main_community` and
   `git push origin community-<version>`.
5. **The workflow** checks the tag names the `package.json` version; runs typecheck, lint and the
   unit suite (only the known reds in `scripts/community/known-reds.txt` may fail, by name); builds
   the engine and the unsigned installer on a clean Windows runner; then runs
   `scripts/community/publish-release.sh --publish`, which checks the installer, its `test.yml` and
   `.blockmap`, the identity above, the asar (every runtime dependency `package.json` declares, and
   `node_modules/conf`), that the tagged commit is on `origin/main_community` and contains the
   version's notes commit, and that the tag has no release yet, then creates the release, **not
   marked Latest**, with the installer, `test.yml`, the blockmap, the previous release's blockmap
   (under the `-ce-` name the updater asks for, copied once from the `-test-` one for the first CE
   release) and `SHA256SUMS.txt`.
6. **Try it before anyone gets it.** The feed still serves the previous release:
   `gh release view --repo kaltinril/everquest-companion` with no tag must print the previous tag.
   On a test install (never the owner's own), point `resources\app-update.yml`'s `url` at
   `https://github.com/kaltinril/everquest-companion/releases/download/community-<version>/` and
   let the real updater take it.
7. **Promote, on the owner's word:**
   `gh release edit community-<version> --repo kaltinril/everquest-companion --latest`. This is the
   step that reaches players, within hours, and it has no undo: `allowDowngrade` is off, so from
   here a fault is fixed by the next version.
8. **Share** <https://github.com/kaltinril/everquest-companion/releases/latest>, which follows the
   release marked Latest.

**Fallback, when Actions is unavailable:** `npm run dist` in this clone (never a junctioned
worktree, RULES.md rule 16), then `scripts/community/publish-release.sh` as a dry run and again
with `--publish`, then steps 6 and 7. Same checks, same assets.

A release with a mistake is corrected by publishing the next 0.1.N, not by replacing an asset
someone may already have downloaded. A staged release nobody was offered can simply be left
unpromoted. Deleting a release is the owner's call.

## Not done, and why

- **Code signing: shelved (owner, 2026-10-07)**, because every publicly trusted certificate costs
  money and this is a free project. A free route was suggested since: publish an MSIX on the
  Microsoft Store, which Microsoft signs; the plan is [MS-STORE.md](MS-STORE.md). The build already supports Azure Artifact Signing
  (US$9.99/month, individuals in the US and Canada): `scripts/azure-sign.cjs` signs whenever the
  six `AZURE_*` variables are set, and `win.signtoolOptions.publisherName` must then be the
  certificate's name exactly. Free signing services (SignPath Foundation) require an OSI licence,
  which FSL is not. A new certificate still meets SmartScreen warnings until it builds reputation.
- **Auto-update: on since test.20**, without signing. What it took: the generic `publish` block
  above, `publisherName` dropped from the TEST build (with it every unsigned update is rejected),
  the `TEST_BUILD` early-out in `src/main/updater.ts` removed, and the publish script uploading
  `test.yml` and the installer's `.blockmap` with every release, and the test package renamed
  `everquest-companion-test` so it has its own install folder and updater cache (a one-click
  install is named after the package; before test.20 both apps shared one folder). A release reaches
  installs only once it is marked Latest (step 7), and an install older than test.20 never updates: those players
  download once by hand. Each release also carries the previous release's `.blockmap`, so an
  install one version behind downloads only what changed; one further behind gets the whole
  installer.
- **Moving over from older installs (since test.20)**, all checked on the owner's machine:
  - *An older TEST build* (test.19 and before) lived in `%LOCALAPPDATA%\Programs\everquest-companion`,
    the original app's folder. test.20's installer (`build/installer.nsh`, `eqLeaveSharedFolder`) moves it to
    `everquest-companion-test`; settings are untouched.
  - *Both apps installed*: the original app's files in the shared folder are left alone; only the
    TEST exes are removed. The TEST settings are kept and win, since they already exist. An
    original app that an earlier TEST install had overwritten needs one reinstall from the
    original repo's Releases page.
  - *Only the original app*: on first launch this build copies the original app's settings,
    learned messages, resist history, item cache, installed sound packs, the player's own imported
    sounds (`my-sounds`) and UI choices (`userDataSeed.ts` `SEED_ENTRIES`); the original app is
    never changed. An install seeded by an earlier build gets the imported sounds on its next
    launch, once.
- **The front page** is the root `README.md` on `main_community`, the default branch since
  2026-10-09. Until 2026-11-19 it was `.github/README.md`, shown by GitHub in place of the original
  app's README at the root; that copy is removed and the root page is the project's own, so there
  is one front page.
