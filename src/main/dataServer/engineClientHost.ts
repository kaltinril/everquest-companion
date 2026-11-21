// ============================================================================
// engineClientHost.ts — THE APP BECOMES A CLIENT OF ITS OWN ENGINE (JOS-479, phase 3).
// ============================================================================
//
// Three things existed before this file and none of them had ever met. `supervisor.ts` spawns the
// engine and proves it healthy (JOS-467). `shared/dataServer/client.ts` is the app's side of the
// protocol — epoch law, typed requests, subscriptions (JOS-468). `engined` serves `module.snapshot`
// off a real twenty-module fold (JOS-478). This is the wiring that joins them INSIDE THE RUNNING
// PRODUCT, and it is the moment owner ruling 20 names: the first real client testing against the
// server.
//
// WHAT IT DOES, in five sentences. When the supervisor says READY it takes the port and the token
// that launch minted, opens one loopback connection, hellos, and attaches the engine to THE SAME
// LOG THIS PROCESS IS TAILING. When the character changes — or any time the TypeScript world is
// rebuilt — it attaches again, because that is the same funnel and last-pick-wins is the ENGINE's
// law now (`session.attach` preempts, never queues). When the engine dies and is respawned it does
// all of that over: a respawn is a launch, the token and port are new, resume is re-query. When
// both worlds have landed on the same log it runs THE PARITY PROBE and writes one line to the dev
// log. And that line is the entire user-visible surface of this ticket.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────────────────────────
//
// No IPC, no `window.eq`, no renderer anything. No store write. No branch in the product reads
// anything the engine says. The TypeScript fold remains the app's only source of truth and will be
// until the cutover deletes it (plan, phase 3). The cost on a launch that asked for NO engine —
// `EQC_ENGINE=0`, which since JOS-495 is the only way to be in that state — is exactly one `if` in
// `engineHost.ts`: `installEngineClient` is never called, no observer is registered, and
// `pipeline.ts sendWorldRebuilt` finds a null.
//
// THAT IS STILL TRUE AFTER JOS-483, and it is worth saying because the engine now appears in the
// app's performance panel. This file grew two READS and one request (`lastParitySummary`,
// `enginePerfSnapshot`) and no channel: `src/main/perf.ts` calls them and pushes over the perf IPC
// that already existed, which is the same shape every other number in that panel has. Nothing here
// knows a window exists, and no PRODUCT branch reads the engine — a diagnostic is not a source of
// truth. The renderer still has no engine client; brokering one is JOS-484.
//
// ── WHY A FRESH CLIENT PER LAUNCH, RATHER THAN `client.attach` OVER A REPLACEMENT TRANSPORT ────
//
// `EngineClient` takes its token at construction and holds it for the life of the object, which is
// right: a token IS the identity of one connection to one launch. A respawn mints a NEW secret
// (contract rule 5), so a client that survived it would be an object holding credentials for a
// process that no longer exists. So a respawn builds a new client and closes the old one, and
// `client.attach` is used for what it is for — handing this client its transport, which is also the
// path a future reconnect-to-the-same-launch would take. Nothing is carried across, which is
// exactly the resume-is-requery law the client library already enforces on its own state.
//
// ── PREEMPTION, LOCALLY ────────────────────────────────────────────────────────────────────────
//
// Everything below is asynchronous — a connect, an attach round trip, a fold that takes as long as
// the log is big, five snapshot round trips — and all of it can be superseded mid-flight by a
// character switch or an engine respawn. `switchController.ts`'s answer is the one used here: a
// GENERATION counter, re-asked after every suspension point. A turn that has lost touches nothing
// and, in particular, WRITES NO LINE — a parity verdict from a world somebody has since replaced
// would be a measurement of nothing, printed with authority.

