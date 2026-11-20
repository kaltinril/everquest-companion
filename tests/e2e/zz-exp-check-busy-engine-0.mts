// zz-exp-check-busy-engine-0.mts: THROWAWAY helpers for the busy-engine experiment. Never committed.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const EXP =
  'C:/Users/jerem/AppData/Local/Temp/claude/b26cdf37d0473d2f/bac97b0c-b082-4603-8332-7a97df223c39/scratchpad/experiments/check-busy-engine'
export const OUT = join(EXP, 'out')

export function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback)
}

export function save(name: string, value: unknown): void {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name), typeof value === 'string' ? value : JSON.stringify(value, null, 1), 'utf8')
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface EngineRow {
  at: number
  pid: number
  startedAt: number
  privateBytes: number
  workingSet: number
  cpuMs: number
  priority: string
  affinity: number
  peakPaged: number
  threads: number
}

export interface Sampler {
  rows: EngineRow[]
  loads: { at: number; load: number }[]
  notes: string[]
  stop(): void
}

/** One PowerShell that samples (and, by mode, pins) the engine. It is ours, and stop() ends it. */
export function startSampler(opts: { parentPid?: number; enginePid?: number; mode?: string; mask?: number; burners?: number[] }): Sampler {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(EXP, 'sampler2.ps1')]
  if (opts.parentPid) args.push('-ParentPid', String(opts.parentPid))
  if (opts.enginePid) args.push('-EnginePid', String(opts.enginePid))
  args.push('-Mode', opts.mode ?? 'none', '-Mask', String(opts.mask ?? 1))
  if (opts.burners && opts.burners.length > 0) args.push('-Burners', opts.burners.join(','))
  const ps = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const s: Sampler = { rows: [], loads: [], notes: [], stop: () => { try { ps.kill() } catch { /* gone */ } } }
  let buf = ''
  ps.stdout.on('data', (b: Buffer) => {
    buf += b.toString()
    for (;;) {
      const nl = buf.indexOf('\n')
      if (nl === -1) break
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      const f = line.split(',')
      if (f[0] === 'E') s.rows.push({ at: Number(f[1]), pid: Number(f[2]), startedAt: Number(f[3]), privateBytes: Number(f[4]), workingSet: Number(f[5]), cpuMs: Number(f[6]), priority: f[7], affinity: Number(f[8]), peakPaged: Number(f[9]), threads: Number(f[10]) })
      else if (f[0] === 'L') s.loads.push({ at: Number(f[1]), load: Number(f[2]) })
      else if (line !== '') s.notes.push(line)
    }
  })
  ps.stderr.on('data', (b: Buffer) => s.notes.push(`stderr: ${b.toString().trim().slice(0, 300)}`))
  return s
}

/** A CPU burner of our own: one node spinning. The sampler pins it; stop it with kill(). */
export function startBurner(): ChildProcess {
  return spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore', windowsHide: true })
}

export function stats(xs: number[]): { n: number; p50: number; p95: number; p99: number; max: number; over1s: number; over5s: number } {
  const a = [...xs].sort((x, y) => x - y)
  const q = (p: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(p * a.length))])
  return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a.length === 0 ? 0 : a[a.length - 1], over1s: a.filter((x) => x > 1000).length, over5s: a.filter((x) => x > 5000).length }
}

export function mb(bytes: number): number {
  return Math.round(bytes / 1048576)
}

export function loadSummary(s: Sampler): string {
  const l = s.loads.map((x) => x.load)
  if (l.length === 0) return 'no load sample'
  const mean = Math.round(l.reduce((a, b) => a + b, 0) / l.length)
  return `mean ${String(mean)}% min ${String(Math.min(...l))}% max ${String(Math.max(...l))}% over ${String(l.length)} samples`
}
