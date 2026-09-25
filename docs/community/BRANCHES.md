# Branches and the recipe

The recipe is the fenced block below. `scripts/community/rebuild-main-community.sh` reads it:
one branch per line, merged top to bottom into a fresh branch off `main`. Lines starting with
`#` are comments. Order is deliberate (RULES.md, rule 9): a base before what builds on it, tabs
before the branch that groups them, `test-neutering` last so the TEST identity wins.

```recipe
# ours, never closes
main_community_rules
local-data-refresh
# ours, feature branches (open or future upstream PRs)
scrape-delta-tool
gear-tab-improvements
gear-progression-plan
map-improvements
fix-ds-ever-struck
fix-roster-overrides-ever-struck
fix-self-dot-ticks
fix-reward-chest-loot
catch_all
character-slot-sockets
exaltation-clarity
spell-upgrades
faction-tab
sidebar-groups
# third-party, vetted (ADOPTIONS.md)
community/pr-16-setup-node
community/pr-59-actions-cache
community/pr-65-deploy-pages
community/pr-70-npm-minor-patch
community/pr-23-bundled-images-win32
community/pr-63-bonus-exp
community/pr-68-week-clears
community/pr-47-hide-raid-targets
community/pr-67-self-meter-name
# ours, never closes, always last
test-neutering
```

## What each branch is for

The fork is `origin` (`kaltinril/everquest-companion`). Nothing is ever pushed to `upstream`
(`jmoyers/everquest-companion`); PRs are opened from the fork's branches. Counts are against
`main` and go stale; `git rev-list --left-right --count main...<branch>` re-reads them.

Worktree paths are relative to this clone. Every branch worktree lives under `.claude/worktrees/`,
named after its branch (owner, 2026-09-24; RULES.md, rule 16). The folder is gitignored and the
creator's lint config already skips it.

### Ours, never closing, never a PR

| Branch | Worktree | What it does |
|---|---|---|
| `main_community_rules` | `.claude/worktrees/main_community_rules` | `docs/community/`, the rebuild script, the root `CLAUDE.md` hook, the `docs/branches.md` pointer. First in the recipe so the rules are on every build. |
| `local-data-refresh` | *(none)* | The locally re-scraped corpus: `items.json`, `mobs.json`, `dataWeight.generated.json` (2026-08-19 and 2026-09-04 scrapes). Second, so every feature branch's tests run against the data the build ships. |
| `test-neutering` | *(none)* | The TEST build identity (own appId, own userData, telemetry and feedback dark, updater guarded, no signing), the UNRELEASED gate forced open, and the `0.1.0-test.N` version bumps with tester notes. Always last. |

### Ours, in front of the creator (open PRs)

