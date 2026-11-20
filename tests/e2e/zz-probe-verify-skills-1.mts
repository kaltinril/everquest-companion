// zz-probe-verify-skills-1.mts: THROWAWAY verify. Real EQ skill names only, November dates.
import type { Page } from 'playwright-core'
import { sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, openSkills, requireBuilt, resizeTo, setScale, waitRows } from './zz-probe-skills-0.mjs'

const SHORT = ['Divination', 'Abjuration', 'Mend', 'Athletics', 'Conjuration', 'Evocation', 'Alteration', 'Round Kick', 'Dual Wield', 'Channeling', 'Meditate', '1H Blunt', 'Bash', 'Double Attack', 'Defense', 'Dodge', 'Hand to Hand', 'Offense', 'Block', 'Feign Death']
const LONG = ['Percussion Instruments', 'Specialize Divination', 'Stringed Instruments']
const variant = process.argv[2] ?? 'short'
const hour = Number(process.argv[3] ?? '22')

function summary(tag: string, m: any): void {
  const hs = m.rows.map((r: any) => r.h)
  const counts: Record<string, number> = {}
  for (const h of hs) counts[String(h)] = (counts[String(h)] ?? 0) + 1
  const wrapped = m.rows.filter((r: any) => r.cells.some((c: any) => c.th !== null && c.th > 30)).map((r: any) => r.cells.filter((c: any) => c.th > 30).map((c: any) => `${c.text.replace(/\n/g, '/')}(${String(c.th)})`).join(','))
  const vis = m.rows.filter((r: any) => r.visible).length
  console.log(`\n== ${variant} h${String(hour)} ${tag} vw=${String(m.vw)} table w=${String(m.table.rect.w)} sw/cw=${String(m.scroller.cut.sw)}/${String(m.scroller.cut.cw)} rowHeights=${JSON.stringify(counts)} visibleRows=${String(vis)}`)
  console.log('heads:', m.head.map((h: any) => `${h.text.replace(/\n/g, '/')} w${String(h.rect.w)} h${String(h.rect.h)} th${String(h.textRect?.h)}`).join(' | '))
  console.log('row0:', m.rows[0].cells.map((c: any) => `${c.text} w${String(c.w)} th${String(c.th)}`).join(' | '))
  console.log('wrapped cells (first 6):', JSON.stringify(wrapped.slice(0, 6)), 'of', wrapped.length)
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const now = new Date()
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, hour, 10, 30)
  const names = variant === 'long' ? [...SHORT, ...LONG] : SHORT
  log.appendAt(new Date(y.getTime() - 60_000), 'Welcome to EverQuest Legends!')
  names.forEach((s, i) => log.appendAt(new Date(y.getTime() + i * 20_000), `You have become better at ${s}! (${String(10 + i)})`))
  const launch = await launchOnFixture(log)
  const done = bound(async () => { await launch.close(); await log.dispose() }, 150_000)
  try {
    const page: Page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    await answerNotice(page)
    await openSkills(page)
    await waitRows(page, names.length)
    await sleep(800)
    summary('default', await measure(page))
    await resizeTo(launch.app, page, 900, 600)
    summary('900x600', await measure(page))
    await setScale(page, 1.25)
    summary('900x600@125', await measure(page))
    await setScale(page, 1)
  } finally {
    done()
    await launch.close()
    await log.dispose()
  }
}
main().catch((err: unknown) => { console.error('probe error:', err); process.exitCode = 1 })
