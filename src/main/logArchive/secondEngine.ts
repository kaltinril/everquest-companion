// main/logArchive/secondEngine.ts — FOLD ONE LOG WITH A SECOND ENGINE PROCESS (step 5.4).
//
// The app's supervisor is written for one engine: it restarts it, watches its health and hands its
// port to every reader. A refold needs none of that, so this file starts the same binary on its own,
// by the same contract (token as the first line on stdin, the port announced on stdout, closing
// stdin is the shutdown), folds one log, reads every module's snapshot and stops it. Nothing here
// touches the app's engine, its client or its files.
//
// NO STATE FOLDER. The attach carries no `stateDir`, so the second engine reads and writes neither
// the resist ledger nor the message register (the schema's "absent means no persistence").
//
// THE APP'S KNOWLEDGE GOES FIRST, as the app's own client does it (`pushAllDefines`): alert
// definitions, buff trust, respawn watches and the character's combo and roster edits change what a
// fold produces, so they are handed over before the attach.
//
// Electron-free: the caller names the binary and the defines.

import { spawn, type ChildProcess } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { dirname } from 'node:path'
import { createEngineClient, type EngineClient } from '../../shared/dataServer/client'
import { createNdjsonTransport } from '../../shared/dataServer/ndjson'
import type { ClientMessage, EngineMessage, HealthResult } from '../../shared/dataServer/protocol.generated'
import type { ParamsFor } from '../../shared/dataServer/ops'
import type { SegmentModule } from '../../shared/logArchive/segment'
import { parseAnnounce } from '../dataServer/engineProtocol'
import { connectToEngine } from '../dataServer/socketChannel'
import { readLines } from '../dataServer/supervisorChild'
import { mintToken } from '../dataServer/token'
import type { DefineOp } from '../dataServer/definePush'

export interface SecondFoldRequest {
  /** The engine binary: the one the app is running, so both folds come from the same build. */
  bin: string
  /** The log to fold. */
  logPath: string
  /** Its length; the fold is done when the engine has read to here and gone live. */
  bytes: number
  modules: readonly string[]
  /** The app's knowledge, each as its define command, in the order the app sends them. */
  defines: readonly { op: DefineOp; params: unknown }[]
  clock: ParamsFor<'session.attach'>['clock']
  /** How long the whole fold may take before it is given up. */
  timeoutMs: number
}

export interface SecondFold {
  modules: Record<string, SegmentModule>
  /** From the attach to the engine going live on the whole log. */
  foldMs: number
  events: number
}

const ANNOUNCE_MS = 10_000
const POLL_MS = 250

/** Start the binary and wait for its port. */
function launch(bin: string, token: string): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, cwd: dirname(bin) })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('the second engine did not announce a port'))
    }, ANNOUNCE_MS)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`the second engine exited early (code ${String(code)})`))
    })
    readLines(child.stdout, (line) => {
      const a = parseAnnounce(line)
      if (a === null) return
      clearTimeout(timer)
      resolve({ child, port: a.port })
    })
    // Its own drain, so a chatty stderr can never fill the pipe and stall the fold.
    readLines(child.stderr, () => undefined)
    child.stdin?.write(`${token}\n`)
  })
}

/** Below normal, as the app's own engine runs: a refold must not compete with the game. */
function lowerPriority(child: ChildProcess): void {
  try {
    if (child.pid !== undefined) setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    // Best effort; the fold is the same at any priority.
  }
}

function done(h: HealthResult, req: SecondFoldRequest): boolean {
  return h.status === 'live' && (h.mark?.offset ?? 0) >= req.bytes
}

async function waitLive(client: EngineClient, req: SecondFoldRequest, began: number): Promise<HealthResult> {
  for (;;) {
    const h = await client.request('session.health', {})
    if (done(h, req)) return h
    if (Date.now() - began > req.timeoutMs) throw new Error(`the refold did not finish in ${String(Math.round(req.timeoutMs / 1000))} s`)
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

async function snapshotAll(client: EngineClient, modules: readonly string[]): Promise<Record<string, SegmentModule>> {
  const out: Record<string, SegmentModule> = {}
  for (const module of modules) {
    try {
      const r = await client.request('module.snapshot', { module })
      if (r.module === module) out[module] = { seq: r.seq, state: r.state }
    } catch {
      // A module this build does not have; the capture skips it the same way.
    }
  }
  return out
}

async function foldOn(client: EngineClient, req: SecondFoldRequest): Promise<SecondFold> {
  for (const d of req.defines) {
    try {
      await client.request(d.op, d.params as never)
    } catch {
      // Refused here exactly as the app's own engine refuses it (`pushDefine` notes it and goes
      // on), so both folds run under the same rules.
    }
  }
  const began = Date.now()
  await client.request('session.attach', { logPath: req.logPath, clock: req.clock })
  const h = await waitLive(client, req, began)
  const foldMs = Date.now() - began
  return { modules: await snapshotAll(client, req.modules), foldMs, events: h.events ?? 0 }
}

/** Close stdin (the shutdown signal); kill it if it has not gone within two seconds. Resolves once
 *  it has exited, so the caller can remove the folder the engine had open. */
function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const kill = setTimeout(() => child.kill(), 2_000)
    child.once('exit', () => {
      clearTimeout(kill)
      resolve()
    })
    child.stdin?.end()
  })
}

/** Fold `req.logPath` in a fresh engine process and read every module back. Always stops it. */
export async function foldWithSecondEngine(req: SecondFoldRequest): Promise<SecondFold> {
  const token = mintToken()
  const { child, port } = await launch(req.bin, token)
  child.removeAllListeners('exit')
  lowerPriority(child)
  const client = createEngineClient({ token })
  try {
    const channel = await connectToEngine(port, 5_000)
    client.attach(createNdjsonTransport<ClientMessage, EngineMessage>(channel))
    return await foldOn(client, req)
  } finally {
    client.close()
    await stop(child)
  }
}
