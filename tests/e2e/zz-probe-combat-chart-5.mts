// zz-probe-combat-chart-5.mts: TWO SIDE CHECKS on e2e-combat.log.
//  A. A STRANGER (no group, no roster) hits the mob you are fighting: what do the chart's legend
//     and hover call that damage, and what does the meter row call it?
//  B. Every em dash or en dash in the text and the title attributes of the Combat tab, the
//     Overview tab and Preferences > Combat.
// Throwaway, never committed.
import type { Page } from 'playwright-core'
import { settle, sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, hoverPlot, openCombat, pointerAway, rafFires, readChart, readDash, requireBuilt, say, setLayoutKey, shimRaf } from './zz-probe-combat-chart-0.mjs'

function dashScan(page: Page): Promise<unknown> {
  return page.evaluate(`(() => {
    const bad = [];
    const re = /[\\u2013\\u2014]/;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue)) bad.push({ where: 'text', s: n.nodeValue.trim().slice(0, 120) });
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && re.test(v)) bad.push({ where: a, s: v.slice(0, 160) }); }
    return bad;
  })()`)
}

async function main(): Promise<void> {
  requireBuilt()
  const { app, close, log } = await launchOnFixture('e2e-combat.log')
  const stop = bound(close, 240_000)
  let timer: ReturnType<typeof setInterval> | null = null
  try {
    const page = await mainWindow(app)
    await answerNotice(page)
    await openCombat(page)
    await waitHydrated(page)
    if (!(await rafFires(page, 2000))) await shimRaf(page)
    say('dashes: Combat tab (finished fight)', await dashScan(page))

    const mob = 'a fire giant warrior'
    const t0 = Date.now() - 40_000
    for (let s = 0; s <= 19; s++) {
      const at = new Date(t0 + s * 2000)
      log.appendAt(at, `You crush ${mob} for ${String(40 + (s % 5) * 7)} points of damage.`, `Zebuxoruk slashes ${mob} for ${String(90 + (s % 4) * 10)} points of damage.`)
    }
    timer = setInterval(() => { log.append(`You crush ${mob} for 44 points of damage.`, `Zebuxoruk slashes ${mob} for 95 points of damage.`) }, 2000)
    const live = await settle(() => page.evaluate(`window.eq.getCombatSnapshot({}).then((s) => ({ inCombat: s.inCombat, name: s.selected ? s.selected.name : null, active: s.selected ? s.selected.active : null, ents: s.selected ? s.selected.entities.map((e) => e.kind + ':' + e.name + ':' + e.total) : [], roster: s.roster }))`) as Promise<{ inCombat: boolean; active: boolean | null; ents: string[] }>, (v) => v.active === true && v.ents.length >= 2, { timeoutMs: 20_000 })
    say('live fight with a stranger', live)
    await sleep(1500)

    for (const layout of ['nested', 'separate'] as const) {
      await setLayoutKey(page, layout)
      await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
      await page.waitForSelector('[data-testid="combat-dashboard"]', { timeout: 30_000 })
      await sleep(900)
      for (const scope of ['everyone', 'group', 'you']) {
        await page.click(`[data-testid="meter-scope-${scope}"]`, { timeout: 10_000 })
        await sleep(600)
        const dash = await readDash(page)
        const chart = (await readChart(page)) as { legend?: { id: string; text: string }[]; peak?: { text: string } | null; lines?: string[] }
        const h = (await hoverPlot(page, '', 0.6)) as { tip?: { rows: string[] } | null }
        await pointerAway(page)
        say(`[${layout}/${scope}]`, { header: (await page.evaluate(`document.querySelector('[data-testid="combat-header"]').innerText.replace(/[ \\n\\t]+/g, ' ').trim()`)), meterHead: dash.meterHead, rows: (dash.rows as { text: string }[]).map((r) => r.text), legend: (chart.legend ?? []).map((l) => `${l.id}="${l.text}"`), lines: chart.lines, peak: chart.peak?.text, hover: h.tip?.rows ?? null })
      }
      await page.click('[data-testid="meter-scope-everyone"]', { timeout: 10_000 })
    }
    say('roster popover text', await (async () => {
      await page.click('[data-testid="roster-open"]')
      await sleep(500)
      const t = await page.evaluate(`(() => { const p = document.querySelector('[data-testid="roster-popover"]'); return p ? p.innerText.replace(/[ \\n\\t]+/g, ' ').trim() : null; })()`)
      await page.click('[data-testid="roster-open"]')
      return t
    })())
    say('dashes: Combat tab (live)', await dashScan(page))
    await page.click('[data-testid="view-toggle"] button:nth-child(2)').catch(() => undefined)
    await sleep(700)
    say('dashes: Combat timeline', await dashScan(page))
    await page.click('[data-testid="view-toggle"] button:nth-child(1)').catch(() => undefined)
    await page.click('[data-testid="nav-overview"]', { timeout: 30_000 })
    await page.waitForSelector('[data-testid="overview-grid"]', { timeout: 30_000 })
    await sleep(900)
    const ov = (await readChart(page, '[data-testid="overview-dps-curve"]')) as { lines?: string[]; peak?: { text: string } | null }
    const oh = (await hoverPlot(page, '[data-testid="overview-dps-curve"]', 0.6)) as { tip?: { rows: string[] } | null }
    await pointerAway(page)
    say('[separate] OVERVIEW curve card with a stranger', { lines: ov.lines, peak: ov.peak?.text, hover: oh.tip?.rows ?? null, damageCard: await page.evaluate(`document.querySelector('[data-testid="overview-dps"]').innerText.replace(/[ \\n\\t]+/g, ' ').trim().slice(0, 300)`) })
    say('dashes: Overview', await dashScan(page))
    await setLayoutKey(page, 'nested')
    say('dashes: Preferences > Combat', await dashScan(page))
  } finally {
    if (timer) clearInterval(timer)
    stop()
    await close()
  }
  console.log('\nprobe 5 done')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
