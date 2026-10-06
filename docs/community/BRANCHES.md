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
wish-reason-picker
item-hover-cards
map-improvements
fix-ds-ever-struck
fix-roster-overrides-ever-struck
fix-self-dot-ticks
fix-reward-chest-loot
fix-alert-banner-captures
fix-sky-turnin-undo
fix-proc-debuffs
roster-who-classes
catch_all
character-slot-sockets
exaltation-clarity
spell-upgrades
faction-tab
slayer-tab
unlocks-tab
log-archive
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
creator's lint config already skips it. The Worktree column says where a branch is checked out
WHEN it is being worked on: a worktree is removed once its work is merged into `main_community`,
junction first (RULES.md, rule 18).

### Ours, never closing, never a PR

| Branch | Worktree | What it does |
|---|---|---|
| `main_community_rules` | `.claude/worktrees/main_community_rules` | `docs/community/`, the rebuild script, the root `CLAUDE.md` hook, the `docs/branches.md` pointer. First in the recipe so the rules are on every build. |
| `local-data-refresh` | *(none)* | The locally re-scraped corpus: `items.json`, `mobs.json`, `dataWeight.generated.json` (2026-08-19, 2026-09-04 and 2026-09-27 scrapes). Second, so every feature branch's tests run against the data the build ships. 2026-09-27: 1,213 changed pages in 25 requests, 57 new items and 8 new mobs; the wiki retired the `{{Sky Era}}` banner in that window and moved the per-class Plane of Sky test pages to sections of the Plane of Sky page. The branch also carries what a top-up drags with it: the icons the new pages ask for, and the creator's tests that pinned the wiki as it was, re-measured. Since 2026-09-27 it holds `posky.json` too (the delta covers items and mobs only; the Plane of Sky quests are `npm run scrape:posky`, 209 requests, slowed to one a second for the run) and the one row of `skyQuestRewards.ts` that rescrape retired and the one it called for. |
| `test-neutering` | *(none)* | The TEST build identity (own appId, own userData, telemetry and feedback dark, updater guarded, no signing), the UNRELEASED gate forced open, and the `0.1.0-test.N` version bumps with tester notes. Always last. |

### Ours, in front of the creator (open PRs)

