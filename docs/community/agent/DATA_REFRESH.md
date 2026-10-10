# Agent notes: refreshing wiki data

How to bring the committed wiki corpus up to date. Running any of this is an owner decision
(RULES.md rule 15; WORKFLOW.md "Wiki and network"). Output lands on `local-data-refresh`.

## When

After a game patch or zone rework, give wiki editors a few days, then run the delta. The Gear
tab's "wiki data from <date>" caption shows the current `scrapedAt`. Before the run, tell the
owner which files it touches: the delta covers ONLY `items.json` + `mobs.json`.

## Delta procedure (items.json + mobs.json)

The script is `scripts/scrape-delta.mts` on `scrape-delta-tool` (not on the data branch). It reads
MediaWiki `list=recentchanges` since `items.json`'s `scrapedAt` and fetches only changed ns0 pages
at 1 request per second, through the creator's own parsers (output byte-compatible, keys are
lowercased names). A 3-week window was ~1,200 pages in ~25 batched requests.

1. `npx tsx scripts/scrape-delta.mts --dry-run` from the main clone (reads only) to see volume.
2. Make a throwaway worktree of `local-data-refresh` under the session temp dir with a
   `node_modules` junction, copy the script in, run it for real there. The dev app can stay up.
3. `npm run gen:data-weight` (`dataWeight.test` pins exact bytes of every data JSON).
4. `node --import tsx --test tests/itemsDb.test.mts tests/dataWeight.test.mts`.
5. Commit on `local-data-refresh`.
6. Gate the merged result in a second scratch worktree
   (`git worktree add --detach <scratch>/mc main_community`, merge, typecheck/lint/test) and
   compare `^✖` lines against a baseline run at `main_community`'s head.
7. Remove the junctions first (`(Get-Item <wt>\node_modules).Delete()`), then
   `git worktree remove --force`. Only the final merge into the main clone needs the dev app
   closed.

## Expect new reds, and clear them

New wiki content turns the creator's census tests red. Each failing test names its tokens.

- gearIndex family ("slots/classes/sockets/tiers tokens are canonical", "class/slot table covers
  the corpus", "unindexed stat keys are exactly the five", `eraFromTag` token-for-token, layer-3
  census): add the new tokens to the hand-authored normalization/era tables they point at.
- A case or punctuation variant is folded in the test, not reported (WORKFLOW.md, wiki tokens).
- A real wiki typo: give the owner the page link, the exact current text and the exact
  replacement; the owner edits the wiki; a second delta run (seconds) reads it back.
- Fact pins and floors move on `local-data-refresh`. Census tests that compared raw spellings or
  required a key the wiki dropped move on `catch_all`, written to hold on BOTH main's corpus and
  the refreshed one.
- `bundledImages` ("every item icon in the bundle"):
  `npx tsx scripts/fetch-wiki-images.mts --seed "$APPDATA/everquest-companion-dev/image-cache"`
  first (its `--dry-run` still copies seeded files), then the real run. Item icons 1918 and 1920
  are 404 upstream and stay missing.
- A top-up is not finished until those reds are cleared (BRANCHES.md, known reds).

## Plane of Sky quests (posky.json): not covered by the delta

`npm run scrape:posky` reads the rendered `Plane of Sky` page plus one request per item/reward page
(~209). Its script sleeps 110 ms: change `await sleep(110)` to `sleep(1000)` in
`scripts/sources/eqlegends.ts` in the scratch worktree and `git checkout --` it before committing.
A posky rescrape trips two audits by design: rows in `skyQuestRewards.ts` the wiki has caught up to
must be deleted, and `achievementInference` needs every reward to match the game's achievements
file.

## Other scrapers

`npm run scrape:quests|bosses|spells|page-era|mobs` are full-corpus and heavier. Run only on the
owner's word. `scrape:mobs` was run once (2026-09-29, 2,547 pages, ~2 min) by seeding `cache/mobs`
from `cache/items` first.

## Wiki facts that matter to parsers (as of 2026-09-27)

- `{{Sky Era}}` was retired: ~107 pages became `{{Classic Era}}`, ~45 have no banner. Pre-upgrade
  Sky rewards carry `{{Delete}} Replaced with X in EQL`; the app does not read that marker and the
  delta never drops a page.
- Per-class Sky test pages became `Plane of Sky#<Class> Tests` sections, so ~340
  `questUses.page` values no longer match quests.json/posky.json; `eraDerive` looks up
  `use.page ?? use.quest`, so its quest edge misses on them. The app's Sky links are built from
  posky.json and are unaffected.
- `{{Legacy of Ykesha Era}}` does not exist as a template on the wiki.
- Itempage fields: `|dropsfrom` = mobs, `|playercrafted` = how it is made, `|recipes` = what it is
  used in.
- Verifying a suspicious delta costs one request: `prop=revisions` for up to 50 titles.
- `scripts/sources/cache/quests` (and spells) wikitext caches ARE committed; mobs' is not. Quest
  facts (e.g. faction receipts) can be re-extracted with zero requests.

## Not every "the scrape broke it" is the scrape

Recommended-tab bars come from EQUIPPED items only. Check the inventory export's date and its
equipped slots before suspecting data; the remedy is equip + `/outputfile inventory`.

## In-game freshness to suggest to a player

- `/outputfile inventory`: gear, ownership, bars (the app reloads it on view open).
- `/outputfile achievements`, `/outputfile faction` (singular): achievements and factions tabs.
- `/who`: level and class detection, and group-mates' classes.
- `/pet who leader` after each zone-in: group-pet crediting (binds drop on every zone line by
  design).
