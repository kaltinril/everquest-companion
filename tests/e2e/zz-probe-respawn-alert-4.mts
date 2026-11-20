// THROWAWAY PROBE 4 (key: respawn-alert): the row cap. 70 watched mobs killed in the zone you stand
// in: does the Timers tab draw all 70, does the switch's count agree, is the last one reachable?
import { buildIfStale, countOf, settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bodyText, install, m, say, view } from './zz-probe-respawn-alert-0.mjs'

const N = 70

async function main(): Promise<void> {
  buildIfStale()
  const launched = await launchOnFixture('e2e-leveling.log')
  const killer = setTimeout(() => {
    console.log('PROBE TIMER: closing the app')
    void launched.close().finally(() => process.exit(2))
  }, 4 * 60_000)
  try {
    const page = await mainWindow(launched.app)
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 60_000 })
    await install(page)
    await answerNotice(page)
    await page.click('[data-testid="nav-timers"]', { timeout: 30_000 })
    await settle(() => countOf(page, '[data-testid="timers-view"]'), (n) => n === 1, { timeoutMs: 30_000 })

    const names = Array.from({ length: N }, (_v, i) => `a probe ghoul ${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`)
    // oldest first, one second apart, the newest death now
    const now = Date.now()
    names.forEach((name, i) => launched.log.appendAt(new Date(now - (N - i) * 1000), `You have slain ${name}!`))
    const offered = await settle(() => countOf(page, '[data-testid="respawn-candidate"]'), (n) => n >= N, { timeoutMs: 30_000 })
    say('cap', `Recently killed offers ${String(offered)} entries after ${String(N)} played deaths (it also holds the fixture's own)`)
    const watched = await page.evaluate(async (list) => {
      const eq = (window as unknown as { eq: { watchRespawn: (k: string, d: string) => Promise<boolean> } }).eq
      let ok = 0
      for (const name of list) if (await eq.watchRespawn(name, name)) ok++
      return ok
    }, names)
    say('cap', `watched through the tab's own bridge: ${String(watched)} of ${String(N)}`)
    const rows = await settle(() => countOf(page, '[data-testid="respawn-row"]'), (n) => n >= N, { timeoutMs: 30_000 })
    await sleep(1500)
    say('cap', `clock rows drawn on the Timers tab: ${String(rows)} (watched ${String(N)}, all killed in the zone stood in)`)
    say('cap', `scope switch says: ${await bodyText(page, '[data-testid="respawn-scope"]')}`)
    const drawn = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="respawn-row"]')).map((r) => r.getAttribute('data-respawn-mob') ?? ''))
    const missing = names.filter((n) => !drawn.includes(n))
    say('cap', `watched names with NO row: ${String(missing.length)} ${JSON.stringify(missing.slice(0, 12))}`)
    say('cap', `view ${JSON.stringify(await view(page))}`)
    const scroller = (await m(page, '[data-testid="timers-view"]'))[0]
    say('cap', `timers-view scroller: rect=${JSON.stringify(scroller.rect)} scrollH/clientH=${String(scroller.sh)}/${String(scroller.ch)} scrollW/clientW=${String(scroller.sw)}/${String(scroller.cw)} overflow=${scroller.overflow}`)
    // the last row: reachable by scrolling the page's own scroller?
    await page.evaluate(() => {
      const v = document.querySelector('[data-testid="timers-view"]') as HTMLElement | null
      if (v) v.scrollTop = v.scrollHeight
    })
    await sleep(1500)
    const all = await m(page, '[data-testid="respawn-row"]')
    const last = all[all.length - 1]
    say('cap', `after scrolling to the bottom, the last row: "${last.text}" rect=${JSON.stringify(last.rect)} outOfViewport=${String(last.outOfViewport)} hit=${last.hit} clippedBy=${last.clippedBy}`)
    say('cap', `first row text (a row with a kill and no estimate): "${all[0].text}"`)
    await page.evaluate(() => {
      const v = document.querySelector('[data-testid="timers-view"]') as HTMLElement | null
      if (v) v.scrollTop = 0
    })
    await sleep(1200)
    const ctl = (await m(page, 'label:has([data-testid="respawn-alert-on"])'))[0]
    say('cap', `the alert control with ${String(rows)} rows under it: rect=${JSON.stringify(ctl.rect)} hit=${ctl.hit}`)
    say('cap', `Clear all button: ${JSON.stringify((await m(page, '[data-testid="respawn-clear-all"]')).map((x) => ({ text: x.text, disabled: x.disabled })))}`)

    // walk out of the zone: what the tab says of the 70 clocks left behind
    launched.log.append('You have entered Befallen.')
    await settle(() => countOf(page, '[data-testid="respawn-row"]'), (n) => n === 0, { timeoutMs: 30_000 })
    await sleep(1200)
    say('cap', `zoned to Befallen: scope switch says: ${await bodyText(page, '[data-testid="respawn-scope"]')} | empty line: ${await bodyText(page, '[data-testid="respawn-empty"]')}`)
    await page.click('[data-testid="respawn-scope-all"]')
    await sleep(1500)
    say('cap', `All zones view draws ${String(await countOf(page, '[data-testid="respawn-row"]'))} rows; switch says: ${await bodyText(page, '[data-testid="respawn-scope"]')}`)
    const storeCount = await page.evaluate(() => (window as unknown as { eq: { getRespawn: () => Promise<{ watches: unknown[] }> } }).eq.getRespawn().then((p) => p.watches.length))
    say('cap', `watches in the store: ${String(storeCount)}`)
    // and back in
    launched.log.append("You have entered Nagafen's Lair.")
    await sleep(3000)
    say('cap', `back in Nagafen's Lair: switch says: ${await bodyText(page, '[data-testid="respawn-scope"]')}; rows drawn (all zones view) ${String(await countOf(page, '[data-testid="respawn-row"]'))}`)
    await page.click('[data-testid="respawn-scope-zone"]')
    await sleep(1500)
    say('cap', `zone view: rows drawn ${String(await countOf(page, '[data-testid="respawn-row"]'))}; switch says: ${await bodyText(page, '[data-testid="respawn-scope"]')}`)
  } catch (err) {
    console.log(`PROBE ERROR: ${String(err)}`)
    process.exitCode = 1
  } finally {
    clearTimeout(killer)
    await launched.close()
    console.log('app closed')
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error -', err)
  process.exitCode = 1
})
