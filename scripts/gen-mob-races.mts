// gen-mob-races.mts — writes the committed mob-race index. `npx tsx scripts/gen-mob-races.mts`.
//
// WHAT IT IS FOR. The Slayer achievements count kills BY RACE ("Gargoyles", "Bats and Werebats"),
// and the mob catalog (`mobs.json`) carries a name, a level, zones and spawn points but no race.
// The wiki's mob pages do state one: `{{Namedmobpage}}` has a `|race` field (`| race = Gargoyle`).
// This script reads that field off every mob page it can find in the scrapers' own disk cache and
// writes `src/renderer/src/data/eqlegends/mobRaces.json`.
//
// IT PARSES; IT DOES NOT SCRAPE. No request leaves this script. Its input is wikitext the
// scrapers already fetched and left under `scripts/sources/cache/`:
//   - `cache/items/`  the item scraper's batches. `embeddedin Template:Itempage` reports indirect
//                     transclusions, so every mob page that shows an item box was fetched along
//                     with the items (5,408 mob pages, measured 2026-09-28).
//   - `cache/mobs/`   the mob scraper's own batches, when `npm run scrape:mobs` has run here.
// The cache is gitignored, so a worktree has none of its own: pass the directories to read as
// arguments (`npx tsx scripts/gen-mob-races.mts <dir> [<dir> ...]`, later ones win) and the
// defaults are skipped. A page found nowhere is simply absent from the index; the Slayer tab
// reads an absent mob's race off its name where the name states one, and labels that an estimate.
//
// THE VALUE IS THE WIKI'S, VERBATIM, minus markup: `[[Human]]` is `Human`, `''Undead''` is
// `Undead`. Nothing is folded, merged or corrected here (`Skeleton New`, `Giant Rats` and
// `Lizardman` stay as written); which wiki values an achievement counts is knowledge, and it
// lives in one hand-authored table, `features/slayer/slayerKinds.ts`.
//
// OUTPUT SHAPE: `{ races: { "<race>": ["<page title>", ...] } }`, races and titles sorted, so a
// re-run over the same cache is byte-identical and a re-run over a newer one is a clean diff.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMobPage } from './sources/mobPage'
import { statedRace } from './sources/mobRace'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Later directories win: the mob scraper's cache is the fetch made FOR mob pages.
const CACHE_DIRS = ['scripts/sources/cache/items', 'scripts/sources/cache/mobs']
const OUT = 'src/renderer/src/data/eqlegends/mobRaces.json'

/** One page as MediaWiki's batched `prop=revisions` returns it (formatversion 2). */
interface CachedPage {
  title?: string
  revisions?: { slots?: { main?: { content?: string } } }[]
}

/** One cache file's pages; none when it is not a batch this script knows how to read. */
function readBatch(path: string): CachedPage[] {
  try {
    const batch: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(batch) ? (batch as CachedPage[]) : []
  } catch {
    return []
  }
}

/** Every mob page's wikitext found in one cache directory, by title. */
function cachedMobPages(dir: string): Map<string, string> {
  const pages = new Map<string, string>()
  const abs = resolve(ROOT, dir)
  if (!existsSync(abs)) return pages
  for (const name of readdirSync(abs).filter((n) => n.endsWith('.json'))) {
    for (const page of readBatch(join(abs, name))) {
      const text = page.revisions?.[0]?.slots?.main?.content
      if (page.title && text && isMobPage(text)) pages.set(page.title, text)
    }
  }
  return pages
}

const given = process.argv.slice(2)
const pages = new Map<string, string>()
for (const dir of given.length > 0 ? given : CACHE_DIRS) {
  for (const [title, text] of cachedMobPages(dir)) pages.set(title, text)
}
const byRace = new Map<string, string[]>()
for (const [title, text] of pages) {
  const race = statedRace(text)
  if (race === '') continue
  const list = byRace.get(race) ?? []
  list.push(title)
  byRace.set(race, list)
}
const races: Record<string, string[]> = {}
let stated = 0
for (const race of [...byRace.keys()].sort()) {
  races[race] = (byRace.get(race) ?? []).sort()
  stated += races[race].length
}
writeFileSync(join(ROOT, OUT), `${JSON.stringify({ source: 'eqlwiki.com', races })}\n`)
console.log(
  `gen-mob-races: ${String(pages.size)} mob pages in the cache, ${String(stated)} state a race, ` +
    `${String(byRace.size)} distinct values -> ${OUT}`
)
