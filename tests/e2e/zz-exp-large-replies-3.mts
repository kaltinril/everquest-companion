// zz-exp-large-replies-3.mts: THROWAWAY. Launches the real app (hidden window, throwaway userData)
// on one staged install folder and measures what a large whole-log reply costs main and a window.
//   node --import tsx tests/e2e/zz-exp-large-replies-3.mts <installDir> <outJson> [key=value ...]
// Keys: label=, quiet=1 (print no screen text: for the real log), parseFile=<a saved reply line>,
//       live=1 (append loot lines while live), budgetMs=, userData=<dir> (kept), reads=3,
//       archive=1 (turn Summarize and archive log on and archive this log before closing).
import type { ElectronApplication, Page } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import { appendFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../src/shared/ipc'
import { sleep } from './appHarness.mjs'
import { launchApp, mainWindow, overlayWindow } from './appWindow.mjs'
import { engineDescendantsOf, engineTable, tapOutput } from './engineSteps.mjs'
import { stamp } from './logFixture.mjs'

const [installDir, outJson, ...rest] = process.argv.slice(2)
if (!installDir || !outJson) throw new Error('usage: <installDir> <outJson> [key=value ...]')
const arg = new Map(rest.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)] as [string, string]))
const LABEL = arg.get('label') ?? 'run'
const QUIET = arg.get('quiet') === '1'
const PARSE_FILE = arg.get('parseFile') ?? null
const LIVE = arg.get('live') === '1'
const ARCHIVE = arg.get('archive') === '1'
const BUDGET_MS = Number(arg.get('budgetMs') ?? '420000')
const READS = Number(arg.get('reads') ?? '3')
const USER_DATA = arg.get('userData')
const LIVE_WAIT_MS = Number(arg.get('liveWaitMs') ?? '240000')

const out: Record<string, unknown> = { label: LABEL, installDir: QUIET ? '(real copy)' : installDir }
const t0 = Date.now()
const at = (): number => Date.now() - t0
const say = (k: string, v: unknown): void => {
  console.log(`[t+${String(at()).padStart(6)} ms] ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
}
function load(): number {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average'], { encoding: 'utf8', windowsHide: true })
  return Number(r.stdout.trim())
}
function workingSetMb(pid: number): number {
  const r = spawnSync('tasklist', ['/FI', `PID eq ${String(pid)}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
  const m = /"([\d,]+) K"/.exec(r.stdout)
  return m ? Math.round(Number((m[1] as string).replace(/,/g, '')) / 1024) : -1
}

/** The engined.exe that descends from MY launch, by the OS's own parent links (no wmic here). */
function myEngineByCim(rootPid: number): number | null {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.Name)" }'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  const parent = new Map<number, number>()
  const engines: number[] = []
  for (const line of r.stdout.split(/\r?\n/)) {
    const [pid, ppid, name] = line.trim().split(',')
    if (!pid || !ppid) continue
    parent.set(Number(pid), Number(ppid))
    if ((name ?? '').toLowerCase() === 'engined.exe') engines.push(Number(pid))
  }
  for (const e of engines) {
    let p: number | undefined = e
    for (let hop = 0; hop < 8 && p !== undefined && p !== 0; hop++) {
      if (p === rootPid) return e
      p = parent.get(p)
    }
  }
  return null
}