import { app } from 'electron'
import { logInfo } from '../errorLog'
import { setWorldRebuiltObserver } from '../worldRebuilt'
import { getActiveCharacter } from '../session'
import { liveHistory } from '../logArchive/liveHistory'
import {
  createEngineClient,
  EngineError,
  type ConnectionState,
  type EngineClient
} from '../../shared/dataServer/client'
import type {
  KnowledgeRecord,
  PerfBudgetsResult,
  PerfSnapshotResult
} from '../../shared/dataServer/protocol.generated'
import { withOwnDefs } from './ownFires'
// WHAT THE CLIENT IS LISTENED TO FOR (fires, progress, con cards, cursors, wiki misses, large
// replies): registered once per client by `engineClientWiring.ts`, which this file hands its guards.
import { wireEngineClient } from './engineClientWiring'
// THE CONNECTION, KEPT OPEN (fork #9): `engineLink.ts` opens it, takes it and hears it end, on
// `linkKeeper.ts`'s retry policy; this file supplies the connect and what each edge means here.
import { openEngineLink, type EngineLink } from './engineLink'
import type { LinkFacts } from './linkKeeper'
import { replySizes } from './replySizes'
import { readDefine } from './appKnowledge'
import { DEFINE_OPS, setAppKnowledgePusher, setLogDirPusher, type DefineOp } from './definePush'
// WHERE THE CHARACTER LOGS LIVE (JOS-498, decision sheet 1a). THE APP NAMES THE DIRECTORY, so this
// file reads the app's own resolver and states it to the engine — the store stays persistence truth
// and the engine never reads a settings file (boundary verdict 3).
import { eqLogsDir } from '../log/config'
import { connectToEngine } from './socketChannel'
// THE DELTA ARM (JOS-493). It owns the serve flag's second half and the fan-out; this file supplies
// the only thing it cannot get for itself — the engine's own `moduleChanged` frames, and the two
// edges where the world that answers a read changes hands.
import { pushWorldChanged } from './serveDeltas'
// THE MIRROR ARM (JOS-496). The census's other fourteen readers are SYNCHRONOUS and have nowhere to
// put an await, so they read a pushed cache instead of a promise. It hears the same two things the
// delta arm does — a cursor, and the world changing hands — and it holds no import of this file, so
// the requester is handed over rather than reached for.
import { installMirrors, primeMirrors, resetMirrors } from './serveMirrors'
// THE WIKI-MISS FETCH (JOS-499 item 1, boundary verdict 5). The engine has no network stack, so it
// announces a name it could not answer and this app looks it up on the queue it has always owned.
// The leaf is electron-free and takes its capabilities here — see its header.
import { asKnowledgeRecord, installKnowledgeMissFetch } from './knowledgeMissFetch'
import { knownItem } from '../itemLookup'
import { knownMob } from '../mobLookup'
import { attachStateDir, takeArtifactsBack } from './artifactOwner'
import { hostClockHint, resolvedTimeZone } from './hostClock'
// THE LAUNCH BANNER'S THREE EDGES (JOS-503). This file is the only place that knows when a
// historical fold BEGINS (an accepted attach), how far it has got (the engine's progress frames)
// and when it LANDS (the go-live edge below) — so it feeds all three to the one state main pushes.
import { noteEngineFolding, noteEngineLive, noteEngineReadEnded } from './engineLaunchState'
// THE TURN AND ITS WAIT (JOS-518, fork #9). Two leaves with their requests, their turn, their sleep
// and their log sink handed in, so the shapes that matter — a fold past the old budget, an attach
// nobody answered, an answer about another log — are drivable in a unit test. `foldWait.ts` carries
// the owner ruling that a folding engine is never given up on.
import { runAttachTurn } from './attachTurn'
import { servingLine, type FoldHealth } from './foldWait'
// THE LOOK AFTER LIVE, and the read's edges as the recovery hears them (fork #9, phase R4).
import { createAfterLiveWatch } from './afterLive'
import { noteReadEdge } from './readEdges'
// What went wrong on the way to live, kept for the "Reading log..." report (fork #9).
import {
  noteLogReadConnection,
  noteLogReadError,
  noteLogReadHealth,
  noteLogReadLanded,
  noteLogReadTouched,
  noteLogReadTurn
} from './logReadState'
import { SERVABLE, type Readiness } from './readShim'
import type { ReadyEngine } from './supervisor'
import type { ParamsFor, RequestOp, ResultFor } from '../../shared/dataServer/ops'
import type { CharacterRef } from '../../shared/types'

/** How long the client's own loopback connect may take. The supervisor's probe just completed a
 *  round trip on this port, so this is a bound on the pathological case and not a budget. */
const CONNECT_TIMEOUT_MS = 2_000

// `FOLD_WAIT_BUDGET_MS` LIVED HERE AND IS GONE (JOS-518). It was 120 seconds, and it was a survivor
// of the deleted parity probe — where a bound on patience only ever cost a verdict. Post-cutover
// this loop arms the whole read path, so an expiry stranded the session permanently on any fold
// slower than two minutes. `foldWait.ts` carries the owner's ruling and the whole argument; what
// remains here is the wiring and the go-live edge, which is the part only this file knows.

/** One live engine and the client talking to it. */
interface LiveEngine {
  readonly engine: ReadyEngine
  readonly client: EngineClient
  /** Opens this client's connection, and reopens it when it is lost (`engineLink.ts`). */
  readonly link: EngineLink
  /** The log this client last successfully attached the engine to. KEPT ACROSS A RECONNECT: the
   *  engine is still on that log, so no second attach is sent and nothing is re-read. */
  attachedTo: string | null
}

let live: LiveEngine | null = null

/**
 * The log the TYPESCRIPT world last finished folding, or null when nothing is attached.
 *
 * It is the probe's readiness half. `sendWorldRebuilt` is the app's own "the fold landed and every
 * consumer should re-hydrate" moment, so it is precisely when this process's module snapshots stop
 * being a mid-scan prefix — and comparing a mid-scan prefix against the engine would report a race.
 */
let tsWorldPath: string | null = null

/** THE TURN. Bumped by every event that replaces the world: a new engine, a character switch, a
 *  rebuild. Read after every `await` — see the header. */
let gen = 0

/**
 * THE LOG THE ENGINE HAS BEEN OBSERVED LIVE ON, in THIS turn — null until a `session.health` in
 * this generation came back `live` (JOS-489).
 *
 * It is the compat shim's readiness half and it is a MEASUREMENT rather than a belief: nothing
 * infers it from having sent an attach. `waitForFold` is already polling health on every attach and
 * every rebuild, so the shim rides a round trip the probe was making anyway and no read path ever
 * has to ask the engine how it is feeling.
 *
 * IT DIES WITH THE TURN. A respawn, a character switch and a rebuild all replace the world, and an
 * engine that was live on the world somebody has since replaced is not live on this one — so
 * `bumpGen` clears it and the shim falls back to the app's own fold until health says `live` again.
 * That is a handful of TS-arm answers during a re-fold, which is exactly what those moments are.
 */
let engineLiveOn: string | null = null

/**
 * THE LOG FILE'S mtime AS THE ENGINE STATS IT (owner ruling 21's served fact), taken off the same
 * `session.health` round trip `engineLiveOn` is — null until the engine has said `live` in this
 * turn, and null again the moment the turn is replaced.
 *
 * IT IS KEPT HERE RATHER THAN RE-STATTED BY ITS READER, and that is the whole of ruling 21: this
 * process could `statSync` the log in one line (`main/log/config.ts` does), and doing so would prove
 * nothing about who owns the fact. The compat shim grafts THIS number onto the served `character`
 * snapshot (`serveShim.ts`), so what a picker under serve reads is the engine's answer about the
 * file, quoted rather than re-derived.
 *
 * IT DIES WITH THE TURN for `engineLiveOn`'s reason exactly: an mtime measured on the world somebody
 * has since replaced is a fact about a different file.
 */
