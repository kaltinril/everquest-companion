// zz-exp-busy-engine-3.mts: THROWAWAY. As -1, but it EMULATES THE APP: session.health on the kept
// connection 400 ms after each answer (foldWait), and the supervisor's watchdog itself: one fresh
// connection per beat with a 5 s limit, closed at the limit, one immediate confirmation, a verdict.
// (--beatMs, default 10000: the wait after an answered probe; the app's is 30000.)
// zz-exp-busy-engine-1.mts: THROWAWAY. Drives engined.exe directly (no app): attach one log, ask
// session.health every second on a kept connection AND on a fresh connection (the watchdog's own
// shape: connect, hello, session.health, close), and note time to live, memory and fight count.
//   node --import tsx tests/e2e/zz-exp-busy-engine-1.mts --log <path> --label <name> [--mode none|idle1|below1|normal1] [--core N] [--maxSec N]
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintToken } from '../../src/main/dataServer/token'
import { EXP, arg, loadSummary, mb, save, sleep, startBurner, startSampler, stats } from './zz-exp-busy-engine-0.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BIN = join(ROOT, 'engine', 'target', 'release', 'engined.exe')
const LOG = arg('log')
const LABEL = arg('label', 'direct')
const MODE = arg('mode', 'none')
const CORE = Number(arg('core', '0'))
const MAX_SEC = Number(arg('maxSec', '1500'))
const RUN_SEC = Number(arg('runSec', '0'))
const PROBE_CAP_MS = 120_000
const BEAT_MS = Number(arg('beatMs', '10000'))
/** --afterLive <mode>: read unstarved, then pin the engine in <mode> once it is live and keep the watchdog going for --afterLiveSec */
const AFTER_MODE = arg('afterLive', '')
const AFTER_SEC = Number(arg('afterLiveSec', '300'))
const DOG_TIMEOUT_MS = Number(arg('dogTimeoutMs', '5000'))

type Frame = Record<string, unknown>

class Conn {
  private readonly parts: Buffer[] = []
  private readonly waiting = new Map<number, { done: (f: Frame, chars: number) => void }>()
  private nextId = 1
  onHello: ((f: Frame) => void) | null = null
  /** arrival time (Date.now) of every frame on this connection */
  readonly heard: number[] = []
  closed = false
  constructor(readonly sock: net.Socket) {
    sock.on('data', (b: Buffer) => this.feed(b))
    sock.on('close', () => { this.closed = true })
    sock.on('error', () => { this.closed = true })
  }
  private feed(b: Buffer): void {
    let from = 0
    for (;;) {
      const nl = b.indexOf(0x0a, from)
      if (nl === -1) { if (from < b.length) this.parts.push(b.subarray(from)); return }
      this.parts.push(b.subarray(from, nl))
      const line = Buffer.concat(this.parts)
      this.parts.length = 0
      from = nl + 1
      if (line.length === 0) continue
      const f = JSON.parse(line.toString('utf8')) as Frame
      if (this.heard.length < 400_000) this.heard.push(Date.now())
      if (f.kind === 'hello') this.onHello?.(f)
      else if ((f.kind === 'reply' || f.kind === 'error') && typeof f.id === 'number') {
        const w = this.waiting.get(f.id)
        if (w) { this.waiting.delete(f.id); w.done(f, line.length) }
      }
    }
  }
  send(o: unknown): void { this.sock.write(`${JSON.stringify(o)}\n`) }
  request(op: string, params: unknown, capMs = PROBE_CAP_MS): Promise<{ frame: Frame; ms: number; chars: number }> {
    const id = this.nextId++
    const t0 = performance.now()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(id); reject(new Error(`${op} unanswered after ${String(capMs)} ms`)) }, capMs)
      this.waiting.set(id, { done: (frame, chars) => { clearTimeout(timer); resolve({ frame, ms: performance.now() - t0, chars }) } })
      this.send({ id, op, params })
    })
  }
  close(): void { this.sock.destroy() }
}

function open(port: number, token: string, capMs = PROBE_CAP_MS): Promise<{ conn: Conn; connectMs: number; helloMs: number }> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const sock = net.connect({ host: '127.0.0.1', port })
    sock.setNoDelay(true)
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`no hello after ${String(capMs)} ms`)) }, capMs)
    sock.once('error', (e) => { clearTimeout(timer); reject(e) })
    sock.once('connect', () => {
      const connectMs = performance.now() - t0
      const conn = new Conn(sock)
      conn.onHello = (f) => {
        clearTimeout(timer)
        if (f.ok !== true) { reject(new Error('hello refused')); return }
        resolve({ conn, connectMs, helloMs: performance.now() - t0 })
      }
      conn.send({ op: 'hello', token, protocolVersion: 1 })
    })
  })
}

