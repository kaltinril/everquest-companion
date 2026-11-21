// ============================================================================
// engineClientWiring.ts — WHAT MAIN'S ENGINE CLIENT IS LISTENED TO FOR (split out of
// engineClientHost.ts, fork #9).
// ============================================================================
//
// The seven things main hears from its engine besides replies: alert fires, fold progress, con
// cards, module cursors, wiki misses, a reply that was too large, and the connection's own state
// (which the log-read status is told about). The first five lived inside
// `engineClientHost.ts openConnection` and were registered on every connect; they are registered
// ONCE PER CLIENT here, because the connection is now reopened under the same client
// (`linkKeeper.ts`) and a listener added per connect would be called once per reconnect, per frame.
//
// IT HOLDS NO STATE OF THE HOST'S. Whether this is still the client the app is using, and whether
// the read path is taking this engine's answers, are asked through `WiringHost`, so this file
// does not import `engineClientHost.ts` back.

import type { EngineClient, OversizeNote } from '../../shared/dataServer/client'
import type { FireMessage } from '../../shared/dataServer/protocol.generated'
import { humanBytes } from '../../shared/engineLaunch'
// THE AUDIO CUTOVER (JOS-491). It owns its own flag and its own gate; this file simply offers it
// every fire and prints what it decided. A launch that turned it off (`EQC_ENGINE_ALERTS=0`, or
// `EQC_ENGINE_SERVE=0` above it) finds `armed` false and pays one boolean read per fire.
import { playEngineFire } from './alertsAudio'
import { takeOwnFire } from './ownFires'
// THE CON-CARD CUTOVER (JOS-496). Same shape as the audio one above and behind the serve flag
// rather than a fourth of its own; this file simply offers every card and prints what was decided.
import { conCardServeLine, noteConCardServe, openEngineConCard } from './conCardServe'
import { noteFoldProgress } from './engineLaunchState'
import { onKnowledgeMiss } from './knowledgeMissFetch'
import { noteEngineHeard, noteLogReadTouched, noteReplySize } from './logReadState'
import { replySizes, sizedReply } from './replySizes'
import { pushModuleChanged } from './serveDeltas'
import { noteMirrorChanged } from './serveMirrors'

/** What the listeners need from the file that owns the connection. */
export interface WiringHost {
  /** Is this still the client the app is using? THE CONNECTION GUARD, never the turn: a
   *  subscription is connection-scoped and the turn advances on every world rebuild. */
  readonly current: () => boolean
  /** Is the read path taking this engine's answers right now (`engineServeReadiness().ok`)? */
  readonly servable: () => boolean
  /** The engine stated how big the log is (a progress frame's `logSize`). */
  readonly logSize: (bytes: number) => void
  /** The dev log. */
  readonly note: (line: string) => void
}

function describeErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── the fires (owner ruling 22) ────────────────────────────────────────────────────────────────

/** How many fires this launch has heard from the engine. Reported beside each one. */
let firesHeard = 0

/**
 * ONE ALERT FIRE FROM THE ENGINE — LOGGED AND COUNTED, AND PLAYED ONLY WHEN THE CUTOVER IS ARMED.
 *
 * WITH THE CUTOVER TURNED OFF (`EQC_ENGINE_ALERTS=0`) this is exactly what JOS-482 shipped: a line,
 * and no sound. The app's own `AlertsModule` is still firing and is still the only noise, because
 * playing this one too would double every alert the owner hears — and the owner is the regression
 * test for this whole program, so a duplicated sound would not be a cosmetic bug, it would corrupt
 * the evidence the cutover is being judged on.
 *
 * WITH THE FLAG (JOS-491) the two swap in one place rather than both being live: `alertsAudio.ts`
 * silenced this process's evaluator at arm time, so `playEngineFire` is the only thing publishing
 * a firing and the sound is engine-attributed by construction. The line stays either way, and says
 * which world it was in.
 *
 * WHAT THE LINE PROVES, even unplayed, is everything a sound would: the def reached the engine, the
 * engine evaluated it against a LIVE event, and the frame it sent back is fully resolved — the pack
 * key is right there, so the app needs nothing else to play it.
 */
