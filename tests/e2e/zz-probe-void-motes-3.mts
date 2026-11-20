/**
 * THROWAWAY PROBE 3 (void-motes): the empty cases, and dumps written while the app is up.
 * One launch that starts with NO dump. Steps:
 *  S1 no dump; S1b the controls in the empty state; S2 the committed dump arrives live;
 *  S3 every worn piece +10; S4 +10 and one unknown piece; S5 a dump that wears nothing;
 *  S6 only unknown pieces worn; S7 three +9 pieces (the longest plan line); S7b the same at 900 px.
 */
import type { Page } from 'playwright-core'
import { readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, buildIfStale, settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, writeInventoryDump } from './logFixture.mjs'
import { bound, measure, openTab, report, resizeTo, save, type M } from './zz-probe-void-motes-0.mjs'

const one = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
const FIXTURE = readFileSync(join(ROOT, 'tests', 'fixtures', 'Primitive_freeport-Inventory.txt'), 'utf8')
const EOL = FIXTURE.includes('\r\n') ? '\r\n' : '\n'
const LINES = FIXTURE.split(/\r?\n/)
/** A worn row: a location with no `-Slot` part that is not a bag, bank or held slot. */
const isWorn = (loc: string): boolean => !/-Slot|^General|^Bank|^SharedBank|^Shared|^Held|^Cursor|^Location/.test(loc)

/** The fixture with every worn item rewritten by `f(name, index)` (return null to empty the slot). */
function crafted(f: (base: string, i: number) => string | null): string {
  let i = 0
  return LINES.map((line) => {
    const cols = line.split('\t')
    if (cols.length < 5 || !isWorn(cols[0] ?? '') || cols[1] === 'Empty') return line
    const base = (cols[1] ?? '').replace(/ \+\d+$/, '')
    const next = f(base, i++)
    if (next === null) return [cols[0], 'Empty', '0', '0', '0'].join('\t')
    return [cols[0], next, ...cols.slice(2)].join('\t')
  }).join(EOL)
}

function writeDump(installDir: string, text: string): void {
  const at = join(installDir, 'Primitive_freeport-Inventory.txt')
  writeFileSync(at, text, 'utf8')
  const now = new Date()
  utimesSync(at, now, now)
}

const sig = (m: M): string => `${one(m.empty?.text)}|${one(m.plan?.text)}|${String(m.rows.length)}|${one(m.unranked?.text)}|${m.rows.map((r: { tier: { text: string } }) => one(r.tier?.text)).join(',')}`

async function changed(page: Page, before: string, ms = 25_000): Promise<{ m: M; took: number; moved: boolean }> {
  const t0 = Date.now()
  const m = await settle(() => measure(page), (x) => sig(x) !== before, { timeoutMs: ms, pollMs: 250 })
  await sleep(1200)
  const settled = await measure(page)
  return { m: settled, took: Date.now() - t0, moved: sig(m) !== before }
}

function brief(tag: string, m: M): void {
  console.log(`\n--- ${tag} ---`)
  console.log(`  dump line: ${m.dumpLine === null ? 'ABSENT' : `"${one(m.dumpLine.text)}" title "${String(m.dumpLine.title)}"`}`)
  console.log(`  plan: "${one(m.plan?.text)}" sw/cw ${String(m.plan?.sw)}/${String(m.plan?.cw)} box ${JSON.stringify(m.plan?.rect)}`)
  console.log(`  empty: ${m.empty === null ? 'ABSENT' : `"${one(m.empty.text)}" rect ${JSON.stringify(m.empty.rect)} sw/cw ${String(m.empty.sw)}/${String(m.empty.cw)} hit ${String(m.empty.hit)}`}`)
  console.log(`  unranked: ${m.unranked === null ? 'ABSENT' : `"${one(m.unranked.text)}" rect ${JSON.stringify(m.unranked.rect)} sw/cw ${String(m.unranked.sw)}/${String(m.unranked.cw)} sh/ch ${String(m.unranked.sh)}/${String(m.unranked.ch)}`}`)
  console.log(`  rows: ${String(m.rows.length)}; panel ${JSON.stringify(m.panel?.rect)}; list ${m.list === null ? 'ABSENT' : JSON.stringify(m.list.rect)}`)
  console.log(`  controls: target "${one(m.targetValue)}" disabled ${String(m.target?.disabled)}; ${m.orders.map((o: { text: string; pressed: string; disabled: string | null }) => `${one(o.text)} pressed=${o.pressed} disabled=${String(o.disabled)}`).join(', ')}`)
}

