// gen-tradeskill-aas.mts — writes the committed General AAs table the Tradeskills section reads.
// `npx tsx scripts/gen-tradeskill-aas.mts`.
//
// IT PARSES; IT DOES NOT SCRAPE. It reads two cached wiki pages and sends the wiki nothing, on
// every run (there is no flag that makes it fetch):
//   scripts/sources/cache/classes/Alternate_Advancement.wikitext   (kept current by scrape:classes)
//   scripts/sources/cache/pages/page-<id>.wikitext of `Tradeskills` (kept current by the delta)
// and writes src/shared/tradeskillAaTable.generated.ts. Run it after either cached page changed;
// tests/tradeskillAaTable.test.mts fails while the committed file is behind the caches.
//
// The file carries no date, so a run over unchanged caches rewrites the same bytes.
//
// It refuses to write when the AA page is not cached or its table gave no row: the committed
// table stays. A row it could not read is printed and left out; the test above holds that list
// empty, so a row a wiki edit broke is seen at the gate.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGeneralAas, renderTradeskillAaTable, tradeskillAaRules } from './sources/generalAas'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AA_PAGE = join(ROOT, 'scripts', 'sources', 'cache', 'classes', 'Alternate_Advancement.wikitext')
const PAGES_DIR = join(ROOT, 'scripts', 'sources', 'cache', 'pages')
const OUT = join(ROOT, 'src', 'shared', 'tradeskillAaTable.generated.ts')

/** The cached text of a page the delta keeps raw, or null when the page cache does not hold it. */
function cachedPage(title: string): string | null {
  const list = join(PAGES_DIR, 'pages.json')
  if (!existsSync(list)) return null
  const pages = JSON.parse(readFileSync(list, 'utf8')) as { pageid: number; title: string }[]
  const page = pages.find((p) => p.title === title)
  const file = page === undefined ? null : join(PAGES_DIR, `page-${String(page.pageid)}.wikitext`)
  return file !== null && existsSync(file) ? readFileSync(file, 'utf8') : null
}

if (!existsSync(AA_PAGE)) throw new Error(`no cached Alternate Advancement page at ${AA_PAGE}: nothing written`)
const scan = parseGeneralAas(readFileSync(AA_PAGE, 'utf8'))
if (scan.rows.length === 0) throw new Error(`the cached page gave no General AA row (${scan.skipped.join('; ')}): nothing written`)

const tradeskills = cachedPage('Tradeskills')
if (tradeskills === null) console.warn('  ! the page cache holds no Tradeskills page: no rule line is kept')
const rules = tradeskills === null ? [] : tradeskillAaRules(tradeskills)

// CRLF, as git checks the file out on this machine (gen-unlock-rules.mts does the same).
writeFileSync(OUT, renderTradeskillAaTable(scan.rows, rules).replace(/\n/g, '\r\n'))
console.log(`wrote ${OUT}: ${String(scan.rows.length)} General AAs, ${String(rules.length)} rule lines from the Tradeskills page, 0 requests`)
for (const s of scan.skipped) console.warn(`  ! not read: ${s}`)
