// zz-exp-large-replies-2.mts: THROWAWAY. Drives the release engine DIRECTLY (no app) on one log and
// measures every whole-log reply: its size in characters, the engine's time to answer (request sent
// to first byte, and to the closing newline), and what one such line costs a Node process to parse
// (JSON.parse) and to copy (structuredClone, v8.serialize: the nearest thing in Node to the IPC clone).
//   node --import tsx tests/e2e/zz-exp-large-replies-2.mts <logFile> <outJson> [repeats=3] [only=loot,kills]
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { statSync, writeFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { serialize } from 'node:v8'
import { ENGINE_BIN } from './appHarness.mjs'

const [logPath, outJson, ...rest] = process.argv.slice(2)
if (!logPath || !outJson) throw new Error('usage: <logFile> <outJson> [repeats=3] [only=a,b]')
const arg = new Map(rest.map((kv) => kv.split('=') as [string, string]))
const REPEATS = Number(arg.get('repeats') ?? '3')
const ONLY = arg.get('only')?.split(',') ?? null
const SAVE = arg.get('save') ?? null // module whose raw reply line is written beside outJson
const BUDGET_MS = Number(arg.get('budgetMs') ?? '900000')

const MODULES = ['alerts', 'bazaar', 'buffConflicts', 'buffTimers', 'buffs', 'character', 'classUnlocks', 'combo', 'consider', 'eventFeed', 'gaps', 'itemTiers', 'killFactionSamples', 'kills', 'leveling', 'loot', 'messageOverlay', 'met', 'observedSpellRanks', 'outputFiles', 'progression', 'resist', 'respawn', 'roster', 'skills', 'spellSets', 'turnins']

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const now = (): number => performance.now()

function load(): number {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average'], { encoding: 'utf8', windowsHide: true })
  return Number(r.stdout.trim())
}
function workingSetMb(pid: number): number {
  const r = spawnSync('tasklist', ['/FI', `PID eq ${String(pid)}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
  const m = /"([\d,]+) K"/.exec(r.stdout)
  return m ? Math.round(Number((m[1] as string).replace(/,/g, '')) / 1024) : -1
}

interface Got { line: string; firstByteMs: number; doneMs: number; bytes: number }

class Wire {
  private chunks: Buffer[] = []
  private waiting: ((g: Got) => void) | null = null
  private sentAt = 0
  private firstAt = -1
  private bytes = 0
  private queue: Got[] = []
  constructor(private readonly sock: Socket) {
    sock.on('data', (d: Buffer) => this.onData(d))
  }
  private onData(d: Buffer): void {
    let from = 0
    for (;;) {
      const nl = d.indexOf(10, from)
      if (this.firstAt < 0 && d.length > from) this.firstAt = now()
      if (nl < 0) {
        if (from < d.length) {
          this.chunks.push(from === 0 ? d : d.subarray(from))
          this.bytes += d.length - from
        }
        return
      }
      this.chunks.push(d.subarray(from, nl))
      this.bytes += nl - from
      const doneAt = now()
      const line = Buffer.concat(this.chunks).toString('utf8')
      const got: Got = { line, firstByteMs: this.firstAt - this.sentAt, doneMs: doneAt - this.sentAt, bytes: this.bytes }
      this.chunks = []
      this.bytes = 0
      this.firstAt = -1
      from = nl + 1
      // Unsolicited frames (epoch/progress) carry no id we asked for: the caller filters.
      if (this.waiting) {
        const w = this.waiting
        this.waiting = null
        w(got)
      } else this.queue.push(got)
    }
  }
  private next(): Promise<Got> {
    const q = this.queue.shift()
    if (q) return Promise.resolve(q)
    return new Promise((resolve) => {
      this.waiting = resolve
    })
  }
  /** Send one message and return the line that answers `id` (other frames are skipped). */
  async ask(msg: { id?: number; op: string }): Promise<Got> {
    this.queue = []
    this.sentAt = now()
    this.firstAt = -1
    this.sock.write(`${JSON.stringify(msg)}\n`)
    for (;;) {
      const got = await this.next()
      if (msg.id === undefined) return got
      const head = got.line.slice(0, 200)
      if (head.includes(`"id":${String(msg.id)},`) || head.includes(`"id":${String(msg.id)}}`)) return got
      // A frame that was not ours: the clock for the first byte starts again.
      this.firstAt = -1
    }
  }
}

async function main(): Promise<void> {
  const deadline = Date.now() + BUDGET_MS
  const size = statSync(logPath as string).size
  const token = randomBytes(32).toString('hex')
  const child = spawn(ENGINE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const killer = setTimeout(() => {
    console.error('BUDGET: closing my engine')
    child.stdin.end()
    setTimeout(() => child.kill(), 3000)
  }, BUDGET_MS)
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString('utf8')
  })
  try {
    child.stdin.write(`${token}\n`)
    const port = await new Promise<number>((resolve, reject) => {
      let outBuf = ''
      child.stdout.on('data', (d: Buffer) => {
        outBuf += d.toString('utf8')
        const m = /PORT=(\d+)/.exec(outBuf)
        if (m) resolve(Number(m[1]))
      })
      child.on('exit', (c) => reject(new Error(`engine exited ${String(c)}: ${stderr}`)))
    })
    const sock = connect(port, '127.0.0.1')
    await new Promise<void>((r) => sock.once('connect', () => r()))
    sock.setNoDelay(true)
    const wire = new Wire(sock)
    const hello = await wire.ask({ op: 'hello', token, protocolVersion: 1 } as never)
    if (!hello.line.includes('"ok":true')) throw new Error(`hello refused: ${hello.line}`)
    let id = 1
    const loadBefore = load()
    const tAttach = now()
    const att = await wire.ask({ id: id++, op: 'session.attach', params: { logPath } } as never)
    if (att.line.includes('"error"')) throw new Error(`attach refused: ${att.line.slice(0, 300)}`)
    let status = ''
    let events = 0
    while (Date.now() < deadline) {
      const h = await wire.ask({ id: id++, op: 'session.health', params: {} } as never)
      const j = JSON.parse(h.line) as { result?: { status: string; events?: number } }
      status = j.result?.status ?? '?'
      events = j.result?.events ?? 0
      if (status === 'live' || status === 'idle') break
      await sleep(100)
    }
    const foldMs = Math.round(now() - tAttach)
    const engineMbAfterFold = workingSetMb(child.pid as number)
    console.log(JSON.stringify({ log: logPath, bytes: size, status, events, foldMs, loadBefore, engineWorkingSetMb: engineMbAfterFold }))
    if (status !== 'live') throw new Error(`engine ended ${status}: ${stderr.slice(-400)}`)

    const asks: { name: string; msg: (i: number) => object }[] = []
    for (const m of MODULES) asks.push({ name: `module.snapshot ${m}`, msg: (i) => ({ id: i, op: 'module.snapshot', params: { module: m } }) })
    asks.push({ name: 'combat.snapshot overview {timeline,maxSegments:1}', msg: (i) => ({ id: i, op: 'combat.snapshot', params: { opts: { timeline: true, maxSegments: 1 } } }) })
    asks.push({ name: 'combat.snapshot overlay {maxSegments:30}', msg: (i) => ({ id: i, op: 'combat.snapshot', params: { opts: { maxSegments: 30 } } }) })
    asks.push({ name: 'combat.snapshot combatTab {maxSegments:200}', msg: (i) => ({ id: i, op: 'combat.snapshot', params: { opts: { maxSegments: 200 } } }) })
    asks.push({ name: 'combat.snapshot archive {maxSegments:1e9}', msg: (i) => ({ id: i, op: 'combat.snapshot', params: { opts: { maxSegments: 1_000_000_000 } } }) })
    asks.push({ name: 'combat.snapshot {} (no cap named)', msg: (i) => ({ id: i, op: 'combat.snapshot', params: { opts: {} } }) })

    const rows: object[] = []
    for (const a of asks) {
      if (ONLY && !ONLY.some((o) => a.name.includes(o))) continue
      if (Date.now() > deadline - 20_000) {
        console.log('BUDGET: stopping before', a.name)
        break
      }
      const firstByte: number[] = []
      const done: number[] = []
      let chars = 0
      let bytes = 0
      let line = ''
      for (let r = 0; r < REPEATS; r++) {
        const got = await wire.ask(a.msg(id++) as never)
        firstByte.push(Math.round(got.firstByteMs * 10) / 10)
        done.push(Math.round(got.doneMs * 10) / 10)
        chars = got.line.length
        bytes = got.bytes
        line = got.line
      }
      const row: Record<string, unknown> = { reply: a.name, chars, mib: Math.round((chars / 1048576) * 100) / 100, wireBytes: bytes, engineFirstByteMs: firstByte, engineDoneMs: done }
      if (line.slice(0, 300).includes('"error"') && chars < 2000) row.error = line.slice(0, 200)
      // Only replies large enough to matter get the parse and copy timings.
      if (chars >= 200_000) {
        const parseMs: number[] = []
        const cloneMs: number[] = []
        const serMs: number[] = []
        let serBytes = 0
        let parsed: unknown = null
        for (let r = 0; r < REPEATS; r++) {
          const t0 = now()
          parsed = JSON.parse(line)
          parseMs.push(Math.round((now() - t0) * 10) / 10)
        }
        const heap0 = process.memoryUsage().heapUsed
        const hold: unknown[] = []
        for (let r = 0; r < REPEATS; r++) {
          const t0 = now()
          hold.push(structuredClone(parsed))
          cloneMs.push(Math.round((now() - t0) * 10) / 10)
        }
        const heap1 = process.memoryUsage().heapUsed
        for (let r = 0; r < REPEATS; r++) {
          const t0 = now()
          const b = serialize(parsed)
          serMs.push(Math.round((now() - t0) * 10) / 10)
          serBytes = b.length
        }
        row.nodeParseMs = parseMs
        row.nodeStructuredCloneMs = cloneMs
        row.nodeV8SerializeMs = serMs
        row.v8SerializedMb = Math.round((serBytes / 1048576) * 100) / 100
        row.heapMbPerParsedCopy = Math.round(((heap1 - heap0) / REPEATS / 1048576) * 10) / 10
        const st = (parsed as { result?: { state?: Record<string, unknown> } }).result?.state
        if (st && typeof st === 'object') {
          const counts: Record<string, number> = {}
          for (const [k, v] of Object.entries(st)) if (Array.isArray(v)) counts[k] = v.length
          row.arrays = counts
        }
        const segs = (parsed as { result?: { snapshot?: { segments?: unknown[]; zoneSessions?: unknown[] } } }).result?.snapshot
        if (segs) row.arrays = { segments: segs.segments?.length ?? -1, zoneSessions: segs.zoneSessions?.length ?? -1 }
      }
      if (SAVE && a.name === `module.snapshot ${SAVE}`) writeFileSync(`${outJson as string}.${SAVE}.line`, line, 'utf8')
      rows.push(row)
      if (chars >= 100_000) console.log(JSON.stringify(row))
    }
    const loadAfter = load()
    const engineMbEnd = workingSetMb(child.pid as number)
    writeFileSync(outJson as string, JSON.stringify({ log: logPath, bytes: size, events, foldMs, loadBefore, loadAfter, engineWorkingSetMbAfterFold: engineMbAfterFold, engineWorkingSetMbEnd: engineMbEnd, repeats: REPEATS, rows }, null, 1))
    console.log(JSON.stringify({ done: true, loadAfter, engineWorkingSetMbEnd: engineMbEnd, stderrTail: stderr.slice(-300) }))
    sock.destroy()
  } finally {
    clearTimeout(killer)
    child.stdin.end() // the contract: the engine exits when its stdin closes
    await Promise.race([new Promise((r) => child.once('exit', r)), sleep(5000)])
    if (child.exitCode === null) child.kill()
  }
}

main().catch((err: unknown) => {
  console.error('exp error:', err)
  process.exitCode = 1
})
