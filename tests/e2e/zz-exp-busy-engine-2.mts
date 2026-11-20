// zz-exp-busy-engine-2.mts: THROWAWAY. Launches the real app (hidden window, throwaway userData)
// on one staged install folder, reads the dev log with arrival times, samples OUR engine process
// (the engined.exe child of the Electron process this launch returned) and what the Overview shows.
//   node --import tsx tests/e2e/zz-exp-busy-engine-2.mts --install <dir holding Logs/> --label <name>
//        [--mode none|idle1|below1|normal1|tree2|tree2n] [--core N] [--runSec N] [--afterLive N]
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { ENGINE_BIN, MAIN_ENTRY } from './appHarness.mjs'
import { launchApp, mainWindow } from './appWindow.mjs'
import { arg, loadSummary, mb, save, sleep, startBurner, startSampler } from './zz-exp-busy-engine-0.mjs'

const INSTALL = arg('install')
const LABEL = arg('label', 'app')
const MODE = arg('mode', 'none')
const CORE = Number(arg('core', '0'))
const RUN_SEC = Number(arg('runSec', '900'))
const AFTER_LIVE = Number(arg('afterLive', '35'))
const LOG = join(INSTALL, 'Logs', 'eqlog_Primitive_freeport.txt')

const SCREEN = `(async () => {
  const q = (s) => document.querySelector(s);
  const box = q('[data-testid="log-read-report"]');
  let hydrating = 'n/a';
  try {
    const snap = await Promise.race([window.eq.getCombatSnapshot({}), new Promise((r) => setTimeout(() => r('slow>4s'), 4000))]);
    hydrating = snap === 'slow>4s' ? snap : (snap ? String(snap.hydrating) : 'null');
  } catch (e) { hydrating = 'threw'; }
  const lines = document.body.innerText.split('\\n').map((s) => s.trim())
    .filter((s) => /reading log|catching up|connecting|data engine|restarted|%|waiting|try again|stopped|cannot/i.test(s)).slice(0, 8);
  return { overviewHydrating: !!q('[data-testid="overview-hydrating"]'), combatHydrating: !!q('[data-testid="combat-hydrating"]'), box: box ? box.innerText.replace(/\\s+/g, ' ').slice(0, 700) : null, hydrating, lines };
})()`

const KEYS: Record<string, string> = {
  spawning: 'data-server engine: spawning',
  ready: 'data-server engine ready:',
  attached: 'data-server engine attached:',
  serving: 'data-server serving:',
  stillFolding: 'still folding',
  probeFailed: 'health probe failed',
  servingEngineDied: 'a serving engine died',
  restartingIn: 'data-server engine: restarting in',
  killEscalated: 'no exit on stdin EOF; escalating to kill',
  healthRefused: 'session.health was refused',
  unanswered: 'went unanswered',
  localSocket: 'could not open a socket',
  linkLost: 'connection'
}