/** The watchdog's own conversation: fresh connect, hello, session.health, close. Total ms. */
async function freshProbe(port: number, token: string): Promise<{ ms: number; connectMs: number; helloMs: number; status: string }> {
  const t0 = performance.now()
  const { conn, connectMs, helloMs } = await open(port, token)
  try {
    const r = await conn.request('session.health', {})
    const status = String((r.frame.result as Frame | undefined)?.status)
    return { ms: performance.now() - t0, connectMs, helloMs, status }
  } finally {
    conn.close()
  }
}

/** One watchdog ask: connect (2 s), then hello + session.health inside `limit`, socket closed at the limit. */
function dogProbe(port: number, token: string, limit: number): Promise<{ ok: boolean; ms: number; why: string }> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    let done = false
    const sock = net.connect({ host: '127.0.0.1', port })
    sock.setNoDelay(true)
    const finish = (ok: boolean, why: string): void => { if (done) return; done = true; clearTimeout(ct); if (lt) clearTimeout(lt); sock.destroy(); resolve({ ok, ms: performance.now() - t0, why }) }
    let lt: ReturnType<typeof setTimeout> | null = null
    const ct = setTimeout(() => finish(false, 'connect'), 2000)
    sock.once('error', () => finish(false, 'connect'))
    sock.once('connect', () => {
      clearTimeout(ct)
      let step = 'hello'
      lt = setTimeout(() => finish(false, `timeout during ${step}`), limit)
      const conn = new Conn(sock)
      conn.onHello = (f) => {
        if (f.ok !== true) { finish(false, 'refused'); return }
        step = 'health'
        void conn.request('session.health', {}).then(() => finish(true, 'ok')).catch(() => finish(false, 'unanswered'))
      }
      conn.send({ op: 'hello', token, protocolVersion: 1 })
    })
  })
}

