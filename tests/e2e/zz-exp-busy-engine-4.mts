// zz-exp-busy-engine-4.mts: THROWAWAY. How long does an engine that is BORN starved take to announce
// its port (the supervisor waits 10 s)? The engine is started through `cmd /c start /b /wait
// /belownormal /affinity <mask>` so it never runs unpinned, with a node burner of ours on that core.
//   node --import tsx tests/e2e/zz-exp-busy-engine-4.mts --core N --trials 5 [--class belownormal|low|normal]
import { execFileSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintToken } from '../../src/main/dataServer/token'
import { arg, save, sleep, startBurner } from './zz-exp-busy-engine-0.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BIN = join(ROOT, 'engine', 'target', 'release', 'engined.exe')
const CORE = Number(arg('core', '14'))
const TRIALS = Number(arg('trials', '5'))
const CLASS = arg('class', 'belownormal')
const CAP_MS = 90_000

async function main(): Promise<void> {
  const mask = (2 ** CORE).toString(16)
  const burner = startBurner()
  const results: { trial: number; announceMs: number | null }[] = []
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${String(burner.pid)}).ProcessorAffinity = [IntPtr]${String(2 ** CORE)}`])
    await sleep(1500)
    for (let i = 1; i <= TRIALS; i++) {
      const t0 = Date.now()
      const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', '/b', '/wait', `/${CLASS}`, '/affinity', mask, BIN], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, cwd: dirname(BIN), windowsVerbatimArguments: true })
      child.stdin.write(`${mintToken()}\n`)
      const announceMs = await new Promise<number | null>((resolve) => {
        let buf = ''
        const t = setTimeout(() => resolve(null), CAP_MS)
        child.stdout.on('data', (b: Buffer) => { buf += b.toString(); if (/EQC-ENGINE PORT=\d+/.test(buf)) { clearTimeout(t); resolve(Date.now() - t0) } })
        child.on('exit', () => { clearTimeout(t); resolve(null) })
      })
      results.push({ trial: i, announceMs })
      console.log(`trial ${String(i)}: announce after ${announceMs === null ? `more than ${String(CAP_MS)}` : String(announceMs)} ms`)
      try { child.stdin.end() } catch { /* closed */ }
      await sleep(3000)
      // our own cmd and the engine under it, nothing else
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
      await sleep(1000)
    }
    console.log(`RESULT ${JSON.stringify({ class: CLASS, core: CORE, results })}`)
    save(`announce-${CLASS}.json`, results)
  } finally {
    burner.kill()
  }
}

main().then(() => process.exit(0)).catch((err: unknown) => { console.error('exp error:', err); process.exit(1) })