async function main(): Promise<void> {
  if (!existsSync(MAIN_ENTRY) || !existsSync(ENGINE_BIN)) throw new Error('no build')
  const size = statSync(LOG).size
  const tLaunch = Date.now()
  const launched = await launchApp({ installDir: INSTALL })
  const dev: { t: number; line: string }[] = []
  let partial = ''
  const take = (b: Buffer): void => {
    partial += b.toString()
    for (;;) {
      const nl = partial.indexOf('\n')
      if (nl === -1) break
      const line = partial.slice(0, nl).replace(/\r$/, '')
      partial = partial.slice(nl + 1)
      if (line.trim() !== '') dev.push({ t: Date.now() - tLaunch, line })
    }
  }
  const proc = launched.app.process()
  proc.stdout?.on('data', take)
  proc.stderr?.on('data', take)
  const electronPid = proc.pid ?? 0
  const nBurners = MODE === 'none' ? 0 : MODE.startsWith('tree') ? 2 : 1
  const burners = Array.from({ length: nBurners }, () => startBurner())
  const mask = MODE.startsWith('tree') ? 2 ** CORE + 2 ** (CORE + 1) : 2 ** CORE
  const sampler = startSampler({ parentPid: electronPid, mode: MODE, mask, burners: burners.map((b) => b.pid ?? 0) })
  console.log(`${LABEL}: app up after ${String(Date.now() - tLaunch)} ms, electron pid ${String(electronPid)}, mode ${MODE}, log ${String(size)} bytes`)
  let closed = false
  const closeAll = async (): Promise<void> => {
    if (closed) return
    closed = true
    for (const b of burners) b.kill()
    await launched.close()
    await sleep(3000)
    sampler.stop()
    // any engine of OURS that outlived the app (children of our own Electron only)
    const mine = [...new Set(sampler.rows.map((r) => r.pid))]
    for (const pid of mine) {
      try {
        const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p = Get-Process -Id ${String(pid)} -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -like 'engined*') { Stop-Process -Id ${String(pid)} -Force; 'stopped our leftover engine ${String(pid)}' }`], { encoding: 'utf8' })
        if (out.trim() !== '') console.log(out.trim())
      } catch { /* gone */ }
    }
  }
  const hard = setTimeout(() => {
    console.log(`!! ${LABEL}: exceeded its bound, closing`)
    void closeAll().finally(() => process.exit(3))
  }, (RUN_SEC + 120) * 1000)
  const screen: { t: number; s: unknown }[] = []
  try {
    let page: Page | null = null
    void mainWindow(launched.app, 120_000).then(async (p) => {
      page = p
      await p.evaluate('(() => { const n = document.querySelector(\'[data-testid="nav-overview"]\'); if (n) n.click(); })()').catch(() => undefined)
    }).catch(() => undefined)
    let liveAt: number | null = null
    let lastScreen = ''
    let lastSay = 0
    for (;;) {
      const t = Date.now() - tLaunch
      if (liveAt === null) {
        const hit = dev.find((d) => d.line.includes(KEYS.serving))
        if (hit) { liveAt = hit.t; console.log(`${LABEL}: go-live line at +${String(liveAt)} ms`) }
      }
      if (page !== null) {
        const p: Page = page
        const s = await Promise.race([p.evaluate(SCREEN).catch((e: unknown) => ({ error: String(e).slice(0, 120) })), sleep(8000).then(() => ({ error: 'renderer did not answer in 8 s' }))])
        const key = JSON.stringify(s)
        if (key !== lastScreen) { lastScreen = key; screen.push({ t: Date.now() - tLaunch, s }) }
      }
      if (t - lastSay > 60_000) {
        lastSay = t
        const e = sampler.rows.at(-1)
        console.log(`${LABEL}: +${String(Math.round(t / 1000))} s, engines seen ${String(new Set(sampler.rows.map((r) => r.pid)).size)}, private ${e ? String(mb(e.privateBytes)) : '?'} MiB, probe failures ${String(dev.filter((d) => d.line.includes(KEYS.probeFailed)).length)}, engine deaths ${String(dev.filter((d) => d.line.includes(KEYS.servingEngineDied)).length)}`)
      }
      if (liveAt !== null && t > liveAt + AFTER_LIVE * 1000) break
      if (t > RUN_SEC * 1000) break
      await sleep(2000)
    }
    const pids = [...new Set(sampler.rows.map((r) => r.pid))]
    const engines = pids.map((pid) => {
      const rows = sampler.rows.filter((r) => r.pid === pid)
      const first = rows[0], last = rows[rows.length - 1]
      return { pid, startedAtMs: first.startedAt - tLaunch, lastSeenMs: last.at - tLaunch, livedS: Math.round((last.at - first.startedAt) / 100) / 10, peakPrivateMiB: mb(Math.max(...rows.map((r) => r.privateBytes))), lastPrivateMiB: mb(last.privateBytes), cpuS: Math.round(last.cpuMs / 100) / 10, priority: last.priority, affinity: last.affinity }
    })
    const counts: Record<string, number> = {}
    for (const [k, needle] of Object.entries(KEYS)) counts[k] = dev.filter((d) => d.line.includes(needle)).length
    const memAtLive = liveAt === null ? null : (() => {
      const r = sampler.rows.filter((x) => x.at - tLaunch >= (liveAt as number)).at(0) ?? sampler.rows.at(-1)
      return r ? { pid: r.pid, privateMiB: mb(r.privateBytes), workingSetMiB: mb(r.workingSet), peakPagedMiB: mb(r.peakPaged), cpuS: Math.round(r.cpuMs / 100) / 10, atMs: r.at - tLaunch } : null
    })()
    const firstEngineStart = engines.length > 0 ? engines[0].startedAtMs : null
    const readS = liveAt !== null && firstEngineStart !== null && engines.length === 1 ? (liveAt - firstEngineStart) / 1000 : null
    const interesting = dev.filter((d) => /health probe failed|serving engine died|restarting in|spawning|engine ready|engine attached|data-server serving|escalating|refused|unanswered|could not open|fold landed|still folding|link|reconnect|lost/i.test(d.line))
    const summary = {
      label: LABEL, mode: MODE, bytes: size, launchToServingS: liveAt === null ? null : liveAt / 1000, engineStartToServingS: readS,
      mbPerSecond: readS ? Math.round((size / 1e6 / readS) * 100) / 100 : null, counts, engines, memAtLive,
      machineLoad: loadSummary(sampler), ranS: Math.round((Date.now() - tLaunch) / 1000), samplerNotes: sampler.notes.slice(0, 6)
    }
    console.log(`RESULT ${JSON.stringify(summary)}`)
    console.log('--- dev log lines that matter (ms since launch) ---')
    for (const d of interesting.slice(0, 400)) console.log(`+${String(d.t)} ${d.line.replace(/C:[\\/]Users[^ ,)]*busy-engine/g, '<exp>').slice(0, 260)}`)
    console.log('--- screen, on change ---')
    for (const s of screen.slice(0, 120)) console.log(`+${String(s.t)} ${JSON.stringify(s.s).replace(/C:[\\\\/]+Users[^ ,)"]*busy-engine/g, '<exp>').slice(0, 900)}`)
    save(`${LABEL}.json`, { summary, screen, memory: sampler.rows.filter((_, i) => i % 4 === 0).map((r) => [r.at - tLaunch, r.pid, mb(r.privateBytes), r.cpuMs, r.priority]), loads: sampler.loads })
    save(`${LABEL}.devlog.txt`, dev.map((d) => `+${String(d.t)} ${d.line}`).join('\n'))
  } finally {
    clearTimeout(hard)
    await closeAll()
  }
}

main().then(() => process.exit(0)).catch((err: unknown) => { console.error('exp error:', err); process.exit(1) })