interface Mem {
  main: { rssMb: number; heapUsedMb: number; externalMb: number; arrayBuffersMb: number }
  procs: { type: string; pid: number; wsMb: number; peakMb: number; privMb: number; window: string }[]
}
async function memory(app: ElectronApplication, page: Page, enginePid: number | null): Promise<Record<string, unknown>> {
  const m = (await app.evaluate(({ app: a, BrowserWindow }) => {
    const wins = new Map<number, string>()
    for (const w of BrowserWindow.getAllWindows()) {
      const url = w.webContents.getURL()
      wins.set(w.webContents.getOSProcessId(), url.includes('kind=') ? `overlay ${new URL(url).searchParams.get('kind') ?? ''}` : 'main window')
    }
    const u = process.memoryUsage()
    return {
      main: { rssMb: Math.round(u.rss / 1048576), heapUsedMb: Math.round(u.heapUsed / 1048576), externalMb: Math.round(u.external / 1048576), arrayBuffersMb: Math.round(u.arrayBuffers / 1048576) },
      procs: a.getAppMetrics().map((p) => ({ type: p.type, pid: p.pid, wsMb: Math.round((p.memory.workingSetSize ?? 0) / 1024), peakMb: Math.round((p.memory.peakWorkingSetSize ?? 0) / 1024), privMb: Math.round((p.memory.privateBytes ?? 0) / 1024), window: wins.get(p.pid) ?? '' }))
    }
  })) as Mem
  const heap = (await page.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1')) as number
  const browser = m.procs.find((p) => p.type === 'Browser')
  const tabs = m.procs.filter((p) => p.type === 'Tab')
  return {
    mainProcess: { privMb: browser?.privMb, wsMb: browser?.wsMb, peakWsMb: browser?.peakMb, heapUsedMb: m.main.heapUsedMb, externalMb: m.main.externalMb },
    windows: tabs.map((t) => ({ window: t.window || 'other renderer', privMb: t.privMb, wsMb: t.wsMb, peakWsMb: t.peakMb })),
    mainWindowJsHeapMb: heap,
    engineWsMb: enginePid === null ? null : workingSetMb(enginePid)
  }
}

/** A 5 ms timer in MAIN: every gap over 20 ms is a stretch main's one thread could not serve anything. */
async function installMainProbes(app: ElectronApplication): Promise<string> {
  return (await app.evaluate(({ ipcMain }, channels) => {
    const g = globalThis as unknown as { __exp?: { blocks: number[]; handler: Record<string, number[]> } }
    if (g.__exp) return 'already'
    const exp = { blocks: [] as number[], handler: {} as Record<string, number[]> }
    g.__exp = exp
    let last = performance.now()
    setInterval(() => {
      const n = performance.now()
      const d = n - last - 5
      if (d > 20) exp.blocks.push(Math.round(d))
      last = n
    }, 5).unref()
    // Time main's own handler for the two read channels (engine + wire + parse + merge), without
    // changing what it returns. `_invokeHandlers` is Electron's own map of ipcMain.handle bodies.
    const map = (ipcMain as unknown as { _invokeHandlers?: Map<string, (...a: unknown[]) => unknown> })._invokeHandlers
    if (!map) return 'no handler map'
    const wrapped: string[] = []
    for (const ch of channels) {
      const orig = map.get(ch)
      if (!orig) continue
      exp.handler[ch] = []
      map.set(ch, async (...a: unknown[]) => {
        const t = performance.now()
        try {
          return await orig(...a)
        } finally {
          ;(exp.handler[ch] as number[]).push(Math.round((performance.now() - t) * 10) / 10)
        }
      })
      wrapped.push(ch)
    }
    return `wrapped ${wrapped.join(', ')}`
  }, [IPC.getModuleSnapshot, IPC.getCombatSnapshot])) as string
}
async function drainMain(app: ElectronApplication): Promise<{ blocks: number[]; handler: Record<string, number[]> }> {
  return (await app.evaluate(() => {
    const g = globalThis as unknown as { __exp?: { blocks: number[]; handler: Record<string, number[]> } }
    const e = g.__exp
    if (!e) return { blocks: [], handler: {} }
    const copy = { blocks: e.blocks.slice(), handler: Object.fromEntries(Object.entries(e.handler).map(([k, v]) => [k, v.slice()])) }
    e.blocks.length = 0
    for (const v of Object.values(e.handler)) v.length = 0
    return copy
  })) as { blocks: number[]; handler: Record<string, number[]> }
}

const READ = `async (id) => {
  const t = performance.now();
  const s = await window.eq.getModuleSnapshot(id);
  const ms = Math.round((performance.now() - t) * 10) / 10;
  const st = s ? s.state : null;
  const rows = Array.isArray(st) ? st.length : (st && Array.isArray(st.loot) ? st.loot.length : (st && Array.isArray(st.rows) ? st.rows.length : null));
  return { ms, isNull: s === null, rows, seq: s ? s.seq : null };
}`
const SCREEN = `(() => {
  const txt = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; };
  return {
    readingAnywhere: /Reading log/i.test(document.body.innerText),
    overviewHydrating: txt('[data-testid="overview-hydrating"]'),
    report: txt('[data-testid="log-read-report"]'),
    lootSummary: txt('[data-testid="loot-summary"]'),
    lootLoading: txt('[data-testid="loot-engine-loading"]'),
    content: (txt('[data-testid="app-content"]') || '').slice(0, 420)
  };
})()`

async function screen(page: Page, tag: string): Promise<Record<string, unknown>> {
  const s = (await page.evaluate(SCREEN)) as Record<string, unknown>
  if (QUIET) return { tag, readingAnywhere: s.readingAnywhere, contentChars: String(s.content ?? '').length, hasReport: s.report !== null, hasLootSummary: s.lootSummary !== null }
  return { tag, ...s }
}
const nav = async (page: Page, view: string): Promise<void> => {
  await page.evaluate(`document.querySelector('[data-testid="nav-${view}"]').click()`)
}

async function main(): Promise<void> {
  const logsDir = join(installDir as string, 'Logs')
  const logFile = readdirSync(logsDir).find((f) => /^eqlog_.*\.txt$/.test(f))
  if (!logFile) throw new Error('no eqlog file in the install folder')
  const logPath = join(logsDir, logFile)
  out.logBytes = statSync(logPath).size
  out.loadAtStart = load()
  say('log bytes', out.logBytes)
  say('machine load % at start', out.loadAtStart)

  const launched = await launchApp({ installDir: installDir as string, ...(USER_DATA === undefined ? {} : { userData: USER_DATA }) })
  const app = launched.app
  const tap = tapOutput(app)
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await launched.close()
  }
  const guard = setTimeout(() => {
    console.error('BUDGET reached: closing my app')
    void close().then(() => process.exit(3))
  }, BUDGET_MS)
  try {
    const page = await mainWindow(app)
    say('main window up', at())
    out.probes = await installMainProbes(app)
    say('main probes', out.probes)

    // 1. The wait a player sits through: until the Overview's own read stops saying hydrating.
    let liveAt = -1
    const samples: { at: number; hydrating: unknown }[] = []
    while (at() < LIVE_WAIT_MS) {
      const h = (await page.evaluate('window.eq.getCombatSnapshot({ timeline: true, maxSegments: 1 }).then((s) => s.hydrating)')) as unknown
      if (samples.length === 0 || samples[samples.length - 1]?.hydrating !== h) samples.push({ at: at(), hydrating: h })
      if (h !== true) {
        liveAt = at()
        break
      }
      await sleep(500)
    }
    out.hydratingEdges = samples
    out.meterServedAtMs = liveAt
    out.servingLineSeen = tap.said('data-server serving:')
    say('meter served (hydrating false) at ms', liveAt)
    const table = engineTable()
    const mine = engineDescendantsOf(table, app.process().pid as number)
    let enginePid = mine && mine.length > 0 ? (mine[0] as number) : null
    if (enginePid === null) enginePid = myEngineByCim(app.process().pid as number)
    out.enginePidFound = enginePid !== null
    await sleep(4000) // the Overview's own module reads (loot among them) land
    out.duringOverviewHydrate = await drainMain(app)
    say('main during launch and the Overview hydrate', out.duringOverviewHydrate)
    out.screenOverview = await screen(page, 'overview after live')
    say('overview', out.screenOverview)
    out.report = QUIET ? null : await page.evaluate('window.eq.logReadReport()')
    if (!QUIET) say('logReadReport', out.report)
    out.memOverview = await memory(app, page, enginePid)
    say('memory, Overview open', out.memOverview)

    // 2. One window asks for the loot module, READS times, each as a player's window would.
    const reads: unknown[] = []
    for (let i = 0; i < READS; i++) {
      await drainMain(app)
      const loadNow = load()
      const r = (await page.evaluate(`(${READ})('loot')`)) as { ms: number; isNull: boolean; rows: number | null }
      await sleep(300)
      const m = await drainMain(app)
      const row = { rendererMs: r.ms, isNull: r.isNull, rows: r.rows, mainHandlerMs: m.handler[IPC.getModuleSnapshot] ?? [], mainBlocksMs: m.blocks, load: loadNow }
      reads.push(row)
      say(`loot read ${String(i + 1)}`, row)
    }
    out.lootReads = reads
    if (arg.get('sizeIn') === '1') {
      // What one window was handed, measured in the window: the snapshot as JSON text, and its rows.
      out.lootAsHandedToWindow = await page.evaluate(`window.eq.getModuleSnapshot('loot').then((s) => { const st = s ? s.state : null; const rows = Array.isArray(st) ? st : (st && st.loot) || []; const t = performance.now(); const chars = JSON.stringify(s).length; return { jsonChars: chars, rows: rows.length, stringifyMs: Math.round(performance.now() - t), served: s ? s.served : null, firstTs: rows.length ? rows[0].ts : null, lastTs: rows.length ? rows[rows.length - 1].ts : null }; })`)
      say('loot as handed to the window', out.lootAsHandedToWindow)
      await drainMain(app)
    }
    const small: unknown[] = []
    for (let i = 0; i < READS; i++) {
      await drainMain(app)
      const r = (await page.evaluate(`(${READ})('kills')`)) as { ms: number }
      await sleep(100)
      const m = await drainMain(app)
      small.push({ rendererMs: r.ms, mainHandlerMs: m.handler[IPC.getModuleSnapshot] ?? [], mainBlocksMs: m.blocks })
    }
    out.killsReads = small
    say('kills reads (the small-reply baseline)', small)
    out.memAfterReads = await memory(app, page, enginePid)

    // 3. The same line parsed and copied INSIDE main (Electron's own V8), from a saved reply.
    if (PARSE_FILE !== null) {
      out.inMain = await app.evaluate((_e, p) => {
        const fs = process.getBuiltinModule('fs')
        const v8 = process.getBuiltinModule('v8')
        const s = fs.readFileSync(p, 'utf8')
        const r = { chars: s.length, parseMs: [] as number[], structuredCloneMs: [] as number[], v8SerializeMs: [] as number[], heapMbPerCopy: 0 }
        let o: unknown = null
        const h0 = process.memoryUsage().heapUsed
        const keep: unknown[] = []
        for (let i = 0; i < 3; i++) {
          const t = performance.now()
          o = JSON.parse(s)
          r.parseMs.push(Math.round((performance.now() - t) * 10) / 10)
          keep.push(o)
        }
        r.heapMbPerCopy = Math.round(((process.memoryUsage().heapUsed - h0) / 3 / 1048576) * 10) / 10
        for (let i = 0; i < 3; i++) {
          const t = performance.now()
          structuredClone(o)
          r.structuredCloneMs.push(Math.round((performance.now() - t) * 10) / 10)
        }
        for (let i = 0; i < 3; i++) {
          const t = performance.now()
          v8.serialize(o)
          r.v8SerializeMs.push(Math.round((performance.now() - t) * 10) / 10)
        }
        return r
      }, PARSE_FILE)
      say('in main: parse and copy of the saved reply', out.inMain)
      await drainMain(app)
    }

    // 4. The Loot tab.
    const tLoot = Date.now()
    await nav(page, 'loot')
    let lootShown = -1
    for (let i = 0; i < 120; i++) {
      const s = (await page.evaluate(SCREEN)) as { lootSummary: string | null }
      if (s.lootSummary !== null) {
        lootShown = Date.now() - tLoot
        break
      }
      await sleep(250)
    }
    await sleep(3000)
    out.lootTabSummaryAfterMs = lootShown
    out.screenLoot = await screen(page, 'loot tab')
    say('loot tab', out.screenLoot)
    out.duringLootTab = await drainMain(app)
    say('main while the Loot tab opened', out.duringLootTab)
    out.memLootTab = await memory(app, page, enginePid)
    say('memory, Loot tab open', out.memLootTab)

    // 5. One meter overlay and the XP overlay (which can hold loot too).
    const opened: string[] = []
    for (const kind of ['fight', 'xp']) {
      const ok = (await page.evaluate(`window.eq.toggleOverlay('${kind}')`).catch((e: unknown) => String(e))) as unknown
      const w = await overlayWindow(app, kind, 15_000)
      opened.push(`${kind}: toggle=${String(ok)} window=${w === null ? 'none' : 'open'}`)
    }
    await sleep(5000)
    out.overlays = opened
    out.duringOverlays = await drainMain(app)
    say('overlays', opened)
    say('main while overlays opened', out.duringOverlays)
    out.memOverlays = await memory(app, page, enginePid)
    say('memory, Loot tab + fight and xp overlays', out.memOverlays)

    // 6. Live play: one kill with one loot line, three times. Every window that holds loot asks
    //    for the whole module again on each change.
    if (LIVE) {
      const lives: unknown[] = []
      for (let i = 0; i < 3; i++) {
        await drainMain(app)
        const before = (await page.evaluate(SCREEN)) as { lootSummary: string | null }
        const now = new Date()
        const lines = [`You have slain a fire drake!`, `--You have looted a Live Test Gem ${String(i)} from a fire drake's corpse.--`]
        appendFileSync(logPath, lines.map((l) => `${stamp(now)} ${l}\r\n`).join(''))
        const tA = Date.now()
        let seen = -1
        for (let k = 0; k < 150; k++) {
          const s = (await page.evaluate(SCREEN)) as { lootSummary: string | null }
          if (s.lootSummary !== before.lootSummary) {
            seen = Date.now() - tA
            break
          }
          await sleep(100)
        }
        await sleep(6500)
        const m = await drainMain(app)
        const row = { summaryChangedAfterMs: seen, moduleReads: m.handler[IPC.getModuleSnapshot] ?? [], mainBlocksMs: m.blocks, load: load() }
        lives.push(row)
        say(`live loot line ${String(i + 1)}`, row)
      }
      out.liveLoot = lives
      out.memAfterLive = await memory(app, page, enginePid)
      say('memory after live lines', out.memAfterLive)
    }

    // 7. What the screens say now.
    await nav(page, 'overview')
    await sleep(2500)
    out.screenOverviewEnd = await screen(page, 'overview at end')
    say('overview at end', out.screenOverviewEnd)
    await nav(page, 'combat')
    await sleep(2500)
    out.screenCombatEnd = await screen(page, 'combat at end')
    say('combat at end', out.screenCombatEnd)
    out.reportEnd = QUIET ? null : await page.evaluate('window.eq.logReadReport()')
    if (!QUIET) say('logReadReport at end', out.reportEnd)

    // 8. Optionally: Summarize and archive log, then archive this log.
    if (ARCHIVE) {
      const tOn = Date.now()
      const on = await page.evaluate('window.eq.setLogArchiveEnabled(true).then((r) => ({ ok: r.ok, message: r.message }))')
      out.archiveSwitchOnMs = Date.now() - tOn
      say('archive switch on', on)
      say('archive switch on took ms', out.archiveSwitchOnMs)
      await drainMain(app)
      const tR = Date.now()
      const rot = await page.evaluate('window.eq.logArchiveRotate().then((r) => ({ ok: r.ok, message: r.message, segments: r.status.segments.length }))')
      out.archive = { on, rot, ms: Date.now() - tR, liveLogBytesAfter: statSync(logPath).size, main: await drainMain(app) }
      say('archive now', out.archive)
      const dir = join(logsDir, 'companion-archive')
      try {
        out.archiveFiles = readdirSync(dir).map((f) => ({ file: f.replace(/^.*?\./, '<id>.'), bytes: statSync(join(dir, f)).size }))
        say('archive folder', out.archiveFiles)
      } catch {
        out.archiveFiles = 'no archive folder'
      }
      await sleep(2000)
      out.memAfterArchive = await memory(app, page, enginePid)
      say('memory after the archive', out.memAfterArchive)
    }

    // 9. What main narrated.
    const text = tap.text()
    const keep = text.split(/\r?\n/).filter((l) => /exceeded|too large|large|reconnect|data-server serving|did not answer|unserved|frame|gave up|connection (closed|lost|failed)|link|the reply to/i.test(l))
    out.devLog = QUIET ? keep.length : keep.slice(0, 60).map((l) => l.slice(0, 260))
    out.devLogFlags = {
      frameExceeded: /a frame exceeded/.test(text),
      replyNotes: (text.match(/the reply to [^\n]*/g) ?? []).slice(0, 12),
      servingLines: (text.match(/data-server serving:[^\n]*/g) ?? []).length
    }
    say('dev log flags', out.devLogFlags)
    if (!QUIET) for (const l of (out.devLog as string[]).slice(0, 40)) console.log('   | ' + l)
    out.loadAtEnd = load()
    out.totalMs = at()
  } finally {
    clearTimeout(guard)
    writeFileSync(outJson as string, JSON.stringify(out, null, 1))
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('exp error:', err)
  process.exitCode = 1
})
