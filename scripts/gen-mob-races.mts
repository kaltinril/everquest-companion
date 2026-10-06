// gen-mob-races.mts — writes the committed mob-race index. `npx tsx scripts/gen-mob-races.mts`.
//
// WHAT IT IS FOR. The Slayer achievements count kills BY RACE ("Gargoyles", "Bats and Werebats"),
// and the mob catalog (`mobs.json`) carries a name, a level, zones and spawn points but no race.
// The wiki's mob pages do state one: `{{Namedmobpage}}` has a `|race` field (`| race = Gargoyle`).
// This script reads that field off every mob page it can find in the scrapers' own disk cache and
// writes `src/renderer/src/data/eqlegends/mobRaces.json`.
//
// IT PARSES; IT DOES NOT SCRAPE. No request leaves this script; `sources/mobCache.ts` says which
// cache it reads and in what shapes.
// The committed index was generated on 2026-09-29 from a mob cache holding every catalogued page
// (the owner ran the fetch for the 2,547 pages no earlier scrape had kept).
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

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mobPagesFrom } from './sources/mobCache'
import { statedRace } from './sources/mobRace'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = 'src/renderer/src/data/eqlegends/mobRaces.json'

const pages = mobPagesFrom(ROOT, process.argv.slice(2))
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