| Branch | PR | Worktree | What it does |
|---|---|---|---|
| `gear-tab-improvements` | [#31](https://github.com/jmoyers/everquest-companion/pull/31) | `.claude/worktrees/gear-tab-improvements` | Gear tab: drop sources, worth-scores, numeric search, a wish column, resizable columns, the +0..+10 upgrade slider. The tab the other gear branches build on; merges before them. |
| `gear-progression-plan` | [#36](https://github.com/jmoyers/everquest-companion/pull/36) | `.claude/worktrees/gear-progression-plan` | Recommended tab: a level route with exp zones and role-weighted gear targets. Carries the planner scoring recalibration (survivability dial, chunk-stat law, quest lane, ownership and equip advisory). |
| `map-improvements` | [#35](https://github.com/jmoyers/everquest-companion/pull/35) | `.claude/worktrees/map-improvements` | Maps: clickable zone links, mob pins, hover cards, wish-list highlights. Plus the travel work: the zone graph read off the client's map labels, the port table from the spell and item corpora, per-zone level bands, and the "where to level" panel. |
| `fix-ds-ever-struck` | [#61](https://github.com/jmoyers/everquest-companion/pull/61) | `.claude/worktrees/fix-ds-ever-struck` | A damage-shield tick is not a strike: `ds` lines no longer write `ever_struck`. The ally-pet crediting bug, fixed in the Rust engine. |
| `fix-roster-overrides-ever-struck` | not yet filed (second path of [#60](https://github.com/jmoyers/everquest-companion/issues/60)) | `.claude/worktrees/fix-roster-overrides-ever-struck` | A group member you struck is still a group member: `ally_caster_allowed` lets a name on the live roster through the `ever_struck` refusal. Three ripostes on a mob-charmed group-mate had silenced his pets for good. Proof in `tests/member_strike.rs`; the factoring register shrinks by two. |

### Ours, finished, no PR opened yet

| Branch | Worktree | What it does |
|---|---|---|
| `scrape-delta-tool` | `.claude/worktrees/scrape-delta-tool` | `scripts/scrape-delta.mts`: the wiki-DB top-up that reads MediaWiki `recentchanges` since `items.json`'s `scrapedAt` and re-fetches only changed pages, at the creator's 1 req/s etiquette. Running it is an owner decision, never automatic. |
| `fix-self-dot-ticks` | `.claude/worktrees/fix-self-dot-ticks` | Engine parser: `You have taken N damage from <spell> by <mob>.` is a DoT tick on the player. The DoT half gated and matched on `has taken` only, so 10,703 lines carrying 533,440 damage (about 6% of everything the owner's character took, 2026-08-12 to 2026-09-15) were `unknown`. Two lines of `combat.rs` and a test; the file does not grow. With the other engine fixes, independent of them. |
| `fix-reward-chest-loot` | `.claude/worktrees/fix-reward-chest-loot` | Engine parser: a Dungeon Crawl pays out of a `Reward Chest`, and the four auto-loot regexes all required the word `corpse`. ` corpse` becomes optional; a chest line carries `source: "Reward Chest"`, a corpse line captures what it always did. A second commit covers the dashed form, `--You have looted a Ivory from Reward Chest.--`, which was never `unknown` but parsed as an item called `Ivory from Reward Chest` with no source; there the chest is named in a group of its own, because making ` corpse` optional would turn `Letter from Bob` into a Letter looted from Bob. First seen 2026-09-09; all 67 chest lines in the owner's log (30 auto-loot, 37 dashed) now read `source: "Reward Chest"`. Touches the loot regexes only and merged clean beside `pr-63`'s experience regex in the same file. |
| `catch_all` | `.claude/worktrees/catch_all` | Never closes. Small fixes to the creator's own code that belong to no feature branch of ours are GROUPED here rather than each getting a branch (owner, 2026-09-21); one commit per fix, so any one can be lifted out for its own upstream PR later. A fix that touches what one of our feature branches is about goes on that branch instead. Holds so far: the Maps pack select showed the stored pack before the pack list had arrived (and after a pack was removed), so MUI warned about an out-of-range value on every render; it now says Auto whenever `packOrder` would fall back to auto. |
| `character-slot-sockets` | *(none)* | The socket board's foundation, the base `exaltation-clarity` sits on. Nothing new lands here. Merges before `exaltation-clarity`. |
| `exaltation-clarity` | `.claude/worktrees/exaltation-clarity` | The Exaltations and Character socket work: merged socket row, cleanup advisor, whole-board optimizer, owned tri-state, the proc rule, deity as R2's fourth condition. |
| `spell-upgrades` | `.claude/worktrees/spell-upgrades` | The whole Spells area: spellbook with icons and sortable columns, the Loadout tab, the mote tier slider, the buff stats panel, the EQEmu stacking port and its ground-truth corpus. |
| `faction-tab` | `.claude/worktrees/faction-tab` | `/outputfile faction` graduated to a third supported kind, the UNRELEASED Factions tab, and the race-unlock claims read out of the achievements dump. |
| `sidebar-groups` | `.claude/worktrees/sidebar-groups` | The nav drawer's tabs under three headings (Research, Stats/Data, Config) with Overview on top. Merges after every tab-adding branch, because it places each tab in a group at merge time. |

### Third-party, adopted

One branch per adopted upstream PR, named `community/pr-<number>-<slug>`, holding the PR's own
commits. The vetting record is the PR's row in [ADOPTIONS.md](ADOPTIONS.md).

| Branch | Upstream PR | What it does |
|---|---|---|
| `community/pr-16-setup-node` | [#16](https://github.com/jmoyers/everquest-companion/pull/16) | CI: `actions/setup-node` 4.4.0 to 7.0.0 in `build.yml` and `infra.yml`. The creator's hand-written `# v4 (v4.4.0)` comments are left stale by dependabot; the SHAs were checked against the tags. |
| `community/pr-59-actions-cache` | [#59](https://github.com/jmoyers/everquest-companion/pull/59) | CI: `actions/cache` 4.3.0 to 6.1.0 in `build.yml`. Same stale comment. |
| `community/pr-65-deploy-pages` | [#65](https://github.com/jmoyers/everquest-companion/pull/65) | CI: `actions/deploy-pages` 4.0.5 to 5.0.1 in `pages.yml`. Same stale comment. |
| `community/pr-70-npm-minor-patch` | [#70](https://github.com/jmoyers/everquest-companion/pull/70) | Twelve of dependabot's fourteen minor and patch bumps: electron 43.2 to 43.7, electron-builder, esbuild, tsx, playwright-core, pg, the AWS SDK clients. Two commits on top pin `typescript-eslint` back to 8.65 and `onnxruntime-node` back to 1.20.1; the ADOPTIONS.md row says why. |
| `community/pr-23-bundled-images-win32` | [#23](https://github.com/jmoyers/everquest-companion/pull/23) | Tests only: one `bundledImages` assertion uses `win32.isAbsolute` so the win32-shaped fixture reads the same on every host. |
| `community/pr-63-bonus-exp` | [#63](https://github.com/jmoyers/everquest-companion/pull/63) | Engine parser: `You gain experience (with a bonus)!` is an experience line. 1,528 such lines in the owner's log went unclaimed over the Sep 3 to 7 bonus weekend. |
| `community/pr-68-week-clears` | [#68](https://github.com/jmoyers/everquest-companion/pull/68) | Bosses, week view: a manual "base tier cleared" mark gated on a credited kill this week, plus the same parser widening as #63 (resolved to #63's spelling on merge). One commit on top drops the PR's plan document, which carried text addressed to AI agents (rule 6). After `pr-63`, before `pr-47`. |
| `community/pr-47-hide-raid-targets` | [#47](https://github.com/jmoyers/everquest-companion/pull/47) | Bosses: hide a target from the Raid Targets roster and the tally, peek at hidden ones from the toolbar. Four commits on top: the PR's own e2e spec passes `max-depth`, its unit test no longer imports a helper JOS-499 retired, and the hide button sits in the card's bottom-right corner instead of over the tier chip. Conflicts with `pr-68` in two files; merged after it, rerere holds the union. |
| `community/pr-67-self-meter-name` | [#67](https://github.com/jmoyers/everquest-companion/pull/67) | Combat: a preference, off by default, that shows the self row of the damage meters as `<Character> (You)` on the Combat tab, the Overview Damage card, the floating overlay and "Copy this view". The PR's twelve commits, nothing on top. Independent of the Bosses PRs; last of the third-party list because nothing builds on it. |

### Not in the recipe

| Branch | Why |
|---|---|
| `main` | The base, not a merge. Mirror of `origin/main`. |
| `main_community` | The product of the recipe. |
| `local_combined_temp` | An earlier combined branch, superseded. Nothing on it that `main_community` lacks. Kept until the owner says to remove it. |

## Stale-branch policy

On a new `main`, feature branches do not take a `main` merge unless they conflict with it or his
change alters the purpose of the feature. Check without merging:
`git merge-tree --write-tree main <branch>` (exit 0 means clean, leave it). `main_community`
always takes the latest `main`. Release notes are his: on a conflict in `releaseNotes.ts`, take
`main`'s wholesale.

## Known reds on main_community

Failures that are not regressions, so the gate can tell a new red from an old one:

- 2 `enginePackaging` signing assertions (the TEST neutering turns signing off on purpose).
- 1 `rustFactoring` register count (pending a hand edit to `engine/factoring-baseline.json`).
- ~9 delta-data reds from the local re-scrape (unknown slot tokens, unreadable stat keys,
  bundled icons missing for new items). Each failing test names its tokens; the scrape-delta
  playbook in `docs/plans` carries the procedure for clearing them.

Every feature branch is green on its own.
