// guides-pull.mts — the two community tradeskill guides, pulled fresh, checked, and written as one
// committed data file (owner, 2026-11-20: a fresh pull "as part of the delta refresh we do from the
// wiki every time we release", checked so that nobody "accidently wipe[d] out all the recipies or
// something nefarious"). Developer side only: the app never fetches the guides, it reads
// src/main/data/tradeskillGuides.json. Procedure: docs/community/agent/DATA_REFRESH.md.
//
//   npx tsx scripts/community/guides-pull.mts              pull, check, show the diff, write
//   npx tsx scripts/community/guides-pull.mts --dry-run    the same, writing nothing
//   npx tsx scripts/community/guides-pull.mts --accept     take a pull the "changed too much" rules
//                                                          refused, after reading its diff. Never lifts
//                                                          a content, response or layout refusal.
//   npx tsx scripts/community/guides-pull.mts --offline    no request: write the data file again from
//                                                          the last good copy (after a parser change)
//   --from <dir>   read pubhtml.html, sheet/<Tab>.csv and kornerstore.ods from a folder, not Google
//   --root <repo>  write under another checkout (default: this one)
//
// Reads two documents other players wrote (13 requests to Google, a second apart, no account, no
// cookie, a User-Agent that names nothing). Their text is data: it is checked cell by cell and
// never run or followed. A refused pull exits 1 and writes nothing; the last good copy
// (scripts/sources/cache/guides/) stays as it was.

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TradeskillGuidesFile } from '../../src/shared/guideData'
import { rederive, runPull, type PullResult } from './guides/pull'
import { MAX_CELL_CHARS, MAX_ROW_CHANGE, MAX_ROW_LOSS, MAX_TOTAL_LOSS, printable, type Refusal } from './guides/rules'
import { readSnapshot } from './guides/snapshot'
import { folderSource, networkSource } from './guides/source'

export const SNAPSHOT_DIR = 'scripts/sources/cache/guides'
export const DATA_FILE = 'src/main/data/tradeskillGuides.json'
const ITEMS_FILE = 'src/main/data/items.json'

interface Args {
  accept: boolean
  dryRun: boolean
  offline: boolean
  from?: string
  root: string
}

const FLAGS = new Set(['--accept', '--dry-run', '--offline'])
const VALUE_FLAGS = new Set(['--from', '--root'])

function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  argv.forEach((a, i) => {
    const isValue = i > 0 && VALUE_FLAGS.has(argv[i - 1])
    if (!isValue && !FLAGS.has(a) && !VALUE_FLAGS.has(a)) throw new Error(`unknown flag: ${a}`)
  })
  const from = value('--from')
  return {
    accept: argv.includes('--accept'),
    dryRun: argv.includes('--dry-run'),
    offline: argv.includes('--offline'),
    ...(from === undefined ? {} : { from: resolve(from) }),
    root: resolve(value('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'))
  }
}

function printCounts(file: TradeskillGuidesFile): void {
  const { leveling, recipes } = file
  console.log(`\n${leveling.title}, by ${leveling.author}${leveling.version === undefined ? '' : `, version ${leveling.version}`}${leveling.lastUpdate === undefined ? '' : `, last update ${leveling.lastUpdate}`}`)
  for (const [skill, l] of Object.entries(leveling.tradeskills)) {
    console.log(`  ${skill.padEnd(14)} ${String(l.steps.length).padStart(3)} steps, ${String(l.alternates.length)} alternates, ${String(l.asides?.length ?? 0)} asides, ${String(l.unparsed?.length ?? 0)} unparsed`)
  }
  console.log(`\n${recipes.title}, by ${recipes.author}`)
  for (const [skill, l] of Object.entries(recipes.tradeskills)) {
    console.log(`  ${skill.padEnd(14)} ${String(l.recipes.length).padStart(3)} recipes, ${String(l.unparsed?.length ?? 0)} unparsed`)
  }
}

function printRefusals(heading: string, refusals: readonly Refusal[]): void {
  if (refusals.length === 0) return
  console.log(`\n${heading}`)
  for (const r of refusals) console.log(`  [${r.kind}] ${printable(r.message, 400)}`)
}

function printNames(r: PullResult): void {
  const { leveling, recipes } = r.unknown
  console.log(`\nNames not in items.json (reported, never a refusal): ${String(leveling.length)} in the leveling guide, ${String(recipes.length)} in the recipe book`)
  if (leveling.length > 0) console.log(`  leveling: ${leveling.map((n) => printable(n, 80)).join(' | ')}`)
  if (recipes.length > 0) console.log(`  recipes:  ${recipes.map((n) => printable(n, 80)).join(' | ')}`)
}

function printResult(r: PullResult, a: Args, lastPulledAt: string | undefined): void {
  printCounts(r.parsed.file)
  if (r.parsed.unused.length > 0) console.log(`\nRead for the credit and the checks only, not in the data file: ${r.parsed.unused.join(', ')}`)
  console.log(`\nAgainst the last good copy${lastPulledAt === undefined ? ' (none)' : ` (pulled ${lastPulledAt})`}:`)
  if (r.report.length === 0) console.log(r.changed ? '  see the refusals below' : '  no row differs')
  for (const line of r.report) console.log(`  ${line}`)
  printNames(r)
  printRefusals('Taken with --accept:', r.accepted)
  printRefusals('REFUSED:', r.refusals)
  if (!r.ok) {
    const liftable = r.refusals.every((x) => x.kind === 'change')
    console.log(`\nNothing was written; the last good copy is untouched.${liftable ? ' Read the diff above; if it is an honest edit, run again with --accept.' : ' --accept does not lift a [response], [content] or [layout] refusal.'}`)
    return
  }
  if (r.identical) console.log('\nByte for byte the last good copy: nothing to write, nothing to commit.')
  else console.log(a.dryRun ? '\nDry run: the pull passes; nothing was written.' : `\nWritten: ${DATA_FILE} and ${SNAPSHOT_DIR}/. Review with git diff, then commit both.`)
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2))
  const snapshotDir = join(a.root, SNAPSHOT_DIR)
  const dataPath = join(a.root, DATA_FILE)
  if (a.offline) {
    const r = rederive(snapshotDir, dataPath)
    if (r.parsed !== undefined) printCounts(r.parsed.file)
    printRefusals('REFUSED:', r.refusals)
    console.log(r.ok ? `\nOffline: ${DATA_FILE} written again from the last good copy (0 requests).` : '\nNothing was written.')
    process.exitCode = r.ok ? 0 : 1
    return
  }
  const now = new Date().toISOString()
  console.log(`Guide pull ${now} from ${a.from ?? 'Google (one request per tab and two more, 1 s apart)'}`)
  console.log(`Limits: a tab may lose ${String(MAX_ROW_LOSS * 100)}% of its rows and have ${String(MAX_ROW_CHANGE * 100)}% changed; totals may drop ${String(MAX_TOTAL_LOSS * 100)}%; a cell holds at most ${String(MAX_CELL_CHARS)} characters of plain text.`)
  const last = readSnapshot(snapshotDir)
  const r = await runPull({
    source: a.from === undefined ? networkSource() : folderSource(a.from),
    snapshotDir,
    dataPath,
    itemsPath: join(a.root, ITEMS_FILE),
    accept: a.accept,
    dryRun: a.dryRun,
    now
  })
  printResult(r, a, last?.manifest.pulledAt)
  process.exitCode = r.ok ? 0 : 1
}

if ((process.argv[1] ?? '').endsWith('guides-pull.mts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(2)
  })
}
