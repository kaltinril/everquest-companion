# Open branches

What each branch on the fork is for, so a new session (or a second tester) can tell at a glance
where work belongs without reading twelve logs.

**The fork is `origin` (`kaltinril/everquest-companion`). Nothing is ever pushed to `upstream`
(`jmoyers/everquest-companion`); PRs are opened from the fork's branches.**

Counts are against `origin/main` and go stale — `git rev-list --left-right --count origin/main...<branch>`
re-reads them. Last taken 2026-09-11.

## In front of the creator (open PRs)

| Branch | PR | Worktree | behind/ahead | What it does |
|---|---|---|---|---|
| `gear-tab-improvements` | [#31](https://github.com/jmoyers/everquest-companion/pull/31) | `C:/git/eqc-gear-sticky` | 11 / 56 | Gear tab: drop sources, worth-scores, numeric search, a wish column, resizable columns. The tab the other two gear branches build on. |
| `map-improvements` | [#35](https://github.com/jmoyers/everquest-companion/pull/35) | `C:/git/eqc-maps` | 11 / 26 | Maps: clickable zone links, mob pins, hover cards, wish-list highlights. Plus the travel work (2026-09-11): the zone graph read off the client's own map labels, the druid/wizard/item port table derived from the spell and item corpora, per-zone level bands from the bestiary, and the level-scoped "where to level and farm motes" panel. |
| `gear-progression-plan` | [#36](https://github.com/jmoyers/everquest-companion/pull/36) | `C:/git/eqc-plan-fix` | 11 / 60 | Recommended tab: a level route with exp zones and role-weighted gear targets. Carries the planner scoring recalibration (survivability dial, chunk-stat law, quest lane, ownership/equip advisory). |
| `fix-ds-ever-struck` | [#61](https://github.com/jmoyers/everquest-companion/pull/61) | `C:/git/eqc-fix-allypet` | 11 / 3 | A damage-shield tick is not a strike: `ds` lines no longer write `ever_struck`. The ally-pet crediting bug, fixed in the Rust engine. |

## Finished, no PR opened yet

| Branch | Worktree | behind/ahead | What it does |
|---|---|---|---|
| `spell-upgrades` | `C:/git/eqc-spells` | 0 / 22 | The whole Spells area: spellbook with icons and sortable columns, the Loadout tab (buff/combat/heals), the mote tier slider, the buff stats panel, the EQEmu stacking port and its ground-truth corpus. Two testers spent an evening on it (test.10 and test.11). |
| `exaltation-clarity` | `C:/git/eqc-exaltation-clarity` | 11 / 32 | The Exaltations/Character socket work: merged socket row, cleanup advisor, whole-board optimizer, owned tri-state (now Missing/Owned chips plus a per-row badge), the proc rule, and deity as R2's fourth condition. Based on `character-slot-sockets`, **not** on a stale `origin/main`. |
| `faction-tab` | `C:/git/eqc-faction-tab` | 0 / 13 | `/outputfile faction` graduated to a third supported kind, the UNRELEASED Factions tab, and the race-unlock claims read out of the achievements dump. |
| `character-slot-sockets` | *(none)* | 11 / 12 | The socket board's foundation — the base `exaltation-clarity` sits on. Nothing new lands here; it exists so the exaltation branch has an honest base. |
| `scrape-delta-tool` | `C:/git/eqc-scrape` | 0 / 1 | `scripts/scrape-delta.mts`: the wiki-DB top-up that reads MediaWiki `recentchanges` since `items.json`'s `scrapedAt` and re-fetches only changed pages, at the creator's 1 req/s etiquette. Running it is an owner decision, never automatic. |
| `sidebar-groups` | `C:/git/eqc-sidebar` | 0 / 1 | The nav drawer's tabs under three headings - Research, Stats/Data, Config - with Overview on top, ungrouped (owner ask, 2026-09-12). One file, presentational only, every testid unchanged. On the testing merge the gated Spells and Factions rows joined Research; a branch that adds a tab places it in a group at merge time. |

## Local only — never a PR

| Branch | Worktree | ahead | What it does |
|---|---|---|---|
| `local_all_changes_testing` | `C:/git/everquest-companion` | 372 | The integration branch every finished branch merges into, and the one test builds are cut from. Carries three things that must never reach a PR: the TEST neutering (its own appId, isolated userData, telemetry dark, updater guarded), the `UNRELEASED` gate forced open so testers see gated tabs, and the version bumps (`0.1.0-test.N`). Also holds a locally re-scraped `items.json`/`mobs.json` — deliberately kept here, because the official corpus refresh is the creator's to run. |
| `local_combined_temp` | `C:/git/eqc-combined` | 201 | An earlier combined branch, superseded by `local_all_changes_testing`. Kept until someone confirms nothing is stranded on it. |
| `main` | *(none)* | 0 | Mirror of `origin/main`. Never committed to directly. |

## Working rules

- **Fixes land on the feature branch, then merge into `local_all_changes_testing`** — never fixed on
  the integration branch directly, or the fix never reaches a PR.
- **A branch 11 behind `origin/main`** wants a `main` merge before it becomes a PR. Several sit
  there on purpose: the creator is not merging fork PRs right now, so the merge is deferred until
  it is worth doing.
- **Release notes are the creator's.** On a conflict in `releaseNotes.ts`, take `main`'s wholesale.
- Merge conflicts whose resolution only makes sense with two branches present (a bundled signature,
  say) live on the integration branch and are noted in the merge commit.

## Known reds

`local_all_changes_testing` stands at **12 failures** that are NOT regressions: they are the
outstanding work from the local re-scrape (unknown slot tokens `Lore` / `Item,`, five unreadable
stat keys, bundled icons missing for new items, the engine register). `docs/plans` and the
scrape-delta playbook carry the procedure for clearing them. Every feature branch is green on its
own corpus.
