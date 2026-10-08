# Releasing a community build

How a TEST build goes from `release/<version>/` on the owner's machine to a download link anyone
can use, on the fork's own Releases page:
<https://github.com/kaltinril/everquest-companion/releases>. This lives on the never-closing
`community_release` branch, with the script it describes (`scripts/community/publish-release.sh`).

## What a community release is

The `0.1.0-test.N` installer that `test-neutering` produces, attached to a GitHub Release on the
fork. Nothing about the build changes for the release; the TEST identity is what makes it safe to
hand to strangers:

- **It installs beside the official app, not over it.** Its own appId, product name, install
  folder and settings (`test-neutering`).
- **It never updates itself.** There is no update feed in the TEST `electron-builder.yml` and the
  updater is guarded off, so it cannot be replaced by the official app either. A player gets a new
  version by downloading it from the Releases page; settings carry over.
- **Telemetry and feedback are dark**, so nothing it does reaches the creator's servers.
- **It is not code-signed.** Windows SmartScreen says "Windows protected your PC" on first run;
  the player clicks **More info**, then **Run anyway**. The release notes say so.

The app's licence (FSL-1.1-MIT) permits this: redistribution for any purpose other than a
competing commercial product.

## Why the tag is `community-<version>`

A GitHub Release always creates a tag. `.github/workflows/build.yml` runs its `release` job on
any `v*` tag: it builds the OFFICIAL app identity, signs it if signing secrets exist, and publishes
with the creator's `publish` block. A `v0.1.0-test.N` tag on the fork would at best fail and at
worst start an official-looking build. `community-0.1.0-test.N` matches no workflow trigger, so
creating the release runs nothing.

## Procedure

1. **Cut the build** as for any tester build: read the previous `Test build` commit's notes, check
   every recipe branch is level with `main_community`, bump `package.json` and write the notes as
   a commit on `test-neutering`, merge it, run the gate, `npm run dist` in this clone (never a
   junctioned worktree, RULES.md rule 16), check the asar. The notes in that commit become the
   release notes, so they are written for players.
2. **The owner tests the installer.** Nothing is published before that.
3. **Push** `main_community`, `test-neutering` and any branch the build touched to `origin`. The
   release points at a commit on `origin/main_community`, so the source of every download is
   public and matches it.
4. **Dry run:** `scripts/community/publish-release.sh`. It reads the version from `package.json`,
   checks the installer exists and its asar is whole (about 29,000 `node_modules` entries and
   `node_modules/conf`), finds the `Test build <version>:` commit, checks the target commit is on
   `origin/main_community` and contains it, checks the tag is free, writes
   `release/<version>/SHA256SUMS.txt`, and prints the release notes it would post.
5. **Publish, with the owner's yes:** the same command with `--publish`. A release is public the
   moment it exists and may be mirrored or indexed, so this step is always the owner's word, never
   an agent's assumption.
6. **Share** <https://github.com/kaltinril/everquest-companion/releases/latest>. Each new release
   is marked Latest, so that link always gives the newest build.

A release with a mistake is corrected by publishing the next test.N, not by replacing an asset
someone may already have downloaded. Deleting a release is the owner's call.

## Not done, and why

- **Code signing: shelved (owner, 2026-10-07)**, because every publicly trusted certificate costs
  money and this is a free project. The build already supports Azure Artifact Signing
  (US$9.99/month, individuals in the US and Canada): `scripts/azure-sign.cjs` signs whenever the
  six `AZURE_*` variables are set, and `win.signtoolOptions.publisherName` must then be the
  certificate's name exactly. Free signing services (SignPath Foundation) require an OSI licence,
  which FSL is not. A new certificate still meets SmartScreen warnings until it builds reputation.
- **Auto-update: off.** Turning it on for the fork does not need signing: a `publish` block
  pointing at `kaltinril/everquest-companion`, a release that carries `latest.yml`, and the
  `TEST_BUILD` guard in `src/main/channel.ts` lifted for that channel. Unsigned updates are only
  as trustworthy as the fork's GitHub account, which is the same trust a manual download has.
- **The fork's front page** shows the creator's README, because the default branch is `main`
  and `main` is never committed to. Share the Releases link directly.