function noteFire(fire: FireMessage, note: (line: string) => void): void {
  // The app's own line watch (ownFires.ts: the screenshot macro) is a command, not an alert: no sound.
  if (takeOwnFire(fire)) {
    note(`data-server fire: ${fire.rule} taken by the app`)
    return
  }
  firesHeard += 1
  const outcome = playEngineFire(fire) ? 'PLAYED from the engine' : 'logged, not played'
  note(
    `data-server fire: ${fire.rule} [${fire.sound}] at ${String(fire.at)} — ` +
      `${fire.message} (fires this launch: ${String(firesHeard)}; ${outcome})`
  )
}

// ── a reply that was too large (fork #9) ───────────────────────────────────────────────────────

/**
 * ONE LARGE REPLY, noted for the read path (`replySizes.ts`) and for the "Reading log..." report
 * (`logReadState.ts`). `sizedReply` decides which limit it was over.
 */
function noteOversize(sized: OversizeNote, note: (line: string) => void): void {
  const noted = sizedReply(sized)
  if (noted === null) return
  const { op, module, chars, limit } = noted.reply
  noteReplySize(noted.reply, Date.now())
  replySizes.note(noted.key, chars, sized.refused)
  const what = module === null ? op : `${op} (${module})`
  const fate = limit === null ? 'large' : `over the ${humanBytes(limit)} ${sized.refused ? 'read' : 'show'} limit`
  note(`data-server client: the reply to ${what} was ${humanBytes(chars)}, ${fate}`)
}

// ── the registrations ──────────────────────────────────────────────────────────────────────────

