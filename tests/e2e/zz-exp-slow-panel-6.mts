// zz-exp-slow-panel-6.mts: THROWAWAY. Plan experiment 18: a STARVED engine. The app's own engine
// (a child of this script's launch) is pinned to one core, and N busy loops this script spawns are
// pinned to the same core, so the engine gets about 1/(N+1) of it. Nothing else is touched.
//   node --import tsx tests/e2e/zz-exp-slow-panel-6.mts <logPath> <label> <burnersPhase1> <burnersPhase2> [outDir]
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { tapOutput } from './engineSteps.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { load } from './zz-exp-slow-panel-0.mjs'

const [src = '', label = 'starve', k1Arg = '3', k2Arg = '12', outDir = ''] = process.argv.slice(2)
const CORE_MASK = 0x8000 // logical processor 15

function ps(cmd: string): string {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 30_000 }).trim()
  } catch (e) {
    return `ERR ${String(e).slice(0, 120)}`
  }
}

/** engined.exe processes that descend from THIS node process, and from nothing else. */
function myEngines(): number[] {
  const out = ps(
    `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name; ` +
      `function kids($p){ $all | Where-Object { $_.ParentProcessId -eq $p } | ForEach-Object { if ($_.Name -eq 'engined.exe') { $_.ProcessId }; kids $_.ProcessId } }; kids ${String(process.pid)}`
  )
  return out.split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0)
}

const SAMPLE = (opts: string): string => `(async () => {
  const t0 = performance.now();
  const combat = await window.eq.getCombatSnapshot(${opts});
  const ms = Math.round(performance.now() - t0);
  const report = await window.eq.logReadReport();
  const content = document.querySelector('[data-testid="app-content"]');
  return { hydrating: combat.hydrating, ms, rows: combat.selected && combat.selected.incoming ? combat.selected.incoming.length : -1,
    wait: report.wait, show: report.show, lastError: report.lastError,
    reading: /Reading log/i.test(document.body.innerText),
    text: (content ? content.innerText : '').replace(/\\s+/g, ' ').slice(0, 330) };
})()`