let engineLogMtime: number | null = null

/**
 * HOW BIG THE ENGINE LAST SAID THIS LOG WAS — the newest `logSize` off a progress frame, or null
 * before one has arrived (JOS-518).
 *
 * IT EXISTS FOR ONE SENTENCE, and it is the sentence a person waiting out a nine-gigabyte fold most
 * needs: `still folding — 3.2 GB of 9.1 GB`. A percentage cannot say that and neither can an offset
 * with no denominator, and `session.health` — the round trip the wait is already making — carries a
 * mark but no size. So the number is taken from the frames the engine is already sending rather
 * than by this process `statSync`ing a file the engine owns (owner ruling 21).
 *
 * IT DIES WITH THE TURN, for `engineLiveOn`'s reason exactly: a denominator measured on the world
 * somebody has since replaced is a fact about a different fold, and quoting it under the new one
 * would print a bar's worth of arithmetic about the wrong file.
 */
let lastFoldLogSize: number | null = null

/** THE ONE PLACE THE TURN ADVANCES, so nothing that must die with it can be forgotten. */
function bumpGen(): number {
  gen += 1
  engineLiveOn = null
  engineLogMtime = null
  lastFoldLogSize = null
  // THE MIRRORS DIE WITH THE TURN, for `engineLiveOn`'s reason exactly: a served `character` state
  // measured on the world somebody has since replaced is a fact about a different log, and a
  // synchronous reader holding it would answer with authority about a character the app has left.
  resetMirrors()
  // What was known about reply sizes was known about the last read (replySizes.ts).
  replySizes.reset()
  noteLogReadTurn(Date.now(), attachTarget())
  // Whatever was armed to read the last world again must not fire into this one.
  noteReadEdge('turn', null)
  return gen
}

/** What the engine last said this log's mtime was, or null when it has not said. `serveShim.ts` is
 *  the only caller — see `engineLogMtime`. */
export function engineLogMtimeMs(): number | null {
  return engineLogMtime
}

function debug(line: string): void {
  logInfo(`[everquest-companion] ${line}`)
}

/** A promise that resolves later without ever being the reason this process stays alive —
 *  `engineHost.ts`'s timer rule, restated for the one place here that waits on a clock. */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const handle = setTimeout(resolve, ms)
    handle.unref()
  })
}

