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
character-slot-sockets
exaltation-clarity
spell-upgrades
faction-tab
sidebar-groups
# third-party, vetted (ADOPTIONS.md)
# ours, never closes, always last
test-neutering
```

## What each branch is for

The fork is `origin` (`kaltinril/everquest-companion`). Nothing is ever pushed to `upstream`
(`jmoyers/everquest-companion`); PRs are opened from the fork's branches. Counts are against
`main` and go stale; `git rev-list --left-right --count main...<branch>` re-reads them.

### Ours, never closing, never a PR

| Branch | Worktree | What it does |
|---|---|---|
| `main_community_rules` | `C:/git/eqc-rules` | `docs/community/`, the rebuild script, the root `CLAUDE.md` hook, the `docs/branches.md` pointer. First in the recipe so the rules are on every build. |
| `local-data-refresh` | *(none)* | The locally re-scraped corpus: `items.json`, `mobs.json`, `dataWeight.generated.json` (2026-08-19 and 2026-09-04 scrapes). Second, so every feature branch's tests run against the data the build ships. |
| `test-neutering` | *(none)* | The TEST build identity (own appId, own userData, telemetry and feedback dark, updater guarded, no signing), the UNRELEASED gate forced open, and the `0.1.0-test.N` version bumps with tester notes. Always last. |

### Ours, in front of the creator (open PRs)

| Branch | PR | Worktree | What it does |
|---|---|---|---|
| `gear-tab-improvements` | [#31](https://github.com/jmoyers/everquest-companion/pull/31) | `C:/git/eqc-gear-sticky` | Gear tab: drop sources, worth-scores, numeric search, a wish column, resizable columns, the +0..+10 upgrade slider. The tab the other gear branches build on; merges before them. |
| `gear-progression-plan` | [#36](https://github.com/jmoyers/everquest-companion/pull/36) | `C:/git/eqc-plan-fix` | Recommended tab: a level route with exp zones and role-weighted gear targets. Carries the planner scoring recalibration (survivability dial, chunk-stat law, quest lane, ownership and equip advisory). |
| `map-improvements` | [#35](https://github.com/jmoyers/everquest-companion/pull/35) | `C:/git/eqc-maps` | Maps: clickable zone links, mob pins, hover cards, wish-list highlights. Plus the travel work: the zone graph read off the client's map labels, the port table from the spell and item corpora, per-zone level bands, and the "where to level" panel. |
| `fix-ds-ever-struck` | [#61](https://github.com/jmoyers/everquest-companion/pull/61) | `C:/git/eqc-fix-allypet` | A damage-shield tick is not a strike: `ds` lines no longer write `ever_struck`. The ally-pet crediting bug, fixed in the Rust engine. |

### Ours, finished, no PR opened yet

| Branch | Worktree | What it does |
|---|---|---|
| `scrape-delta-tool` | `C:/git/eqc-scrape` | `scripts/scrape-delta.mts`: the wiki-DB top-up that reads MediaWiki `recentchanges` since `items.json`'s `scrapedAt` and re-fetches only changed pages, at the creator's 1 req/s etiquette. Running it is an owner decision, never automatic. |
| `character-slot-sockets` | *(none)* | The socket board's foundation, the base `exaltation-clarity` sits on. Nothing new lands here. Merges before `exaltation-clarity`. |
| `exaltation-clarity` | `C:/git/eqc-exaltation-clarity` | The Exaltations and Character socket work: merged socket row, cleanup advisor, whole-board optimizer, owned tri-state, the proc rule, deity as R2's fourth condition. |
| `spell-upgrades` | `C:/git/eqc-spells` | The whole Spells area: spellbook with icons and sortable columns, the Loadout tab, the mote tier slider, the buff stats panel, the EQEmu stacking port and its ground-truth corpus. |
| `faction-tab` | `C:/git/eqc-faction-tab` | `/outputfile faction` graduated to a third supported kind, the UNRELEASED Factions tab, and the race-unlock claims read out of the achievements dump. |
| `sidebar-groups` | `C:/git/eqc-sidebar` | The nav drawer's tabs under three headings (Research, Stats/Data, Config) with Overview on top. Merges after every tab-adding branch, because it places each tab in a group at merge time. |

### Third-party, adopted

One branch per adopted upstream PR, named `community/pr-<number>-<slug>`, holding the PR's own
commits. The vetting record is the PR's row in [ADOPTIONS.md](ADOPTIONS.md).

| Branch | Upstream PR | What it does |
|---|---|---|

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