async function main(): Promise<void> {
  const log = stageFixture('e2e-voice.log')
  unlinkSync(log.logPath)
  linkSync(src, log.logPath)
  const lines: string[] = []
  const say = (s: string): void => {
    console.log(s)
    lines.push(s)
  }
  const burners: ChildProcess[] = []
  const launch = await launchOnFixture(log, { waitForEngine: false })
  const out = tapOutput(launch.app)
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    for (const b of burners) b.kill()
    await launch.close()
    await log.dispose()
  }
  const guard = setTimeout(() => void close().then(() => process.exit(2)), 420_000)
  const t0 = Date.now()
  try {
    const page: Page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 120_000 })
    const tWait = Date.now()
    while (!out.said('data-server serving:') && Date.now() - tWait < 120_000) await sleep(200)
    say(`[${label}] log ${String(statSync(src).size)} bytes; go-live seen at +${String(Date.now() - t0)} ms; load=${String(load())}`)
    const engines = myEngines()
    say(`[${label}] my engine pids: ${JSON.stringify(engines)}`)
    if (engines.length !== 1) throw new Error('could not single out my own engine; stopping without touching anything')
    const engine = engines[0]!

    const phase = async (name: string, ms: number, opts: string): Promise<void> => {
      const until = Date.now() + ms
      const calls: number[] = []
      let hyd = 0
      let served = 0
      let last = ''
      const devBefore = out.text().length
      while (Date.now() < until) {
        const s = (await page.evaluate(SAMPLE(opts))) as Record<string, any>
        calls.push(Number(s.ms))
        if (s.hydrating === true) hyd += 1
        else served += 1
        const key = JSON.stringify([s.hydrating, s.wait, s.show, s.lastError, s.reading, s.text.slice(0, 120)])
        if (key !== last) {
          last = key
          say(`   [${name} +${String(Date.now() - t0)} ms] hydrating=${String(s.hydrating)} callMs=${String(s.ms)} rows=${String(s.rows)} wait=${String(s.wait)} show=${String(s.show)} lastError=${String(s.lastError)} "Reading log" on screen=${String(s.reading)}\n        screen: ${JSON.stringify(s.text)}`)
        }
        await sleep(200)
      }
      calls.sort((a, b) => a - b)
      say(`[${label}] phase ${name}: ${String(calls.length)} getCombatSnapshot calls, served ${String(served)}, hydrating ${String(hyd)}; call ms min/median/max ${String(calls[0])}/${String(calls[Math.floor(calls.length / 2)])}/${String(calls[calls.length - 1])}; load=${String(load())}`)
      const dev = out.text().slice(devBefore).split(/\r?\n/).filter((l) => /data-server (shim|link|client)|unanswered|too large|health probe|refused|given up|died|restart/i.test(l))
      for (const l of dev.slice(0, 14)) say(`      | ${l.slice(0, 260)}`)
      if (dev.length > 14) say(`      | ... ${String(dev.length - 14)} more`)
    }
    const starve = (n: number): void => {
      while (burners.length < n) {
        const b = spawn(process.execPath, ['-e', 'const end=Date.now()+360000;while(Date.now()<end){}'], { stdio: 'ignore', windowsHide: true })
        burners.push(b)
        ps(`(Get-Process -Id ${String(b.pid)}).ProcessorAffinity = ${String(CORE_MASK)}`)
      }
      say(`[${label}] ${String(burners.length)} busy loops of my own now share logical processor 15 with my engine (pid ${String(engine)}); engine affinity = ${ps(`(Get-Process -Id ${String(engine)}).ProcessorAffinity`)}`)
    }

    const OVERVIEW = '{ timeline: true, maxSegments: 1 }'
    await phase('0 unstarved, Overview options', 20_000, OVERVIEW)
    say(`[${label}] pinning my engine: ${ps(`(Get-Process -Id ${String(engine)}).ProcessorAffinity = ${String(CORE_MASK)}; 'ok'`)}`)
    starve(Number(k1Arg))
    await phase(`1 starved x${k1Arg}, Overview options`, 45_000, OVERVIEW)
    // A second surface with its own options key, asked together with the first.
    const both = (await page.evaluate(`(async () => {
      const t = performance.now();
      const r = await Promise.all([
        window.eq.getCombatSnapshot({ timeline: true, maxSegments: 1 }).then((c) => ['overview', Math.round(performance.now() - t), c.hydrating]),
        window.eq.getCombatSnapshot({ showUnparsed: false, maxSegments: 100, timeline: true, archived: true }).then((c) => ['combatTab', Math.round(performance.now() - t), c.hydrating]),
        window.eq.getCombatSnapshot({ maxSegments: 30 }).then((c) => ['overlay', Math.round(performance.now() - t), c.hydrating]),
        window.eq.getModuleSnapshot('skills').then((s) => ['module skills', Math.round(performance.now() - t), s === null ? 'null' : 'served']),
        window.eq.getModuleSnapshot('progression').then((s) => ['module progression', Math.round(performance.now() - t), s === null ? 'null' : 'served'])
      ]);
      return r;
    })()`)) as unknown[]
    say(`[${label}] three option keys and two modules asked at once while starved x${k1Arg}: ${JSON.stringify(both)}`)
    await sleep(12_000)
    starve(Number(k2Arg))
    await phase(`2 starved x${k2Arg}, Overview options`, 70_000, OVERVIEW)
    const mods = (await page.evaluate(`(async () => {
      const t = performance.now();
      return Promise.all(['skills','progression','loot','kills'].map((m) => window.eq.getModuleSnapshot(m).then((s) => [m, Math.round(performance.now() - t), s === null ? 'null' : 'served'])));
    })()`)) as unknown[]
    say(`[${label}] four modules asked at once while starved x${k2Arg}: ${JSON.stringify(mods)}`)
    for (const b of burners) b.kill()
    burners.length = 0
    say(`[${label}] busy loops stopped; engine unpinned: ${ps(`(Get-Process -Id ${String(engine)}).ProcessorAffinity = 65535; 'ok'`)}`)
    await phase('3 recovered, Overview options', 20_000, OVERVIEW)
    const slow = join(launch.userData, 'slow-reads.log')
    say(`[${label}] slow-reads.log:\n   | ${existsSync(slow) ? readFileSync(slow, 'utf8').trim().split(/\r?\n/).slice(-10).join('\n   | ') : '(none)'}`)
  } finally {
    clearTimeout(guard)
    await close()
    if (outDir !== '') {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `starve-${label}.txt`), lines.join('\n'))
    }
  }
}

main().catch((err: unknown) => {
  console.error('exp error:', err)
  process.exitCode = 1
})