function describeErr(err: unknown): string {
  if (err instanceof EngineError) return `${err.code}: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

/**
 * Where the engine should be pointed right now.
 *
 * TWO SOURCES, AND THE ORDER MATTERS. `tsWorldPath` is the log whose fold has LANDED here, which is
 * what the probe compares against; `getActiveCharacter()` is the log this process is tailing, which
 * during a historical fold is already the new character. Preferring the former means a re-attach
 * caused by a rebuild names the log that rebuild was about; falling back to the latter is what lets
 * an engine that became ready DURING the first fold attach immediately instead of sitting idle
 * until something else happens.
 */
function attachTarget(): string | null {
  return tsWorldPath ?? getActiveCharacter()?.logPath ?? null
}

// ── the connection ─────────────────────────────────────────────────────────────────────────────

/**
 * THE SUPERVISOR'S READY EDGE. `null` means the launch that was ready is over.
 *
 * Synchronous by signature because the supervisor's callback is, and every asynchronous thing it
 * starts is voided deliberately: a supervisor must never be made to wait on a client.
 */
export function onEngineReady(info: ReadyEngine | null): void {
  // WAS THE OUTGOING ENGINE ANSWERING READS? Asked BEFORE `bumpGen` clears the answer, because the
  // windows that were being served have to be told the world changed hands — they are ignoring
  // `module:delta` precisely because they were served, so nothing else would ever move them again
  // (serveDeltas.ts `pushWorldChanged`). A launch whose engine was never live has served nobody and
  // says nothing.
  const wasServing = engineLiveOn !== null
  bumpGen()
  live?.link.stop()
  live?.client.close()
  live = null
  if (wasServing) pushWorldChanged()
  // THE LAST VERDICT DIES WITH THE ENGINE THAT EARNED IT. A respawn is a launch and a fresh world
  // has proven nothing yet; leaving the counts standing would let the panel report "5 agree" about
  // a process that no longer exists.
  // THE PERSISTED ARTIFACTS COME BACK (JOS-497 item 2, boundary verdict 4), and on BOTH arms rather
  // than only on the gone one. A dead process is not an owner, and the resist ledger's whole value
  // is that it accretes — an engine that died at minute two of a six-hour session must not leave
  // both files unwritten for the rest of it.
  //
  // THE RESPAWN ARM IS THE ONE WORTH READING TWICE. Ownership is taken by `sendAttach` and by
  // nothing else, and a fresh connection does not always reach one — an app with no character
  // attached leaves the engine idle by design. Handing back HERE rather than only on the null makes
  // "the engine owns these files" mean "THIS engine was told where they are", so a launch that
  // never attached cannot inherit the last one's claim and leave nobody writing. The new engine
  // takes them at its own attach, so ownership alternates in strict sequence and is never shared.
  //
  // NOT IN `bumpGen`, deliberately, even though that is where everything else that must die with
  // the turn lives: a WORLD REBUILD bumps the turn and does NOT re-attach when the log is unchanged
  // (`attachTurn.ts`), so a hand-back there would fire one second into every launch and never be
  // undone. This is the connection edge, which is the edge that actually replaces an owner.
  takeArtifactsBack(debug)
  if (info === null) {
    debug('data-server client: the engine is gone; the connection is closed')
    return
  }
  noteLogReadConnection(Date.now())
  noteReadEdge('launch', null)
  const client = createEngineClient({
    token: info.token,
    debug: (note) => {
      debug(`data-server client: ${note}`)
    }
  })
  // THE CONNECTION GUARD, for everything below: a connection is per launch and outlives a world
  // rebuild, so none of it asks the turn.
  const current = (): boolean => live?.client === client
  const link = openEngineLink({
    client,
    connect: () => connectToEngine(info.port, CONNECT_TIMEOUT_MS),
    current,
    connectFailed: (detail) => {
      debug(`data-server client: could not reach the engine on port ${String(info.port)} (${detail})`)
      noteLogReadError('connect', detail, Date.now())
    },
    connected: () => {
      debug(`data-server client: connected to the engine on port ${String(info.port)}`)
      // A FRESH TURN: whatever the last connection was in the middle of belongs to it.
      void afterConnect(bumpGen())
    },
    // The windows that were being served are told the world changed hands, exactly as on a
    // respawn (above). `attachedTo` is kept: see `LiveEngine`.
    lost: () => {
      if (engineLiveOn === null) return
      bumpGen()
      pushWorldChanged()
    },
    timer: unrefTimer,
    now: () => Date.now(),
    note: debug,
    changed: noteLogReadTouched
  })
  live = { engine: info, client, link, attachedTo: null }
  // ONCE PER CLIENT, not once per connect: the connection is reopened under this same client.
  wireEngineClient(client, {
    current,
    servable: () => engineServeReadiness().ok,
    logSize: (bytes) => {
      lastFoldLogSize = bytes
    },
    note: debug
  })
  link.start()
}

/** A timer that is never the reason this process stays alive (`delay`'s rule). */
function unrefTimer(run: () => void, ms: number): () => void {
  const handle = setTimeout(run, ms)
  handle.unref()
  return (): void => {
    clearTimeout(handle)
  }
}

/** What a new connection is told, in order. Each step is the turn's to abandon. */
async function afterConnect(mine: number): Promise<void> {
  // WHERE THE LOGS LIVE GOES FIRST, and above all BEFORE `attachAndProbe` — which returns early on
  // a launch with no character, which is the launch a served character list is most needed on. See
  // `pushLogDirNow`.
  await pushLogDirNow(mine)
  if (gen !== mine) return
  await attachAndProbe(mine)
}

// ── app knowledge, pushed (JOS-482, boundary verdict 3) ────────────────────────────────────────

/**
 * PUSH ONE FAMILY. The store is read HERE rather than by the setter that changed it, so what the
 * engine is handed is what was persisted — see `appKnowledge.ts`.
 *
 * IT IS VOIDED AND IT NEVER THROWS. A define is fire-and-forget from a preference write's point of
 * view: the user's click is answered by the app's own state, and an engine that refused the push is
 * a dev-log line rather than a failed save. Nothing in the product reads the answer.
 */
async function pushDefine(mine: number, op: DefineOp): Promise<void> {
  const l = live
  if (l === null || gen !== mine) return
  try {
    const ack = await l.client.request(op, withOwnDefs(op, readDefine(op)))
    if (gen !== mine) return
    const count = ack.count === undefined ? '' : ` (${String(ack.count)})`
    debug(`data-server define: ${op}${count}`)
  } catch (err) {
    debug(`data-server client: ${op} was refused (${describeErr(err)})`)
  }
}

/**
 * ALL FIVE, IN ONE BREATH — what the app says the moment it has a connection, and again whenever
 * the world is rebuilt.
 *
 * BEFORE THE ATTACH, ALWAYS. A define pushed at a world with no fold is HELD and applied at the
 * next attach's construction, which is the only timing that makes the engine's fold reproducible:
 * alert defs, buff trust, respawn watches, combo corrections and roster edits all change what a
 * fold produces, and a world that took them afterwards would have folded the log under a different
 * set of rules than it then serves.
 *
 * ALL FIVE ON EVERY REBUILD, not just the two that are character-scoped. It costs five small round
 * trips at a moment that already costs a whole re-fold, and it is the shape a full-set replace
 * asks for: the app states what it knows, rather than reasoning about what the engine might be
 * remembering.
 */
async function pushAllDefines(mine: number): Promise<void> {
  for (const op of DEFINE_OPS) {
    await pushDefine(mine, op)
    if (gen !== mine) return
  }
}

// ── where the logs live, pushed (JOS-498, owner ruling 21 / decision sheet 1a) ──────────────────

/**
 * TELL THE ENGINE WHERE THE CHARACTER LOGS ARE.
 *
 * ON CONNECT, AND NOT WITH THE DEFINES. `pushAllDefines` is called from `attachAndProbe`, which
 * RETURNS EARLY when this app has no character attached — "the engine is left idle" — and that early
 * return is exactly the launch this push matters most on: a fresh install has no character to attach
 * to and a picker that has to draw one anyway. So it is sent from `afterConnect`, before anything
 * can decide there is nothing to do.
 *
 * `eqLogsDir()` RATHER THAN A VALUE PASSED IN, for `appKnowledge.ts`'s reason exactly: what the
 * engine is handed must be what this app has RESOLVED, not what some caller believed at the moment
 * it noticed a change. The resolver is memoized (`config.ts`) and a settings change invalidates it
 * before this is ever called, so re-reading here is a field read on the common path.
 *
 * IT IS VOIDED AND IT NEVER THROWS, exactly as a define is: a directory the engine refused is a
 * dev-log line, and the app's own read answers every question in the meantime.
 */
async function pushLogDirNow(mine: number): Promise<void> {
  const l = live
  if (l === null || gen !== mine) return
  const dir = eqLogsDir()
  try {
    await l.client.request('logs.setDir', { dir })
    if (gen !== mine) return
    debug(`data-server logs: the engine was told to enumerate ${dir}`)
  } catch (err) {
    debug(`data-server client: logs.setDir was refused (${describeErr(err)})`)
  }
}

// ── the fires (owner ruling 22): `noteFire` moved to engineClientWiring.ts with its listener ────

// ── the attach ─────────────────────────────────────────────────────────────────────────────────

/**
 * Point the engine at the app's log and wait for its read. The turn itself (defines, attach, wait,
 * and what happens when an attach or an answer is not this turn's) is `attachTurn.ts`; this is its
 * wiring, and everything it is handed is the turn's to abandon.
 *
 * THE WAIT ARMS THE READ PATH: `sawHealth` records `engineLiveOn`, which `engineServeReadiness()`
 * reads on every served IPC. It has no deadline (JOS-518).
 */
async function attachAndProbe(mine: number): Promise<void> {
  const target = attachTarget()
  const l = live
  if (l === null || gen !== mine) return
  if (target === null) {
    debug('data-server client: no character is attached here, so the engine is left idle')
    return
  }
  await runAttachTurn({
    target,
    // ASKED, NOT CAPTURED: the generation is this file's state and a leaf never holds a copy.
    mine: () => gen === mine,
    wanted: attachTarget,
    attach: (params) => l.client.request('session.attach', params),
    health: () => l.client.request('session.health', {}),
    defines: () => pushAllDefines(mine),
    getAttached: () => l.attachedTo,
    setAttached: (logPath) => {
      l.attachedTo = logPath
    },
    // THE ARTIFACT HANDOVER (JOS-497 item 2): `attachStateDir` stops this process persisting the
    // resist ledger and the message-overlay register and only THEN answers the directory.
    // `serving` is always true (JOS-499 item 9): an attach is sent only by a connected client.
    stateDir: () => attachStateDir({ serving: true, userData: () => app.getPath('userData'), note: debug }),
    // READ FRESH AT THE ATTACH (JOS-536): the offset is a function of the date.
    clock: () => hostClockHint(new Date(), resolvedTimeZone),
    // An archive sealed before this attach is not in the fold it starts (eligible.ts rule 4).
    attaching: () => liveHistory.engineAttaching(),
    // A HISTORICAL FOLD HAS JUST STARTED (JOS-503): only for an attach the engine accepted.
    folding: noteEngineFolding,
    rest: delay,
    note: debug,
    // The code goes with it: an attach nobody answered is not an attach that was refused.
    noteError: (detail, code) => {
      noteLogReadError('attach', detail, Date.now(), code)
    },
    saw: (health) => {
      sawHealth(l, health)
      if (health.status === 'live') noteReadEdge('live', target)
    },
    logSize: () => lastFoldLogSize,
    failed: (why, detail) => {
      // A dead read is forgotten, so a later rebuild of the same log attaches again (fork #9),
      // and the catch-up bar is told there is no fold to draw.
      if (why === 'ended') {
        l.attachedTo = null
        noteEngineReadEnded()
      }
      noteLogReadError(why === 'ended' ? 'fold' : 'health', detail, Date.now())
      // AFTER the error is on record: the recovery may replace it with why it will not retry.
      if (why === 'ended') noteReadEdge('ended', target)
    }
  })
}

// ── after live (fork #9, phase R4) ─────────────────────────────────────────────────────────────

/** `afterLive.ts`: a probe answer that says not live is asked again here before it is believed. */
const afterLive = createAfterLiveWatch({
  liveOn: () => engineLiveOn,
  turn: () => gen,
  ask: () => engineRequest('session.health', {}),
  ended: readStoppedAfterLive,
  note: debug
})

/** Every healthy answer to the supervisor's 30 s probe (`engineHost.ts onHealth`). */
export function noteSupervisorHealth(health: { readonly status: string }): void {
  afterLive.probed(health.status)
}

/**
 * THE ENGINE STOPPED READING A LOG IT HAD CAUGHT UP ON. A fourth edge that lets go of a served
 * world, with the three `wasServing` ones: a new turn, the windows told (the engine WAS serving,
 * or `afterLive` would not have asked), the attach forgotten so the next one is sent, and the
 * reason on record. Whether it is read again is the recovery's call (`logReadRecovery.ts`).
 */
function readStoppedAfterLive(): void {
  const l = live
  const was = engineLiveOn
  if (l === null || was === null) return
  debug('data-server client: the engine stopped reading the log after it was live')
  bumpGen()
  pushWorldChanged()
  l.attachedTo = null
  noteEngineReadEnded()
  noteLogReadError('fold', 'the engine stopped reading after it was live', Date.now())
  noteReadEdge('endedAfterLive', was)
}

/**
 * THE CHARACTER-SWITCH FUNNEL, and the app-side half of the probe's readiness.
 *
 * Registered on `pipeline.ts sendWorldRebuilt`, which is the ONE place this process says "the world
 * for this character was rebuilt" — the same signal every window that folds a module already rides.
 * A switch reaches it, the idle rescan reaches it, an EQ-dir change reaches it, and a live epoch
 * boundary reaches it, so hooking it is how this feature inherits every one of those without a
 * second call site to keep in step.
 *
 * A REBUILD OF THE SAME LOG IS NOT A RE-ATTACH — see `attachTurn.ts`. It is still a fresh TURN and
 * a fresh probe, because this process's snapshots have just been rebuilt and are worth re-checking.
 */
function onWorldRebuilt(character: CharacterRef | null): void {
  tsWorldPath = character?.logPath ?? null
  const mine = bumpGen()
  const l = live
  if (l === null) return
  if (tsWorldPath === null) {
    // The app stopped tailing (an EQ dir with no logs). There is no `session.detach` in the
    // protocol and inventing one here would be a schema change; the engine keeps folding a file
    // nobody is asking about until the next attach replaces it, which costs a tail poll. Forgetting
    // what it is attached to is how that next attach is guaranteed to be sent — even if the log the
    // app comes back to is the one the engine still has open, which after an interlude of not
    // watching is the safe direction.
    l.attachedTo = null
    // …and a fold nobody is waiting on is not drawn over the no-logs screen.
    noteEngineReadEnded()
    debug('data-server client: the app has no character; the engine keeps its last attach')
    return
  }
  void attachAndProbe(mine)
}

// ── THE PROBE IS GONE (JOS-499) ────────────────────────────────────────────────────────────────
//
// `runParityProbe` and `askOne` asked five modules of BOTH worlds and wrote one line saying
// whether they agreed. There is one world. A parity verdict is not a thing that can be computed,
// let alone reported, and keeping a probe that compares the engine against itself would be an
// instrument that can only ever say yes.
//
// WHAT IT PROVED IS NOT LOST, it is just finished: the six-slice golden oracle
// (`npm run oracle:rust-fold`) is what established the equivalence this probe watched for drift
// against, and owner ruling 26 keeps it running against the RECORDED goldens for one more
// release. The fold WAIT survives it, because polling `session.health` until the engine goes live
// is what arms the serve path (see `engineLiveOn`) — the loop itself now lives in `foldWait.ts`,
// and what is left here is the one thing that file cannot know: what going live MEANS to this app.

// `EngineHealthSay` LIVED HERE AND IS `FoldHealth` IN `foldWait.ts` NOW (JOS-518) — the loop that
// reads it moved, and the shape belongs beside its reader.

// THE GO-LIVE SENTENCE (`servingLine`) is built in `foldWait.ts`, beside the other line a fold
// explains itself with, so `sawHealth` keeps its own shape and a test can read the sentence.

/**
 * ONE HEALTH ANSWER, ON THE WAY PAST — and everything this app does about the engine going live.
 *
 * THE SHIM'S READINESS, TAKEN OFF A ROUND TRIP THE WAIT WAS MAKING ANYWAY (JOS-489). It is recorded
 * here rather than by the loop's caller because this is the only place in this process that has
 * heard the engine say `live`, and it is recorded only on `live`: a folding answer written down as
 * live would be the shim serving a mid-scan prefix to a hydrating window.
 */
function sawHealth(l: LiveEngine, health: FoldHealth): void {
  noteLogReadHealth(health.status, health.mark?.offset, Date.now())
  if (health.status !== 'live') return
  // THE GO-LIVE EDGE (JOS-493), taken exactly once per turn: the shim starts serving on this
  // assignment, so the windows that hydrated during the fold are holding this process's own
  // state and are about to be handed the other world's cursors. `pushWorldChanged` tells them
  // to take the served world now rather than at whatever unrelated moment re-hydrates them
  // next — and it is inside the `first` test because this loop can run many times per turn.
  const first = engineLiveOn === null
  engineLiveOn = l.attachedTo
  // THE SERVED FILE FACT, on the way past (owner ruling 21). Absent means absent — never zero,
  // which would graft a `lastPlayed` of 1970 onto a character card.
  engineLogMtime = health.logMtimeMs ?? null
  if (first) {
    pushWorldChanged()
    // THE MIRRORS ARE PRIMED ON THE SAME EDGE, and it has to be this one rather than the first
    // read: the engine publishes a cursor when a module MOVES, and a module that has finished
    // folding and gone quiet will not move again for minutes. A mirror waiting for a cursor that
    // is not coming would fall back on every draw of a card the engine could answer perfectly.
    primeMirrors()
    // THE GO-LIVE SENTENCE (JOS-499), and it replaces a line rather than adding one.
    //
    // The PARITY line used to be printed at exactly this moment — it was the app's own
    // statement that both folds had landed on the same log and the engine's ingest was live —
    // and two e2e specs used it as their READINESS PRECONDITION rather than for its verdict.
    // The verdict is gone with the second world; the readiness it also carried is a real fact
    // about this launch and is still the one moment worth naming, because it is precisely when
    // `engineServeReadiness()` starts answering yes and every read in the product changes hands.
    //
    // IT REPORTS WHAT IT CAN VOUCH FOR: the log both sides agree on, the engine's own event
    // count and byte mark. Those come off the health round trip this loop was making anyway, so
    // the line costs nothing and is evidence rather than an announcement.
    debug(servingLine(l.attachedTo, health))
    // What the read made of the log, for the status's notes (logReadState.ts decides).
    noteLogReadLanded(health.events, health.mark?.offset)
  }
  // THE BANNER RESOLVES HERE (JOS-503), and OUTSIDE the `first` test on purpose. `first` is
  // about this app's own read path changing hands, which happens once; this is about a window
  // being told the catch-up is over, and a second turn that finds the engine already live
  // (a world rebuild on an unchanged log) must still take a stale bar down rather than leave
  // one up because the interesting edge belonged to an earlier turn. `set` is a no-op when
  // nothing changed, so saying it every poll costs a comparison.
  noteEngineLive()
}

/** What this file knows about the read, for the "Reading log..." report (fork #9). */
export function engineClientFacts(): {
  connection: ConnectionState | null
  readiness: string
  logSize: number | null
  link: LinkFacts | null
} {
  const ready = engineServeReadiness()
  return {
    connection: live?.client.state ?? null,
    readiness: ready.ok ? 'ok' : ready.why,
    logSize: lastFoldLogSize,
    link: live?.link.facts() ?? null
  }
}

/** A person asked for a new connection (`engineLink.ts reopen`): one that is up and not answering
 *  is dropped first. The engine keeps its world, so nothing is read again. */
export function reconnectEngineClient(): void {
  live?.link.reopen()
}

/**
 * A person asked for the log to be read again (the status's Try again, fork #9): a new turn, and
 * an attach that is sent even though the engine was already pointed at this log. It re-reads the
 * log from the start. With no connection to send it on, the connection is what is tried.
 */
export function reattachEngineLog(): void {
  const l = live
  if (l === null) return
  if (l.client.state !== 'ready') {
    l.link.reopen()
    return
  }
  // The windows this engine was serving are told the world changed hands, as on a respawn.
  const wasServing = engineLiveOn !== null
  const mine = bumpGen()
  if (wasServing) pushWorldChanged()
  l.attachedTo = null
  void attachAndProbe(mine)
}

// ── what the performance panel can ask this file (JOS-483) ─────────────────────────────────────
//
// TWO READS AND ONE REQUEST, and every one of them is main-side. The renderer never reaches the
// engine — brokering a client into a window is JOS-484's job — so the panel's data arrives the way
// every other number in that panel arrives: main measures, main pushes, over the perf channels that
// already exist.

// `ParitySummary` / `lastParitySummary()` LIVED HERE AND ARE GONE (JOS-499), with the probe that
// produced them. The performance panel drew "5 agree, 0 diverge"; with one world there is nothing
// to agree with. `enginePerfWatch.ts` sends `parity: null` and the panel already draws that as
// "no verdict", which is now permanent rather than "no probe has run yet".

/**
 * Ask the engine what it costs. `null` when there is no connected engine to ask.
 *
 * IT DOES NOT WAIT FOR A CONNECTION and it does not open one: the client is the supervisor's to
 * make, and a perf panel must never be the reason a socket exists. A rejection resolves to `null`
 * rather than throwing, for the reason this whole file exists — a diagnostic that can break the
 * thing it measures is worse than no diagnostic. The refusal is still logged, once, at debug.
 */
export async function enginePerfSnapshot(): Promise<PerfSnapshotResult | null> {
  const l = live
  if (l === null) return null
  try {
    return await l.client.request('perf.snapshot', {})
  } catch (err) {
    debug(`data-server client: perf.snapshot was refused (${describeErr(err)})`)
    return null
  }
}

/**
 * Ask the engine how it is doing against its own budgets (JOS-502). `null` on the same terms.
 *
 * THE SWALLOW-TO-NULL POSTURE IS COPIED DELIBERATELY, not inherited by accident. `engineRequest`
 * below rejects rather than answering `null`, and the line between them is stated there: a READ
 * whose answer a user sees owes its caller a reason, while a DIAGNOSTIC that cannot be taken has
 * nothing to say. These two are diagnostics — the panel draws an absent section rather than an
 * error.
 */
export async function enginePerfBudgets(): Promise<PerfBudgetsResult | null> {
  const l = live
  if (l === null) return null
  try {
    return await l.client.request('perf.budgets', {})
  } catch (err) {
    debug(`data-server client: perf.budgets was refused (${describeErr(err)})`)
    return null
  }
}

// ── the typed request bridge, for main-side callers (JOS-489) ──────────────────────────────────
//
// `enginePerfSnapshot` above was the first main-side caller of this connection and it is a
// DIAGNOSTIC: it asks one op, swallows every failure into `null`, and nothing branches on the
// answer. The compat shim is the first caller whose answer a USER sees, so it needs two things that
// one did not — any op rather than one, and a statement about whether asking is worth doing at all.
// Those are the two exports below, and they are still the whole of what this file lets anybody do
// with the socket: no client handle escapes, so a caller cannot subscribe, cannot re-attach, and
// cannot outlive the launch it is talking to.

/**
 * IS THE ENGINE IN A STATE WHERE ITS ANSWERS MAY BE THIS APP'S ANSWERS?
 *
 * FOUR QUESTIONS, IN THE ORDER THAT MAKES EACH ONE MEANINGFUL. Is there a client at all; is its
 * connection up; are the two worlds on the SAME FILE; and has the engine's fold on that file gone
 * live. The third is the one the parity probe taught (`parityProbe.ts whereBoth`, "two folds of
 * different files is the one failure that would make every other number a lie") — and it is asked
 * against `tsWorldPath` rather than against the active character, because `tsWorldPath` is the log
 * THIS PROCESS has finished folding and therefore the only one whose answers the shim is choosing
 * between. During a historical scan of a newly-picked character the two differ, and falling back
 * there is right: this app's own fold is mid-scan too.
 *
 * IT IS CHEAP ON PURPOSE — four field reads, no allocation, no round trip — because it is asked on
 * every read IPC, which is a channel a hydrating window opens a dozen of at once.
 */
export function engineServeReadiness(): Readiness {
  const l = live
  if (l === null) return { ok: false, why: 'noClient' }
  if (l.client.state !== 'ready') return { ok: false, why: 'notConnected' }
  const ours = tsWorldPath
  if (ours === null || l.attachedTo !== ours) return { ok: false, why: 'notAttached' }
  if (engineLiveOn !== ours) return { ok: false, why: 'notLive' }
  return SERVABLE
}

/**
 * IS THERE AN ENGINE ON THE OTHER END OF THIS SOCKET AT ALL?
 *
 * THE WEAKER OF THIS FILE'S TWO READINESS QUESTIONS, and the weakness is the whole point rather than
 * a shortcut. `engineServeReadiness` above asks four things because it guards reads of a FOLD: two
 * of its four — are the worlds on the same file, has that file's fold gone live — are questions
 * about a log, and a caller that skipped them would draw one character's rows under another's name.
 *
 * `logs.list` NAMES NO LOG. It enumerates the directory the app pushed, which is a question about a
 * FOLDER and is answerable by a world that has attached to nothing whatsoever — and the launch it
 * matters most on is precisely the one where nothing is attached, because a fresh install has
 * characters to choose between before there is anything to fold. Asking the four-part question there
 * would refuse every answer this op exists to give, on grounds that have nothing to do with it.
 *
 * SO THE SET OF REASONS IS THE SAME AND ONLY THE FIRST TWO ARE ASKED (`readShim.ts FallbackReason`):
 * is there a client, and is its connection up. No third arm was invented — a fallback reason nobody
 * can act on differently is a reason not worth a member.
 */
export function engineConnectedReadiness(): Readiness {
  const l = live
  if (l === null) return { ok: false, why: 'noClient' }
  if (l.client.state !== 'ready') return { ok: false, why: 'notConnected' }
  return SERVABLE
}

/**
 * ONE TYPED REQUEST TO THE ENGINE, for a main-side caller.
 *
 * IT REJECTS RATHER THAN ANSWERING `null`, which is the difference from `enginePerfSnapshot` and is
 * deliberate: a diagnostic that cannot be taken has nothing to say, but a READ that could not be
 * served has to tell its caller WHY so the fallback can be counted and named. `readShim.ts` is that
 * caller and it catches everything; the rejection never reaches a renderer.
 *
 * NO READINESS CHECK HERE. The shim asks `engineServeReadiness` first and would rather have a
 * refusal describe the request than have this function guess at which of two states it was in —
 * one authority per question.
 */
export async function engineRequest<O extends RequestOp>(
  op: O,
  params: ParamsFor<O>
): Promise<ResultFor<O>> {
  const l = live
  if (l === null) throw new EngineError('unavailable', 'there is no engine on this launch')
  return l.client.request(op, params)
}

// ── the composition root's two verbs ────────────────────────────────────────────────────────────

/**
 * Arm the client. Called by `engineHost.ts` from inside its own `EQC_ENGINE` guard, so this file
 * never reads the flag and there is one gate rather than two.
 */
export function installEngineClient(): void {
  setWorldRebuiltObserver(onWorldRebuilt)
  // THE PREFERENCE-WRITE EDGE (JOS-482). One slot, filled here and nowhere else, so an ipc setter
  // can say "this family moved" without importing the engine client — and so that a launch with
  // `EQC_ENGINE=0` finds a null and pays one comparison per preference write.
  setAppKnowledgePusher((op) => {
    const mine = gen
    void pushDefine(mine, op)
  })
  // THE EQ-DIRECTORY EDGE (JOS-498), by the same one-slot rule and for the same reason: `session.ts`
  // must be able to say "the directory moved" without importing this file, which imports `session.ts`
  // — that is a cycle, and the slot is what inverts it.
  setLogDirPusher(() => {
    const mine = gen
    void pushLogDirNow(mine)
  })
  // THE MIRROR'S REQUESTER (JOS-496), by the same one-slot rule and for the same reason: the mirror
  // is a leaf that main's synchronous readers import, and a leaf that imported this file back would
  // be a cycle between two modules that boot each other. It gets exactly one op and no client
  // handle, which is the whole of what this file lets anybody do with the socket.
  installMirrors({
    request: async (module) => {
      const r = await engineRequest('module.snapshot', { module })
      return { module: r.module, seq: r.seq, state: r.state }
    },
    note: debug
  })
  // THE WIKI-MISS ANSWERER'S CAPABILITIES (JOS-499 item 1), by the same one-slot rule. The two
  // lookups are handed over rather than imported by the leaf because both of them load `electron`
  // at module scope and the decision the leaf holds is worth pinning under plain node; the record
  // widening happens HERE, where the concrete `ItemKnowledge`/`MobKnowledge` types are in scope and
  // the protocol's open-map declaration is being honoured deliberately. Local answers only: no wiki
  // request (owner, 2026-10-26), and a cached offline miss is no answer.
  installKnowledgeMissFetch({
    lookupItem: (name) => Promise.resolve(heldRecord(knownItem(name))),
    lookupMob: (name) => Promise.resolve(heldRecord(knownMob(name))),
    define: async (params) => {
      await engineRequest('knowledge.define', params)
    },
    note: debug
  })
}

/** A held knowledge record for the engine, or null when there is none worth defining. */
function heldRecord(k: { offline?: boolean } | null): KnowledgeRecord | null {
  return k === null || k.offline === true ? null : asKnowledgeRecord(k)
}

/** Let go: no observer, no connection, no pusher. Idempotent, and safe on a process that never
 *  armed one. */
export function stopEngineClient(): void {
  // The same edge `onEngineReady(null)` reports, for the path that lets go deliberately.
  const wasServing = engineLiveOn !== null
  bumpGen()
  if (wasServing) pushWorldChanged()
  setWorldRebuiltObserver(null)
  setAppKnowledgePusher(null)
  setLogDirPusher(null)
  // …and the mirrors, which clear themselves on the null (see `installMirrors`): a synchronous
  // reader must never be left holding a served fact after the connection that served it is gone.
  installMirrors(null)
  // …and the wiki-miss fetcher, for the mirrors' reason exactly: a fetch that lands after the
  // connection it was answering is gone has nowhere to push its record, and a leaf still holding a
  // requester for a dead client would be pushing into a closed socket.
  installKnowledgeMissFetch(null)
  // THE PERSISTED ARTIFACTS ARE DELIBERATELY NOT HANDED BACK HERE (JOS-497 item 2), and the
  // asymmetry with `onEngineReady` is the point. This is the TEARDOWN path and its only caller is
  // `stopEngineSupervisor`, which both quit events reach: what follows it is `main:saveOverlay`,
  // the app's synchronous quit-final. Resuming ownership on the way out would let this process
  // publish its own register over the one the engine has been maintaining, at the one moment
  // nothing is left to correct it — the app getting the LAST word about a file it does not own.
  // What that costs instead is the residual JOS-496 already named and priced: at most sixty
  // seconds of the folding character's accretion, whose bucket the next attach re-derives from the
  // log anyway.
  live?.link.stop()
  live?.client.close()
  live = null
}
