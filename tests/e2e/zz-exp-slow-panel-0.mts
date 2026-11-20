// zz-exp-slow-panel-0.mts: THROWAWAY. A direct driver for engined.exe (no app): spawn, token on
// stdin, loopback line-delimited JSON. Used by the other zz-exp-slow-panel-* scripts.
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { connect, type Socket } from 'node:net'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ENGINE = join(HERE, '..', '..', 'engine', 'target', 'release', 'engined.exe')

export function load(): number {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average'],
      { encoding: 'utf8', timeout: 20_000 }
    )
    return Number(out.trim())
  } catch {
    return -1
  }
}

export interface Timed {
  readonly ok: boolean
  /** ms from the request's write to the first byte that followed it on this connection */
  readonly firstMs: number
  /** ms from the request's write to the whole reply line being in hand */
  readonly ms: number
  /** bytes of the reply line on the wire */
  readonly bytes: number
  readonly reply: any
  readonly error?: string
}

export interface Conn {
  request(op: string, params: unknown, timeoutMs?: number, keep?: boolean): Promise<Timed>
  readonly frames: { at: number; msg: any }[]
  close(): void
}

export interface Engine {
  readonly pid: number
  readonly port: number
  readonly stderr: string[]
  conn(): Promise<Conn>
  rssMb(): number
  stop(): Promise<void>
}

