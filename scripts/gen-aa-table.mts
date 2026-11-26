// gen-aa-table.mts — writes the committed AA table the Alt. Advancement tab reads.
// `npx tsx scripts/gen-aa-table.mts`.
//
// IT PARSES; IT DOES NOT SCRAPE. It reads one cached wiki page and sends the wiki nothing, on every
// run (there is no flag that makes it fetch):
//   scripts/sources/cache/classes/Alternate_Advancement.wikitext   (kept current by scrape:classes)
// and writes src/shared/aaTable.generated.ts. Run it after the cached page changed;
// tests/aaTable.test.mts fails while the committed file is behind the cache.
//
// It refuses to write when the page is not cached or its tables gave no row: the committed table
// stays. A row it could not read is printed and left out; the test holds that list empty.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAllAas, renderAaTable } from './sources/allAas'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AA_PAGE = join(ROOT, 'scripts', 'sources', 'cache', 'classes', 'Alternate_Advancement.wikitext')
const OUT = join(ROOT, 'src', 'shared', 'aaTable.generated.ts')

if (!existsSync(AA_PAGE)) throw new Error(`no cached Alternate Advancement page at ${AA_PAGE}: nothing written`)
const scan = parseAllAas(readFileSync(AA_PAGE, 'utf8'))
if (scan.rows.length === 0) throw new Error(`the cached page gave no AA row (${scan.skipped.join('; ')}): nothing written`)

// CRLF, as git checks the file out on this machine (gen-tradeskill-aas.mts does the same).
writeFileSync(OUT, renderAaTable(scan.rows).replace(/\n/g, '\r\n'))
const count = (s: string): number => scan.rows.filter((r) => r.section === s).length
const counts = ['general', 'archetype', 'class', 'special'].map((s) => `${String(count(s))} ${s}`).join(', ')
console.log(`wrote ${OUT}: ${counts}, 0 requests`)
for (const s of scan.skipped) console.warn(`  ! not read: ${s}`)