| Branch | PR | Worktree | What it does |
|---|---|---|---|
| `gear-tab-improvements` | [#31](https://github.com/jmoyers/everquest-companion/pull/31) | `.claude/worktrees/gear-tab-improvements` | Gear tab: drop sources, worth-scores, numeric search, a wish column, resizable columns, the +0..+10 upgrade slider. The tab the other gear branches build on; merges before them. 2026-09-26: a Zones picker on the search toolbar (owner ask); a pick is a zone from the app's zone table, so the wiki's several spellings of one place are one pick. |
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
| `fix-alert-banner-captures` | `.claude/worktrees/fix-alert-banner-captures` | Alert banner: the On-screen text is a template like the spoken phrase, so a pattern's `{captures}` resolve on the banner instead of printing their braces (upstream issue #53, ISSUES.md). `alertBannerText` takes the firing's captures and runs the override through the same `applyCaptures`; the name is never templated; the 120-char cap applies after substitution. TypeScript only: the engine's `{target}` auto token still rides only when the spoken phrase writes it. Independent of every other branch. |
| `fix-sky-turnin-undo` | `.claude/worktrees/fix-sky-turnin-undo` | Sky tab: a log-detected turn-in can be taken back, and the tab can be reset (upstream issue #72, ISSUES.md). `ProgressState.rejectedTurnIns` records the detected instants the user rejected; a rejected instant is absent from the count, the dump window and the consumption, and stays absent when the log shows it again. Undo takes back the newest instant whoever recorded it; a two-click "Reset turn-ins" button on the filter bar rejects every detection the log shows today. Derived completions from the dumps are untouched. The record, undo and reset callbacks move to `turnInActions.ts` because `useProgress.ts` sat at the 400-line ceiling. Independent of every other branch; touches `progressState.ts` and `preload/index.ts`, which `faction-tab` also touches, in different regions. 2026-09-25: the Reset button moved from the filter bar to the counts row; on the bar it wrapped the bar under the select's wider labels and put the freshness caption's Refresh under the nav drawer, which is why `sky-inventory-autoload` was red on this branch alone. |
| `fix-proc-debuffs` | `.claude/worktrees/fix-proc-debuffs` | A debuff your weapon or item procs reaches the debuff tracker (upstream issue #69, ISSUES.md), under a switch that ships off. EQ prints nothing when an item procs, so the landing had no cast line to own it and was dropped on purpose. The engine's anchor rules (`buff_anchors.rs`) gain a fourth form: your own melee hit on that mob inside two seconds, plus the spell being a combat effect of an item the latest inventory dump holds, and the landing gate (`buff_landing.rs`, case 2b) resolves the ONE candidate the held items name, refusing a sentence two held procs could both explain. The app derives the held combat effects from `items.json` at push time (`itemClickies.ts heldProcSpells`, `appKnowledge.ts`) and re-pushes `buffTrust.define` whenever the dump is re-read; the wire type (`BuffTrustPrefs`) grows `procDebuffs` and `procSpells`, both generated files regenerated. Preferences > Buffs gains the switch with a caption naming the residual (a group-mate swinging the same weapon at the same mob). `buffs.rs` takes no new lines: its `Defines` impl moves to `buffs_defines.rs` and the factoring register records the shrink. Proofs in `engine/crates/fold/tests/proc_debuff.rs` (the reporter's Tashania case, both halves required, the two-candidate refusal) and `tests/buffTrustProcs.test.mts`. Independent of every other branch. Second commit (2026-09-25, measured over the owner's log): a proc's landing prints BEFORE its swing's line and procs fire on misses, so a swing is now a hit, a miss or a held proc's own damage line, and a refused landing is held in `buff_procs.rs` for the same-second swing that follows it. |
| `roster-who-classes` | `.claude/worktrees/roster-who-classes` | A roster member carries the classes their `/who` row stated (owner ask, 2026-09-26: offer group-mates to the buff set without typing their classes). The parser claims only the tailed character's own row, so another player's row reaches the fold as `unknown` with the line intact; the roster module reads it there (`roster_who.rs`), remembers the newest 512 names in memory only, and joins what a row said to the members it already publishes, as `classes`, `level` and `classesTs`. A row is never a membership signal, the parser and its parity surface are untouched, and `on_event` takes the row on its existing `_` arm so the factoring register does not move. Proofs in `roster_who.rs` and `engine/crates/fold/tests/roster_who.rs`. Independent of every other branch; `spell-upgrades` reads the three fields when they are there and offers nothing when they are not. After a merge the engine binary needs `npm run build:engine`. |
| `catch_all` | `.claude/worktrees/catch_all` | Never closes. Small fixes to the creator's own code that belong to no feature branch of ours are GROUPED here rather than each getting a branch (owner, 2026-09-21); one commit per fix, so any one can be lifted out for its own upstream PR later. A fix that touches what one of our feature branches is about goes on that branch instead. Holds so far: (1) the Maps pack select showed the stored pack before the pack list had arrived (and after a pack was removed), so MUI warned about an out-of-range value on every render; it now says Auto whenever `packOrder` would fall back to auto. (2) The alert player's audio-device breadcrumb is gone (upstream issue #58, ISSUES.md): a `devicechange` listener that only wrote a dev-log line started Chromium's media-device monitor, the app's one touch of `navigator.mediaDevices`, and a user's Norton reported it as camera and microphone access. (3) Six spell-message corrections in their own file (`spellCorrectionsResists.ts`): the Resist Fire/Cold/Poison/Disease landings the game prints (`You feel resistant to <x>.`) and the real wear-offs of Resist Fire and Resist Magic; the engine sidecar regenerated, a parser test pins all six. (4) A bard's `You miss a note, bringing your <song> to a close!` is a cast interrupt. (5) `You receive <coins> from <NPC>.` is coin from an NPC. (6) A missed swing keeps a two-word modifier (`(Wild Rampage)`). (7) The era join's `quest` edge says IN as well as OUT when the quest starts in an opened zone and no required item is badged out (the Soldier's Brooches; 154 `era?` gear rows flip in, the three epic pieces the guard refuses stay). (8) The cast anchor joins on the spell name with apostrophes folded to one glyph (a backtick cast line meets the wiki's straight apostrophe: Jaxan's Jig o` Vigor, 0 of 248 sings had opened a row). (9) A landing message without a `Someone` subject is indexed by its own predicate, in both parser twins (111 wiki rows; Scream of Hate, Infusion of Spirit on others). (10) The wiki floor's grace for an unwitnessed row on another is a tenth of the floor (min 60 s), because this server's buffs run ~5% past the wiki, and a proc buff grows at the unstated 5%/rank instead of 0. All from the 2026-09-25 bug expedition; (8)-(10) from the tester's buff/debuff report, measured on the owner's log. (11) A drop the wiki spells with underscores is the page with spaces (`{{:Brass_Knuckles}}` on three Plane of Sky pages joined to no item); the loot parser folds a title the way MediaWiki does. From the 2026-09-27 top-up. (12) An upgrade shrinks a penalty past ten by a tenth of itself a tier, where every penalty had taken one point a tier: Stonemelder's Band (DEX -35, AGI -35) reads 0 on both at +10 (owner's reading, 2026-09-28), and the wiki slider's source states the rule; 35 items in the corpus carry such a penalty. |
| `character-slot-sockets` | *(none)* | The socket board's foundation, the base `exaltation-clarity` sits on. Nothing new lands here. Merges before `exaltation-clarity`. |
| `exaltation-clarity` | `.claude/worktrees/exaltation-clarity` | The Exaltations and Character socket work: merged socket row, cleanup advisor, whole-board optimizer, owned tri-state, the proc rule, deity as R2's fourth condition. 2026-09-25 fixes to the board optimizer: a seat keeps its own copy (no no-op swaps), one physical copy is named once (a per-gem ledger replaces the family copy count), and R2 has a third party: the socketed item must still be wearable by the character (seatFits and the Exaltations browser's trio-only fit). |
| `spell-upgrades` | `.claude/worktrees/spell-upgrades` | The whole Spells area: spellbook with icons and sortable columns, the Loadout tab, the mote tier slider, the buff stats panel, the EQEmu stacking port and its ground-truth corpus. 2026-09-25 fixes: the apostrophe fold now reaches every join (spell card, observed ranks, resist debuff amounts, alert suggestion lines); tier magnitudes in whole percents; the same-name fold no longer deletes ranked rows (Burnout, Cannibalize); the spell page and the Spellbook row file a spell under one category; the Spellbook scales per effect line like the Leveling tab; rung I of both tier sliders is tier 1; `spellItemIndex.ts` is text again (its NUL separators are escapes). 2026-09-26: the Loadout tab's buff set takes the group into account (a tester's ask): group-mates' classes are entered on the Buffs pane, the pool gains the buffs they can cast on someone else (`shared/spellParty.ts`), and each kept row says who casts it. The kept set is grouped by caster, each caster wears a colour the user can change, and a roster member whose `/who` row stated classes is offered as a one-click add (the classes come from `roster-who-classes`). |
| `faction-tab` | `.claude/worktrees/faction-tab` | `/outputfile faction` graduated to a third supported kind, the UNRELEASED Factions tab, and the race-unlock claims read out of the achievements dump. |
| `slayer-tab` | `.claude/worktrees/slayer-tab` | The UNRELEASED Slayer tab (owner ask, 2026-09-28): the open Slayer counters read out of the achievements dump, and the zones where the picked ones can be worked on together, ranked by how many picked counters a zone serves and then by spawn points. The join from a requirement line (`Bats and Werebats.`) to mobs is the wiki mob page's `race` field, which the catalog does not carry: `scripts/gen-mob-races.mts` reads it off mob pages already in the scrapers' disk cache, with no request made, and writes `mobRaces.json`. 2026-09-29: the pages no earlier scrape had kept were fetched by the owner's decision (2,547 pages, the mob scraper at its one request a second), so the index states a race for 7,920 mobs. Which wiki values a term counts is one hand-authored table, `shared/slayer/slayerKinds.ts`, with what was measured against the owner's log and dump in its header; a mob with no usable race is read off its name and labelled an estimate. On the Maps tab the picked counters' spawn points are shaded as areas that name the achievements they serve, behind a switch. The counters ride `ProgressState.slayer`, written by its own accessor, so `setAchievements` keeps the signature `faction-tab` changes. 2026-09-29 (owner ask): the tab is the Achievements tab and lists every achievement of the active character's dump, grouped as the game's window groups it (family, group, achievement, requirement), with the window's Open and Complete switches and a search across all groups. The view id stays `slayer`, so `sidebar-groups` places the same row. A requirement that names another achievement opens into it, a mob's whole name opens the mob page, and a `Hunter of`, `Conqueror of` or `Traveler` name opens its map; the zone plan is offered inside the Slayer family. The tree is read on demand over one new channel (`achievements:book`) and never stored. `preload/index.ts` sits at its line ceiling, so the new method has a slice of its own (`preload/achievements.ts`) and the feedback preview of the same dump moved there with it; `faction-tab` and `map-improvements` split that file in other lines. 2026-10-05 (owner ask): **No faction hits**, a switch beside the zone plan's level cap, leaves out every mob the wiki's `|factions` field says lowers a faction, from the zone plan, each counter's zone count and the map shading alike; `scripts/gen-mob-factions.mts` writes `mobFactions.json` from the same cache, with no request made, and a page that says None or Unknown stays in. **Zone I'm in**, beside Open and Complete, keeps the achievements that can be worked on in the zone the log last named: an open counter with a mob there, an open line naming a mob filed there, or that zone's Hunter, Conqueror or Traveler. After `faction-tab` and `map-improvements`, whose files it touches in other lines; before `sidebar-groups`, which places its nav row. |
| `wish-reason-picker` | `.claude/worktrees/wish-reason-picker` | The Wish list tab's reason line (`gear`, or the effect a donor wish is for) is a picker (owner ask, 2026-10-03): `gear` plus every effect the donor corpus says the item carries, so a wish's kind is no longer fixed by the tab it was added from. `setWishReason` in `shared/planner/wishlist.ts` (tested) and a `setReason` door on `useWishlist`; the control is `features/wishlist/WishReason.tsx`, which reads the wish list and the donor corpus itself so `WishGroups`' row and group signatures stay as they are. Off `main`; after `gear-progression-plan`, whose Recommended tab reads the same kind (only a wish to wear bypasses its upgrade test). |
| `item-hover-cards` | `.claude/worktrees/item-hover-cards` | Item names hover with the item card again (owner ask, 2026-10-03: "find all locations where we don't have items show up when you hover"), in `KnownItemTooltip`'s click-through mode, the JOS-181 answer to the JOS-143/JOS-127 defect (it opens below, takes no pointer events, closes on any pointerdown). `DonorName` gains an opt-in `card`; the Wish list rows, Got it strip and add search, Exaltations donors with no gear row, the Loot ledger (names, created items, notable pickups, owned-not-looted notice), the Sky tab's shared items, ignored rewards and targets, and the Character carry table. `loot-sort.e2e` now asserts the card opens below the Sort control and takes no pointer events, where it asserted no card. Off `main`. The same ask landed on the fork branches that own the other surfaces, each with `KnownItemTooltip` directly so none depends on this branch: `gear-progression-plan` (target fallback, equip advisory), `map-improvements` (sidebar wish drops), `gear-tab-improvements` (quest-use rewards), `spell-upgrades` (spell page items), `unlocks-tab` (reward chip), `character-slot-sockets` (slot wish chips), `exaltation-clarity` (gem chips, replaced gem). Left as they are on purpose: names beside a full item window (drill-down header, item dialog title), drop names inside a mob card (no card in a card), map pin labels, and the title-only names the creator kept. |
| `unlocks-tab` | `.claude/worktrees/unlocks-tab` | The UNRELEASED Unlocks tab (owner ask, 2026-09-29): the three unlock families of the achievements dump (`Untapped Potential: Races`, `: Classes`, `: Deity`) as what each still needs and how each open one opened (earned, created as, confirmed, token, or with another race). A faction line carries the Factions tab's live standing over its cap and opens that tab; an `Obtain` line opens the Sky quest that hands the item out, joined the way the Sky tab's inference joins them; a deity line is its task or the file's own "nothing published yet". The model is `shared/unlocks/unlocks.ts`, measured on the fixture and the owner's dump. Based on BOTH `slayer-tab` (the achievements tree over `achievements:book`) and `faction-tab` (the standings), so its first commit is a merge of the two and it sits after both. 2026-09-30 (owner: unlocks information across the app, not one tab): the requirement lines are committed as a rulebook (`shared/unlocks/unlockRules.generated.ts`, `scripts/gen-unlock-rules.mts` reading the fixture dump; a test regenerates and compares), so the tab lists every unlock before a dump exists and the graph (`shared/unlocks/unlockGraph.ts`) answers what a faction, item, task or quest is on the way to. "On the way to" chips (`features/unlocks/UnlockChips.tsx`, linked app-wide through `lib/unlockLink.tsx`, the spell-link arrangement) sit on an item's knowledge card, a mob page, and the Factions work panel's quests; the Factions race hunt reads the rulebook and works without an achievements dump; the Kerran task is drawn as the seven quests the cached wiki pages say it is made of; each family names its marketplace token. Touches `features/factions/**`, `features/loot/KnowledgeSection.tsx`, `features/mobs/MobPage.tsx` and `App.tsx` in a few lines each. |
| `sidebar-groups` | `.claude/worktrees/sidebar-groups` | The nav drawer's tabs under three headings (Research, Stats/Data, Config) with Overview on top. Merges after every tab-adding branch, because it places each tab in a group at merge time. |
| `log-archive` | `.claude/worktrees/log-archive` | Upstream issue #37 (ISSUES.md), planned in `docs/plans/log-archive/`: **Summarize and archive log** (named Keep log history until 2026-10-05, renamed by the owner because that name read as keeping the log file), a switch in Preferences > Game that is off for every player and only the player turns on. Once on, the player can back up the log as a verified gzip copy and archive it to start a fresh log, while kills, loot, levels, AA, consider, item tiers, class unlocks, turn-ins, respawn gaps and the leveling series keep showing. The game may stay open (measured 2026-10-03). Every buildable phase is built (fight summaries per ruling 0.4, the engine's files per 5.2, refold and Refresh per 5.4 and 5.5); since 2026-10-04 the switch shows in every build (6.3) and the owner's own trial is what remains. Placed before `sidebar-groups` because its card sits in Preferences and adds no tab. |

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

The delta-data reds that stood here from 2026-09-04 cleared with the 2026-09-27 top-up. A
top-up is not finished until the creator's data-pinned tests are re-measured against it: wiki
typos are corrected on the wiki and read back by a second delta run, the fact pins and floors
move on `local-data-refresh`, and a census that compared case moves on `catch_all`.

Every feature branch is green on its own.
