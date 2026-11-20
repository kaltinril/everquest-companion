// zz-probe-combat-chart-1.mts: RECONNAISSANCE. What does each fixture's default fight hold, and
// what does the DPS card say about it at the default window? Throwaway, never committed.
import { waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, openCombat, rafFires, readChart, readDash, readHeader, requireBuilt, save, say, windowBounds } from './zz-probe-combat-chart-0.mjs'

const FIXTURES = process.argv.slice(2).length ? process.argv.slice(2) : ['e2e-combat.log', 'p2-pet-arc-bound.log', 'g1-group-lifecycle.log']

async function one(fixture: string): Promise<void> {
  console.log(`\n==================== ${fixture}`)
  const { app, close } = await launchOnFixture(fixture)
  const stop = bound(close, 150_000)
  try {
    const page = await mainWindow(app)
    await answerNotice(page)
    await openCombat(page)
    const hyd = await waitHydrated(page)
    say('hydrated ms', hyd.ms)
    say('window', await windowBounds(app, page))
    say('raf fires within 2s', await rafFires(page, 2000))
    const info = await page.evaluate(`window.eq.getCombatSnapshot({}).then((s) => ({
      hydrating: s.hydrating, selectedId: s.selectedId, zone: s.zone, inCombat: s.inCombat,
      selected: s.selected ? { kind: s.selected.kind, name: s.selected.name, active: s.selected.active, outTotal: s.selected.outTotal, outDps: s.selected.outDps, durationSec: s.selected.durationSec, activeSec: s.selected.activeSec, activeDps: s.selected.activeDps, entities: s.selected.entities.map((e) => ({ kind: e.kind, name: e.name, total: e.total, dps: e.dps, owner: e.owner })) } : null,
      segments: s.segments.slice(0, 40).map((g) => ({ kind: g.kind, id: g.id, name: g.name, total: g.total })),
      nSegments: s.segments.length,
      timeline: s.timeline ? { id: s.timeline.id, durationMs: s.timeline.durationMs, n: s.timeline.events.length, kinds: s.timeline.events.reduce((m, e) => { m[e.kind] = (m[e.kind] || 0) + (e.amount > 0 ? 1 : 0); return m }, {}), markers: s.timeline.markers.map((m) => m.kind), downsampled: s.timeline.downsampled, truncated: s.timeline.truncated } : null,
      roster: s.roster
    }))`)
    say('snapshot', info)
    save(`recon-${fixture}.snapshot.json`, info)
    const chart = await readChart(page)
    const header = await readHeader(page)
    const dash = await readDash(page)
    save(`recon-${fixture}.chart.json`, chart)
    save(`recon-${fixture}.header.json`, header)
    save(`recon-${fixture}.dash.json`, dash)
    const c = chart as { present: boolean; text?: string; legend?: { id: string; text: string }[]; lines?: string[]; peak?: unknown; rolling?: unknown }
    say('chart text', c.text ?? 'ABSENT')
    say('legend', (c.legend ?? []).map((l) => `${l.id}="${l.text}"`).join(' | '))
    say('lines', c.lines ?? [])
    say('header text', (header as { text?: string }).text ?? '')
    say('dash', { meterHead: dash.meterHead, rows: dash.rows, total: dash.total, headline: dash.headline, selector: dash.selector })
  } finally {
    stop()
    await close()
  }
}

async function main(): Promise<void> {
  requireBuilt()
  for (const f of FIXTURES) await one(f)
  console.log('\nprobe 1 done')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