export async function startEngine(): Promise<Engine> {
  const token = randomBytes(32).toString('hex')
  const child: ChildProcessWithoutNullStreams = spawn(ENGINE, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const stderr: string[] = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (d: string) => {
    for (const l of d.split(/\r?\n/)) if (l.length > 0) stderr.push(l)
  })
  child.stdin.write(`${token}\n`)
  const announce = await new Promise<string>((resolve, reject) => {
    let buf = ''
    const t = setTimeout(() => reject(new Error('no announce line')), 15_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d: string) => {
      buf += d
      const nl = buf.indexOf('\n')
      if (nl !== -1) {
        clearTimeout(t)
        resolve(buf.slice(0, nl))
      }
    })
    child.on('exit', (c) => reject(new Error(`engine exited ${String(c)}`)))
  })
  const m = /PORT=(\d+) PROTOCOL=(\d+)/.exec(announce)
  if (!m) throw new Error(`bad announce: ${announce}`)
  const port = Number(m[1])
  const protocolVersion = Number(m[2])

  const conn = (): Promise<Conn> =>
    new Promise<Conn>((resolve, reject) => {
      const sock: Socket = connect(port, '127.0.0.1')
      sock.setNoDelay(true)
      let nextId = 1
      const pending = new Map<number, { t0: number; first: number; keep: boolean; done: (t: Timed) => void; timer: NodeJS.Timeout }>()
      const frames: { at: number; msg: any }[] = []
      let chunks: Buffer[] = []
      let held = 0
      let hello = false
      let lastWrite = 0
      let firstAfterWrite = 0
      const onLine = (line: Buffer): void => {
        const at = performance.now()
        // Cheap id sniff so a 50 MB reply is not parsed unless the caller wants it.
        const head = line.subarray(0, 200).toString('utf8')
        if (!hello) {
          hello = true
          const msg = JSON.parse(line.toString('utf8'))
          if (msg.ok !== true) reject(new Error(`hello refused: ${head}`))
          else resolve(api)
          return
        }
        const kind = /"kind":"(\w+)"/.exec(head)?.[1]
        const idm = /"id":(\d+)/.exec(head)
        if ((kind === 'reply' || kind === 'error') && idm) {
          const id = Number(idm[1])
          const p = pending.get(id)
          if (p) {
            pending.delete(id)
            clearTimeout(p.timer)
            const ok = kind === 'reply'
            let reply: any = null
            if (p.keep || !ok || line.length < 4096) reply = JSON.parse(line.toString('utf8'))
            p.done({
              ok,
              firstMs: Math.round((p.first || at) - p.t0),
              ms: Math.round(at - p.t0),
              bytes: line.length + 1,
              reply,
              ...(ok ? {} : { error: head })
            })
            return
          }
        }
        if (line.length < 4096) frames.push({ at, msg: JSON.parse(line.toString('utf8')) })
        else frames.push({ at, msg: { big: line.length, head } })
      }
      sock.on('data', (d: Buffer) => {
        if (firstAfterWrite === 0 && lastWrite !== 0) {
          firstAfterWrite = performance.now()
          for (const p of pending.values()) if (p.first === 0) p.first = firstAfterWrite
        }
        let start = 0
        let nl = d.indexOf(10)
        while (nl !== -1) {
          const piece = d.subarray(start, nl)
          const line = held === 0 ? piece : Buffer.concat([...chunks, piece])
          chunks = []
          held = 0
          onLine(line)
          start = nl + 1
          nl = d.indexOf(10, start)
        }
        if (start < d.length) {
          chunks.push(d.subarray(start))
          held += d.length - start
        }
      })
      sock.on('error', (e) => reject(e))
      const api: Conn = {
        frames,
        request: (op, params, timeoutMs = 120_000, keep = false) =>
          new Promise<Timed>((done) => {
            const id = nextId++
            const t0 = performance.now()
            lastWrite = t0
            firstAfterWrite = 0
            const timer = setTimeout(() => {
              pending.delete(id)
              done({ ok: false, firstMs: -1, ms: Math.round(performance.now() - t0), bytes: 0, reply: null, error: `no reply in ${String(timeoutMs)} ms` })
            }, timeoutMs)
            pending.set(id, { t0, first: 0, keep, done, timer })
            sock.write(`${JSON.stringify({ id, op, params })}\n`)
          }),
        close: () => sock.destroy()
      }
      sock.write(`${JSON.stringify({ op: 'hello', token, protocolVersion })}\n`)
    })

  return {
    pid: child.pid ?? -1,
    port,
    stderr,
    conn,
    rssMb: () => {
      try {
        const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${String(child.pid)}).PrivateMemorySize64`], {
          encoding: 'utf8',
          timeout: 20_000
        })
        return Math.round(Number(out.trim()) / 1048576)
      } catch {
        return -1
      }
    },
    stop: () =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            child.kill()
          } catch {
            /* gone */
          }
          resolve()
        }, 10_000)
        child.on('exit', () => {
          clearTimeout(t)
          resolve()
        })
        child.stdin.end()
      })
  }
}

export interface LiveReport {
  readonly attachToLiveMs: number
  readonly lastScanFrameToLiveMs: number
  readonly scanFrames: number
  readonly events: number
  readonly offset: number
}

/** Attach, subscribe to progress, and poll session.health until it says live. */
export async function attachUntilLive(c: Conn, logPath: string, boundMs: number): Promise<LiveReport> {
  const t0 = performance.now()
  await c.request('session.progress', {})
  const off = new Date().getTimezoneOffset()
  const a = await c.request('session.attach', { logPath, clock: { utcOffsetMin: -off } })
  if (!a.ok) throw new Error(`attach refused: ${String(a.error)}`)
  let health: any = null
  let liveAt = 0
  while (performance.now() - t0 < boundMs) {
    const h = await c.request('session.health', {}, 20_000, true)
    health = h.reply?.result
    if (health?.status === 'live') {
      liveAt = performance.now()
      break
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  if (liveAt === 0) throw new Error(`not live in ${String(boundMs)} ms: ${JSON.stringify(health)}`)
  const scan = c.frames.filter((f) => f.msg?.kind === 'epoch' && f.msg.progress && f.msg.progress.live !== true)
  const last = scan.length > 0 ? scan[scan.length - 1]!.at : t0
  return {
    attachToLiveMs: Math.round(liveAt - t0),
    lastScanFrameToLiveMs: Math.round(liveAt - last),
    scanFrames: scan.length,
    events: Number(health.events ?? -1),
    offset: Number(health.mark?.offset ?? -1)
  }
}

export const MODULES: readonly string[] = [
  'combo', 'roster', 'loot', 'turnins', 'classUnlocks', 'kills', 'respawn', 'progression', 'leveling', 'skills',
  'character', 'outputFiles', 'spellSets', 'itemTiers', 'observedSpellRanks', 'alerts', 'buffs', 'buffTimers',
  'buffConflicts', 'messageOverlay', 'consider', 'resist', 'bazaar', 'gaps', 'killFactionSamples', 'met', 'eventFeed'
]

/** The combat.snapshot options each surface really sends (after main's engineOpts). */
export const COMBAT_ASKS: readonly { name: string; opts: Record<string, unknown> }[] = [
  { name: 'overview {timeline,maxSegments:1}', opts: { timeline: true, maxSegments: 1 } },
  { name: 'combatTab {showUnparsed:false,maxSegments:100,timeline}', opts: { showUnparsed: false, maxSegments: 100, timeline: true } },
  { name: 'combatTab overall {selectedId:zone,...}', opts: { selectedId: 'zone', showUnparsed: false, maxSegments: 100, timeline: true } },
  { name: 'overlay {maxSegments:30}', opts: { maxSegments: 30 } },
  { name: 'probe {} (engine default)', opts: {} },
  { name: 'archive ALL_FIGHTS {maxSegments:1000000}', opts: { maxSegments: 1_000_000 } }
]
