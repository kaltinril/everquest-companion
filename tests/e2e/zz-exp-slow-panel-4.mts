// zz-exp-slow-panel-4.mts: THROWAWAY. The real app (hidden) on a big staged log: when does main go
// live, what does getCombatSnapshot say for 30+ s after, what does main narrate, what do panels show.
//   node --import tsx tests/e2e/zz-exp-slow-panel-4.mts <logPath> <label> <afterLiveSec> <boundSec>
import { linkSync, readFileSync, existsSync, unlinkSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { engineDescendantsOf, engineTable, tapOutput } from './engineSteps.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { load } from './zz-exp-slow-panel-0.mjs'
import { execFileSync } from 'node:child_process'

const [src = '', label = 'app', afterArg = '40', boundArg = '600', outDir = ''] = process.argv.slice(2)
const AFTER_MS = Number(afterArg) * 1000
const BOUND_MS = Number(boundArg) * 1000

const SAMPLE = `(async () => {
  const t0 = performance.now();
  const combat = await window.eq.getCombatSnapshot({ timeline: true, maxSegments: 1 });
  const combatMs = Math.round(performance.now() - t0);
  let report = null;
  try { report = await window.eq.logReadReport(); } catch (e) { report = { err: String(e) }; }
  const content = document.querySelector('[data-testid="app-content"]');
  const text = content ? content.innerText : document.body.innerText;
  return {
    hydrating: combat ? combat.hydrating : 'none',
    combatMs,
    segments: combat && combat.segments ? combat.segments.length : -1,
    wait: report && report.wait, show: report && report.show, pct: report && report.pct, events: report && report.events,
    engine: report && report.engine, lastError: report && report.lastError, waitedMs: report && report.waitedMs,
    reading: /Reading log/i.test(document.body.innerText),
    text: text.replace(/\\s+/g, ' ').slice(0, 200)
  };
})()`

function rssMb(pid: number): number {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${String(pid)}).PrivateMemorySize64`], { encoding: 'utf8', timeout: 20_000 })
    return Math.round(Number(out.trim()) / 1048576)
  } catch {
    return -1
  }
}

async function main(): Promise<void> {
  const log = stageFixture('e2e-voice.log')
  // The staged copy is replaced by a HARD LINK to the generated log: no second copy on disk, and
  // the stage's dispose() removes only the link.
  unlinkSync(log.logPath)
  linkSync(src, log.logPath)
  const bytes = statSync(log.logPath).size
  const loadBefore = load()
  const t0 = Date.now()
  const launch = await launchOnFixture(log, { waitForEngine: false })
  const out = tapOutput(launch.app)
  let servingLineAt = 0
  const stampServing = (b: Buffer): void => {
    if (servingLineAt === 0 && b.toString().includes('data-server serving:')) servingLineAt = Date.now()
  }
  launch.app.process().stdout?.on('data', stampServing)
  launch.app.process().stderr?.on('data', stampServing)
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launch.close()
    await log.dispose()
  }
  const guard = setTimeout(() => {
    console.error('BOUND HIT: closing the app')
    void close().then(() => process.exit(2))
  }, BOUND_MS + 60_000)
  const lines: string[] = []
  const say = (s: string): void => {
    console.log(s)
    lines.push(s)
  }
  try {
    const page: Page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 120_000 })
    say(`[${label}] bytes=${String(bytes)} window up at +${String(Date.now() - t0)} ms, load before=${String(loadBefore)}`)
    // An independent 100 ms loop over the report alone, so a slow combat read cannot hide a change.
    const fast = { lastPctAt: 0, lastPct: -1, lastOffset: -1, lastOffsetAt: 0, caughtUpAt: 0, stop: false, samples: 0, maxGapMs: 0 }
    const fastLoop = (async (): Promise<void> => {
      let prev = Date.now()
      while (!fast.stop) {
        try {
          const r = (await page.evaluate('window.eq.logReadReport()')) as Record<string, any>
          const now = Date.now()
          fast.samples += 1
          fast.maxGapMs = Math.max(fast.maxGapMs, now - prev)
          prev = now
          if (typeof r.pct === 'number' && r.pct !== fast.lastPct) { fast.lastPct = r.pct; fast.lastPctAt = now }
          if (typeof r.offset === 'number' && r.offset !== fast.lastOffset) { fast.lastOffset = r.offset; fast.lastOffsetAt = now }
          if (fast.caughtUpAt === 0 && typeof r.engine === 'string' && /caught up/.test(r.engine)) fast.caughtUpAt = now
        } catch { if (closed) fast.stop = true }
        await sleep(100)
      }
    })()
    let servingAt = 0
    let firstFalseAt = 0
    let last = ''
    let lastPct = -1
    let lastPctAt = 0
    let liveSeenAt = 0
    let trueAfterLive = 0
    let falseAfterLive = 0
    let samplesAfterLive = 0
    const slowCalls: number[] = []
    while (Date.now() - t0 < BOUND_MS) {
      const s = (await page.evaluate(SAMPLE)) as Record<string, any>
      const now = Date.now()
      if (servingAt === 0 && servingLineAt !== 0) servingAt = servingLineAt
      if (typeof s.pct === 'number' && s.pct !== lastPct) {
        lastPct = s.pct
        lastPctAt = now
      }
      if (liveSeenAt === 0 && typeof s.engine === 'string' && /live/i.test(s.engine)) liveSeenAt = now
      if (servingAt !== 0) {
        samplesAfterLive += 1
        if (s.hydrating === true) trueAfterLive += 1
        else falseAfterLive += 1
        slowCalls.push(Number(s.combatMs))
      }
      if (firstFalseAt === 0 && s.hydrating === false) firstFalseAt = now
      const key = JSON.stringify([s.hydrating, s.wait, s.show, s.engine, s.reading, s.lastError, servingAt !== 0])
      if (key !== last) {
        last = key
        say(`[+${String(now - t0)} ms] hydrating=${String(s.hydrating)} combatMs=${String(s.combatMs)} wait=${String(s.wait)} show=${String(s.show)} pct=${String(s.pct)} engine="${String(s.engine)}" serving=${String(servingAt !== 0)} "Reading log" on screen=${String(s.reading)} lastError=${String(s.lastError)}\n     screen: ${JSON.stringify(s.text)}`)
      }
      if (servingAt !== 0 && now - servingAt > AFTER_MS) break
      await sleep(250)
    }
    fast.stop = true
    await fastLoop
    say(`[${label}] fast loop: ${String(fast.samples)} report samples (largest gap between two ${String(fast.maxGapMs)} ms); last progress pct change at +${String(fast.lastPctAt - t0)} ms (pct ${String(fast.lastPct)}), last offset change at +${String(fast.lastOffsetAt - t0)} ms (offset ${String(fast.lastOffset)} of ${String(bytes)}); report first said 'caught up' at +${String(fast.caughtUpAt === 0 ? -1 : fast.caughtUpAt - t0)} ms; main printed the go-live line at +${String(servingLineAt === 0 ? -1 : servingLineAt - t0)} ms`)
    say(`[${label}] go-live line at +${String(servingAt === 0 ? -1 : servingAt - t0)} ms; last progress change seen at +${String(lastPctAt - t0)} ms (pct ${String(lastPct)}); first hydrating=false at +${String(firstFalseAt === 0 ? -1 : firstFalseAt - t0)} ms`)
    say(`[${label}] after go-live: ${String(samplesAfterLive)} samples over ${String(Math.round((Date.now() - servingAt) / 1000))} s, hydrating true ${String(trueAfterLive)}, false ${String(falseAfterLive)}; getCombatSnapshot call ms min/median/max = ${String(Math.min(...slowCalls))}/${String(slowCalls.sort((a, b) => a - b)[Math.floor(slowCalls.length / 2)])}/${String(Math.max(...slowCalls))}`)

    // What each tab says now.
    for (const v of ['overview', 'combat', 'loot', 'leveling', 'skills']) {
      await page.evaluate(`document.querySelector('[data-testid="nav-${v}"]')?.click()`)
      await sleep(2500)
      const txt = (await page.evaluate(`(document.querySelector('[data-testid="app-content"]') || document.body).innerText.replace(/\\s+/g,' ').slice(0,260)`)) as string
      say(`   [tab ${v}] ${JSON.stringify(txt)}`)
    }
    // Per-module time through the whole path (renderer -> main -> engine -> main -> renderer).
    const mods = (await page.evaluate(`(async () => {
      const out = {};
      for (const m of ['loot','kills','progression','gaps','eventFeed','messageOverlay','skills','respawn']) {
        const t = performance.now(); const s = await window.eq.getModuleSnapshot(m);
        out[m] = [Math.round(performance.now() - t), s === null ? 'null' : JSON.stringify(s).length];
      }
      const t = performance.now(); const c = await window.eq.getCombatSnapshot({ showUnparsed: false, maxSegments: 100, timeline: true, archived: true });
      out['combatTab'] = [Math.round(performance.now() - t), c.hydrating ? 'hydrating' : JSON.stringify(c).length];
      return out;
    })()`)) as Record<string, unknown>
    say(`[${label}] through the app [ms, chars]: ${JSON.stringify(mods)}`)

    const appPid = launch.app.process().pid ?? -1
    const engines = engineDescendantsOf(engineTable(), appPid) ?? []
    say(`[${label}] app pid ${String(appPid)} main MB=${String(rssMb(appPid))}; engine pids ${JSON.stringify(engines)} MB=${JSON.stringify(engines.map(rssMb))}; load after=${String(load())}`)
    const dev = out.text().split(/\r?\n/).filter((l) => /data-server (shim|serving|link|client)|unanswered|too large|exceeded|health probe|not answering|reply|engine died|gave up|given up/i.test(l))
    say(`[${label}] dev log (${String(dev.length)} matching lines; first 40 and last 15):`)
    for (const l of dev.slice(0, 40)) say(`   | ${l.slice(0, 300)}`)
    if (dev.length > 55) say('   | ...')
    for (const l of dev.slice(Math.max(40, dev.length - 15))) say(`   | ${l.slice(0, 300)}`)
    const slow = join(launch.userData, 'slow-reads.log')
    say(`[${label}] slow-reads.log: ${existsSync(slow) ? readFileSync(slow, 'utf8').trim().split(/\r?\n/).slice(-12).join('\n   | ') : '(none)'}`)
  } finally {
    clearTimeout(guard)
    await close()
    if (outDir !== '') {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `app-${label}.txt`), lines.join('\n'))
    }
  }
}

main().catch((err: unknown) => {
  console.error('exp error:', err)
  process.exitCode = 1
})