async function main(): Promise<void> {
  buildIfStale()
  const { app, close, log } = await launchOnFixture('e2e-planner.log')
  const timer = bound(330_000, close)
  try {
    const page: Page = await mainWindow(app)
    await openTab(page)
    await sleep(2500)

    // S1: no dump at all.
    const s1 = await measure(page)
    save('3-S1-no-dump', s1)
    report('S1 no inventory dump, default window', s1)
    brief('S1 no dump', s1)

    // S1b: the controls in the empty state: does pressing one change anything a player can see?
    const viewBefore = one(s1.viewText)
    await page.click('[data-testid="gear-motes-order-gain"]', { timeout: 10_000 })
    await sleep(600)
    const s1b = await measure(page)
    console.log(`\nS1b pressed Biggest gain with no list: pressed now ${s1b.orders.map((o: { text: string; pressed: string }) => `${one(o.text)}=${o.pressed}`).join(', ')}; the view's words changed: ${String(one(s1b.viewText) !== viewBefore)}`)
    await page.click('[data-testid="gear-motes-order-recommended"]', { timeout: 10_000 })

    // S1c: the same empty state at 900 px.
    await resizeTo(app, page, 900, 760)
    const s1c = await measure(page)
    save('3-S1c-no-dump-900', s1c)
    report('S1c no inventory dump, 900 px', s1c)
    await resizeTo(app, page, 1280, 860)

    // S2: the player types the command: the committed dump lands while the tab is open.
    let before = sig(await measure(page))
    writeInventoryDump(log.installDir, 'Primitive_freeport-Inventory.txt')
    const s2 = await changed(page, before)
    save('3-S2-dump-arrives', s2.m)
    console.log(`\nS2 the dump arrived: moved ${String(s2.moved)} after ${String(s2.took)} ms`)
    brief('S2 dump arrived live', s2.m)

    // S3: every worn piece at +10.
    before = sig(s2.m)
    writeDump(log.installDir, crafted((b) => `${b} +10`))
    const s3 = await changed(page, before)
    save('3-S3-all-plus-10', s3.m)
    console.log(`\nS3 moved ${String(s3.moved)} after ${String(s3.took)} ms`)
    brief('S3 every worn piece +10', s3.m)
    report('S3 every worn piece +10', s3.m)

    // S4: everything +10, and one piece the item data does not know at +3 (the fixture's own
    // Djarn's Amethyst Ring is such a piece; it is left at its tier here).
    before = sig(s3.m)
    writeDump(log.installDir, crafted((b) => (b === "Djarn's Amethyst Ring" ? `${b} +3` : `${b} +10`)))
    const s4 = await changed(page, before, 12_000)
    save('3-S4-plus-10-and-unknown', s4.m)
    console.log(`\nS4 moved ${String(s4.moved)} after ${String(s4.took)} ms`)
    brief('S4 +10 and one unknown piece at +3', s4.m)

    // S5: a dump that wears nothing.
    before = sig(s4.m)
    writeDump(log.installDir, crafted(() => null))
    const s5 = await changed(page, before, 12_000)
    save('3-S5-wears-nothing', s5.m)
    console.log(`\nS5 moved ${String(s5.moved)} after ${String(s5.took)} ms`)
    brief('S5 a dump that wears nothing', s5.m)

    // S6: only pieces the item data does not know: many of them, to measure the line's length.
    before = sig(s5.m)
    writeDump(log.installDir, crafted((_b, i) => `Probe Unknown Piece Number ${String(i + 1)} of the Long Name +${String(i % 9)}`))
    const s6 = await changed(page, before, 12_000)
    save('3-S6-only-unknown', s6.m)
    console.log(`\nS6 moved ${String(s6.moved)} after ${String(s6.took)} ms`)
    brief('S6 only unknown pieces worn (22 of them)', s6.m)
    report('S6 only unknown pieces worn', s6.m)

    // S6b: a real list, plus many unknown pieces under it: does the line push the list out?
    before = sig(s6.m)
    writeDump(log.installDir, crafted((b, i) => (i % 2 === 0 ? `${b} +8` : `Probe Unknown Piece Number ${String(i + 1)} of the Long Name +${String(i % 9)}`)))
    const s6b = await changed(page, before, 12_000)
    save('3-S6b-list-and-unknown', s6b.m)
    console.log(`\nS6b moved ${String(s6b.moved)} after ${String(s6b.took)} ms`)
    report('S6b eleven +8 pieces and eleven unknown pieces', s6b.m)

    // S7: three +9 pieces, the rest +10: the longest ordinary plan line.
    before = sig(s6b.m)
    const nine = new Set(['Gauntlets of Fiery Might', 'Earring of Disease Reflection', 'Lustrous Russet Vambraces'])
    writeDump(log.installDir, crafted((b) => (nine.has(b) ? `${b} +9` : `${b} +10`)))
    const s7 = await changed(page, before, 12_000)
    save('3-S7-three-nines', s7.m)
    console.log(`\nS7 moved ${String(s7.moved)} after ${String(s7.took)} ms`)
    report('S7 three +9 pieces, default window', s7.m)

    // S7b: the same at 900 px.
    await resizeTo(app, page, 900, 760)
    const s7b = await measure(page)
    save('3-S7b-three-nines-900', s7b)
    report('S7b three +9 pieces, 900 px', s7b)
  } finally {
    clearTimeout(timer)
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