/** Register every listener on `client`. Once per client: see the header. */
export function wireEngineClient(client: EngineClient, host: WiringHost): void {
  // THE FIRES — logged and counted always, PLAYED when the cutover armed. See `noteFire`.
  client.onFire((fire) => {
    noteFire(fire, host.note)
  })
  // THE FOLD'S OWN MEASUREMENT (JOS-503), for the launch banner. The identity guard is the
  // CONNECTION one and not the turn one, for the reason spelled out on `onConCard` below: the turn
  // advances on every world rebuild, so asking it here would silence the bar one second into
  // every launch — which is precisely the bug that cost the cursor listener a whole e2e round.
  //
  // THE HOST CLOCK IS READ HERE AND NOWHERE DEEPER. `Date.now()` is the estimate's only clock, and
  // it is taken at the one instant it is honest: when the frame arrived. Passing it down means the
  // arithmetic in `shared/engineLaunch.ts` reads no clock at all and is pure integer maths in a
  // test. A live-tail frame is dropped by `noteFoldProgress` itself — see its header.
  client.onProgress((progress) => {
    if (!host.current()) return
    // Proof of life for the watchdog: the engine is talking on this connection (logReadState.ts).
    noteEngineHeard(Date.now())
    // THE DENOMINATOR, KEPT (JOS-518) — see `engineClientHost.ts lastFoldLogSize`. Taken from every
    // frame including a live-tail one, because what it states is how big the engine believes the
    // FILE to be, which is true of the log whichever loop measured it; the banner's own live-frame
    // refusal is a separate question and `noteFoldProgress` owns it.
    host.logSize(progress.logSize)
    noteFoldProgress(progress, Date.now())
  })
  // THE CON CARDS (JOS-496, boundary verdict 2) — `onFire`'s shape exactly, and for its reasons: a
  // thing that HAPPENED, connection-wide, nothing to reconcile. This file offers the frame and
  // prints what was decided; `conCardServe.ts` owns the gate and `conCard.ts` owns the window.
  //
  // THE IDENTITY GUARD IS THE `moduleChanged` ONE AND NOT THE TURN ONE, for the reason stated
  // below at length: a subscription is CONNECTION-scoped, and the turn advances on every world
  // rebuild — asking it here would silence the cards one second into every launch, which is
  // exactly the bug that cost the cursor listener a whole e2e round.
  client.onConCard((card) => {
    if (!host.current()) return
    // THE DRAW IS ASYNCHRONOUS SINCE JOS-497 item 1 — the card's chips need the creature's LEVEL,
    // and that is a served answer now rather than a synchronous read of this process's fold. So
    // this listener stays synchronous (the client's frame dispatch is), starts the draw, and
    // narrates when it settles.
    //
    // IT IS VOIDED AND IT NEVER THROWS, which is the same rule `noteMirrorChanged` and
    // `playEngineFire` learned. `openEngineConCard` already answers `false` for every ordinary
    // refusal, so the catch is for the unexpected, and what it does with it is print a line.
    void openEngineConCard(card)
      .then((drew) => {
        noteConCardServe(conCardServeLine(card, drew))
      })
      .catch((err: unknown) => {
        host.note(`data-server conCard: ${card.name} could not be drawn (${describeErr(err)})`)
      })
  })
  // THE CURSORS (JOS-493) — the engine saying a module's published state moved, forwarded to every
  // window that folds one. Two guards, and each answers a different question:
  //
  //   * IS THIS STILL THE CONNECTION THIS APP IS USING. A subscription is CONNECTION-scoped, not
  //     turn-scoped, and that distinction cost a whole e2e round to learn: the first draft asked
  //     the turn — the rule every `await` in `engineClientHost.ts` is followed by — and the turn
  //     advances on every WORLD REBUILD (`onWorldRebuilt`), which happens the moment this
  //     process's own fold lands. So the listener went permanently silent one second into every
  //     launch and the live fold stopped reaching every renderer. MEASURED: a loot line played
  //     into the log never reached the ledger, and a watched respawn never drew a clock. Identity
  //     is the right question, and the host is where the answer is.
  //   * `host.servable()` — the READ path is not taking this engine's answers right now (still
  //     folding, on another log, connection not ready). A window's held snapshot therefore came
  //     from THIS PROCESS's fold, and handing it a cursor from the other world is the very mixing
  //     this ticket exists to end. That is the question a turn number was reaching for, and it is
  //     asked here of the one function that owns it.
  client.onModuleChanged((changed) => {
    if (!host.current()) return
    // Proof of life, taken before the servable check: a frame the windows may not use yet still
    // says the engine is running.
    noteEngineHeard(Date.now())
    if (!host.servable()) return
    pushModuleChanged(changed.module, changed.seq)
    // …and main's own synchronous readers, which ride the same cursor for the same reason the
    // renderers do: a mirror refreshed on anything but the engine's own publication edge would be a
    // cache with a timer, which is the thing ruling 5 forbids.
    noteMirrorChanged(changed.module, changed.seq)
  })
  // THE WIKI MISSES (JOS-499 item 1, boundary verdict 5) — the engine saying it could not answer a
  // name, answered by the app's own lookup and pushed back as `knowledge.define`.
  //
  // THE GUARD IS THE CONNECTION ONE, NOT THE TURN ONE, and it is the `onConCard`/`onModuleChanged`
  // reasoning verbatim: a subscription is CONNECTION-scoped while the turn advances on every world
  // rebuild, so asking it here would silence the fetcher one second into every launch — the exact
  // bug that cost the cursor listener a whole e2e round. It is written out again rather than
  // cross-referenced because getting it wrong is silent: the corpus would simply stop learning
  // and nothing would ever say so.
  //
  // AND THERE IS NO READINESS GATE HERE, unlike the cursor listener above. `host.servable()` asks
  // whether the engine's answers may be THIS APP'S answers — a question about which world a read
  // is served from. A miss is not a read: it names a page the wiki has and the corpus lacks, which
  // is true of every world at once and stays true across a character switch. Gating it would drop
  // exactly the misses raised during a fold, which is when a log full of unfamiliar mobs raises
  // nearly all of them.
  client.onKnowledgeMiss((miss) => {
    if (!host.current()) return
    onKnowledgeMiss(miss)
  })
  // A REPLY THAT WAS TOO LARGE, OR MERELY LARGE (fork #9) — see `noteOversize`.
  client.onOversize((sized) => {
    if (!host.current()) return
    noteOversize(sized, host.note)
  })
  // THE CONNECTION'S OWN STATE (fork #9): the log-read status says `connecting` / `connected`
  // from it, and nothing else tells the status that it moved.
  client.onState(() => {
    if (host.current()) noteLogReadTouched()
  })
}