async function main(): Promise<void> {
  const size = statSync(LOG).size
  const stateDir = join(EXP, 'state', LABEL)
  rmSync(stateDir, { recursive: true, force: true })
  mkdirSync(stateDir, { recursive: true })
  const token = mintToken()
  const child = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, cwd: dirname(BIN) })
  const tSpawn = Date.now()
  const said: string[] = []
  let landedAt: number | null = null
  child.stderr.on('data', (b: Buffer) => { for (const l of b.toString().split(/\r?\n/)) if (l.trim() !== '') { if (l.includes('fold landed') && landedAt === null) landedAt = Date.now(); said.push(`+${String(Date.now() - tSpawn)} ${l.slice(0, 300)}`) } })
  let exited: number | null | undefined
  child.on('exit', (code) => { exited = code })
  const burners: ReturnType<typeof startBurner>[] = MODE === 'none' ? [] : [startBurner()]
  let sampler: ReturnType<typeof startSampler> | null = null
  const hardStop = setTimeout(() => {
    console.log(`!! ${LABEL}: exceeded ${String(MAX_SEC)} s, ending`)
    try { child.kill() } catch { /* gone */ }
    for (const b of burners) b.kill()
    sampler?.stop()
    process.exit(3)
  }, MAX_SEC * 1000)
  try {
    child.stdin.write(`${token}\n`)
    const port = await new Promise<number>((resolve, reject) => {
      let buf = ''
      const t = setTimeout(() => reject(new Error('no announce in 10 s')), 10_000)
      child.stdout.on('data', (b: Buffer) => {
        buf += b.toString()
        const m = /EQC-ENGINE PORT=(\d+) PROTOCOL=(\d+)/.exec(buf)
        if (m) { clearTimeout(t); resolve(Number(m[1])) }
      })
    })
    const announceMs = Date.now() - tSpawn
    sampler = startSampler({ enginePid: child.pid ?? 0, mode: MODE, mask: 2 ** CORE, burners: burners.map((b) => b.pid ?? 0) })
    if (MODE !== 'none') await sleep(2500) // the pin lands before the read starts
    const { conn: main } = await open(port, token)
    await main.request('session.progress', {})
    const tAttach = Date.now()
    const attach = await main.request('session.attach', { logPath: LOG, stateDir, clock: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMin: -new Date().getTimezoneOffset() } })
    console.log(`${LABEL}: attached ${String(size)} bytes, attach reply ${attach.ms.toFixed(0)} ms ${JSON.stringify(attach.frame.result ?? attach.frame.error)}`)

    const kept: number[] = []
    const fresh: number[] = []
    const freshConnect: number[] = []
    const freshErrors: string[] = []
    const keptErrors: string[] = []
    const series: { t: number; kept?: number; fresh?: number; status?: string; offset?: number }[] = []
    let liveAt: number | null = null
    let liveHealth: Frame | null = null
    let lastStatus = ''
    let lastOffset = 0
    const beats: { t: number; first: string; firstMs: number; confirm?: string; confirmMs?: number; verdict: string; heardAgoMs?: number }[] = []
    let stop = false
    const keptLoop = (async () => {
      while (!stop && exited === undefined) {
        const t = Date.now() - tAttach
        try {
          const r = await main.request('session.health', {})
          kept.push(r.ms)
          const res = r.frame.result as Frame
          lastStatus = String(res.status)
          lastOffset = Number((res.mark as Frame | undefined)?.offset ?? 0)
          series.push({ t, kept: Math.round(r.ms), status: lastStatus, offset: lastOffset })
          if (res.status === 'live' && liveAt === null) { liveAt = Date.now() - tAttach; liveHealth = res }
        } catch (e) { keptErrors.push(`+${String(t)} ${String(e)}`) }
        await sleep(400)
      }
    })()
    const dogLoop = (async () => {
      await sleep(BEAT_MS)
      while (!stop && exited === undefined) {
        const t = Date.now() - tAttach
        const one = await dogProbe(port, token, DOG_TIMEOUT_MS)
        if (one.ok) { fresh.push(one.ms); beats.push({ t, first: 'ok', firstMs: Math.round(one.ms), verdict: 'healthy' }); await sleep(BEAT_MS); continue }
        const two = await dogProbe(port, token, DOG_TIMEOUT_MS)
        const heardAgoMs = main.heard.length > 0 ? Date.now() - main.heard[main.heard.length - 1] : -1
        if (two.ok) fresh.push(two.ms)
        beats.push({ t, first: one.why, firstMs: Math.round(one.ms), confirm: two.ok ? 'ok' : two.why, confirmMs: Math.round(two.ms), verdict: two.ok ? 'forgiven by the confirmation' : 'UNHEALTHY (the app would end the engine here)', heardAgoMs })
        await sleep(BEAT_MS)
      }
    })()
    let tick = 0
    while (liveAt === null && exited === undefined) {
      const t = Date.now() - tAttach
      if (RUN_SEC > 0 && t > RUN_SEC * 1000) break
      if (++tick % 60 === 0) console.log(`${LABEL}: +${String(Math.round(t / 1000))} s status ${lastStatus} offset ${String(mb(lastOffset))} of ${String(mb(size))} MiB, beats ${String(beats.length)}, first strikes ${String(beats.filter((x) => x.first !== 'ok').length)}, verdicts ${String(beats.filter((x) => x.verdict.startsWith('UNHEALTHY')).length)}`)
      await sleep(1000)
    }
    let liveBeatFrom = -1
    let after: ReturnType<typeof startSampler> | null = null
    if (AFTER_MODE !== '' && liveAt !== null) {
      const b = startBurner()
      burners.push(b)
      after = startSampler({ enginePid: child.pid ?? 0, mode: AFTER_MODE, mask: 2 ** CORE, burners: [b.pid ?? 0] })
      await sleep(3000)
      liveBeatFrom = beats.length
      console.log(`${LABEL}: live after ${String(liveAt)} ms; engine pinned (${AFTER_MODE}) for ${String(AFTER_SEC)} s more`)
      await sleep(AFTER_SEC * 1000)
    }
    stop = true
    await Promise.race([Promise.all([keptLoop, dogLoop]), sleep(15_000)])
    after?.stop()
    const keptBusy = false
    void freshConnect; void freshErrors
    const readMs = liveAt ?? -1
    const at = (): { privateMiB: number; workingSetMiB: number; peakPagedMiB: number; cpuS: number } | null => {
      const r = sampler?.rows.at(-1)
      return r ? { privateMiB: mb(r.privateBytes), workingSetMiB: mb(r.workingSet), peakPagedMiB: mb(r.peakPaged), cpuS: Math.round(r.cpuMs / 100) / 10 } : null
    }
    await sleep(1200)
    const memAtLive = at()
    let fights: unknown = null
    let combat: unknown = null
    let loot: unknown = null
    if (liveAt !== null) {
      const sf = await main.request('combat.searchFights', { query: '', limit: 1 }).catch((e: unknown) => ({ frame: { error: String(e) } as Frame, ms: -1, chars: 0 }))
      fights = (sf.frame.result as Frame | undefined)?.corpus ?? sf.frame.error
      const cs = await main.request('combat.snapshot', { opts: {} }).catch((e: unknown) => ({ frame: { error: String(e) } as Frame, ms: -1, chars: 0 }))
      combat = { ms: Math.round(cs.ms), chars: cs.chars }
      const ls = await main.request('module.snapshot', { module: 'loot' }).catch((e: unknown) => ({ frame: { error: String(e) } as Frame, ms: -1, chars: 0 }))
      loot = { ms: Math.round(ls.ms), chars: ls.chars }
    }
    await sleep(8000)
    const memLater = at()
    const peak = Math.max(0, ...(sampler?.rows.map((r) => r.privateBytes) ?? [0]))
    const heardRel = main.heard.map((x) => x - tAttach)
    const gaps: number[] = []
    for (let i = 1; i < heardRel.length; i++) gaps.push(heardRel[i] - heardRel[i - 1])
    const lastOffsetMiB = mb(lastOffset)
    const strikes = beats.filter((x) => x.first !== 'ok')
    const verdicts = beats.filter((x) => x.verdict.startsWith('UNHEALTHY'))
    const summary = {
      afterLiveMode: AFTER_MODE, beatsBeforePin: liveBeatFrom, afterLivePriority: after?.rows.at(-1)?.priority,
      beatMs: BEAT_MS, dogTimeoutMs: DOG_TIMEOUT_MS, beats: beats.length, firstStrikes: strikes.length, unhealthyVerdicts: verdicts.length, verdictAtS: verdicts.map((v) => Math.round(v.t / 1000)), heardAgoAtVerdictMs: verdicts.map((v) => v.heardAgoMs), okProbeMs: stats(beats.filter((x) => x.first === 'ok').map((x) => x.firstMs)),
      freshPendingAtEnd: series.filter((r) => r.fresh === undefined).length, keptPendingAtEnd: keptBusy,
      keptFrames: heardRel.length, keptSilenceMs: stats(gaps), keptSilenceOver10s: gaps.filter((g) => g > 10_000).length, keptSilenceOver20s: gaps.filter((g) => g > 20_000).length, lastStatus, lastOffsetMiB,
      label: LABEL, mode: MODE, log: LOG, bytes: size, announceMs,
      landedSeconds: landedAt === null ? null : (landedAt - tAttach) / 1000,
      readSeconds: readMs / 1000, bytesPerSecond: readMs > 0 ? Math.round(size / (readMs / 1000)) : null, mbPerSecond: readMs > 0 ? Math.round((size / 1e6 / (readMs / 1000)) * 100) / 100 : null,
      events: liveHealth === null ? null : (liveHealth as Frame).events, fights, combatSnapshot: combat, lootSnapshot: loot,
      healthKeptMs: stats(kept), healthFreshMs: stats(fresh), freshConnectMs: stats(freshConnect), freshErrors, keptErrors,
      memAtLive, memLiveplus9s: memLater, peakPrivateMiB: mb(peak),
      enginePriority: sampler?.rows.at(-1)?.priority, engineAffinity: sampler?.rows.at(-1)?.affinity, threads: sampler?.rows.at(-1)?.threads,
      machineLoad: sampler ? loadSummary(sampler) : '', engineSaid: said.slice(0, 12), samplerNotes: sampler?.notes.slice(0, 5)
    }
    console.log(`RESULT ${JSON.stringify(summary)}`)
    save(`${LABEL}.json`, { summary, beats, series, heard: heardRel, memory: sampler?.rows.filter((_, i) => i % 4 === 0).map((r) => [r.at - tAttach, mb(r.privateBytes), r.cpuMs]) })
    main.close()
  } finally {
    clearTimeout(hardStop)
    try { child.stdin.end() } catch { /* closed */ }
    const t0 = Date.now()
    while (exited === undefined && Date.now() - t0 < 4000) await sleep(100)
    if (exited === undefined) { console.log(`${LABEL}: no exit on stdin EOF in 4 s, killing our engine`); try { child.kill() } catch { /* gone */ } }
    for (const b of burners) b.kill()
    sampler?.stop()
  }
}

main().then(() => process.exit(0)).catch((err: unknown) => { console.error('exp error:', err); process.exit(1) })
