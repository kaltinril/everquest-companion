// gen-mob-factions.mts — writes the committed index of mobs whose kill costs faction.
// `npx tsx scripts/gen-mob-factions.mts [<cache dir> ...]`.
//
// WHAT IT IS FOR. The Achievements tab's kill counters can leave out every mob the wiki says
// lowers a faction ("No faction hits"), so a player can work a counter without hurting standing.
// `{{Namedmobpage}}` lists those factions in its `|factions` field; `sources/mobFaction.ts` reads it.
//
// IT PARSES; IT DOES NOT SCRAPE. Same cache, same arguments, as `gen-mob-races.mts`
// (`sources/mobCache.ts`).
//
// ONLY KNOWN HITS ARE LISTED. A page that says `None`, says `Unknown`, or is not cached at all is
// absent, so the filter keeps it: the switch leaves out what is known to cost faction, nothing more.
//
// OUTPUT SHAPE: `{ hit: ["<page title>", ...] }`, sorted, keyed like `mobs.json`'s `page`.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mobPagesFrom } from './sources/mobCache'
import { factionHits } from './sources/mobFaction'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = 'src/renderer/src/data/eqlegends/mobFactions.json'

const pages = mobPagesFrom(ROOT, process.argv.slice(2))
const hit = [...pages].filter(([, text]) => factionHits(text).length > 0).map(([title]) => title)
hit.sort()
writeFileSync(join(ROOT, OUT), `${JSON.stringify({ source: 'eqlwiki.com', hit })}\n`)
console.log(
  `gen-mob-factions: ${String(pages.size)} mob pages in the cache, ${String(hit.length)} lower a ` +
    `faction -> ${OUT}`
)
