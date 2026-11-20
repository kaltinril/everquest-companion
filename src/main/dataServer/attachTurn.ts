// attachTurn.ts - ONE TURN OF POINTING THE ENGINE AT A LOG: the defines, the attach, the wait
// (fork #9, phase R4). Taken out of `engineClientHost.ts`, which keeps what going live MEANS.
//
// WHAT DID NOT CHANGE IN THE MOVE. The defines are pushed before any attach. An attach is a whole
// re-fold, so it is sent only when the file changes: a rebuild of the log the engine is already on
// sends none. The artifact handover (`stateDir`) happens before the request object exists. The
// catch-up bar and the archive are told only about an attach the engine accepted.
//
// WHO TELLS THEM changed with rule 1 below: a later turn may now find the engine on its log and
// send nothing, so a replaced turn's accepted attach still tells the archive (it is true of every
// accepted attach) and, when the app still wants that log, the bar.
//
// WHAT IS NEW, and each rule closes a way the app got stuck or showed the wrong character:
//
//   1. WHAT THE ENGINE WAS TOLD IS RECORDED EVEN WHEN THE TURN IS STALE. Switch A, B, A: B's
//      attach was on the wire when the turn went back to A, its reply found a stale turn and was
//      dropped, main went on believing A, sent no attach, and served B's fights under A's name.
//   2. AN ATTACH THE CONNECTION DROPPED RECORDS NOTHING. The reconnect's own turn sends it again.
//   3. AN ATTACH NOBODY ANSWERED IS NOT A REFUSAL. The engine may have taken it: the wait asks,
//      and a health answer that names this log adopts it. One that does not means it was not taken,
//      and the attach is sent again, twice at most, `ATTACH_RESEND_PAUSES_MS` apart.
//   4. A HEALTH ANSWER IS ABOUT THIS TURN ONLY WHEN ITS MARK NAMES THIS TURN'S LOG. The mark is
//      compared with the TARGET, not with what main believes is attached. An answer about another
//      log is not passed on (so it can never be recorded as live), main forgets the attach and
//      sends it once more; a second such answer in the turn is recorded and the turn stops.
//
// EVERYTHING THAT RE-SENDS HAS A CAP: one turn sends at most four attaches.
//
// A LEAF, like `foldWait.ts`: the requests, the turn, the sleep and every side effect are handed
// in, so `tests/dataServerAttachTurn.test.mts` drives each order of replies with a fake engine.

import { EngineError } from '../../shared/dataServer/client'
import { isLinkLost, type ParamsFor } from '../../shared/dataServer/ops'
import { waitForFold, type FoldHealth } from './foldWait'

/** How long to rest before each re-send of an attach nobody answered. Its length is the cap. */
export const ATTACH_RESEND_PAUSES_MS: readonly number[] = [2_000, 5_000]

/** The Last error row when the engine stays on another log: `open log: <this>`. */
export const ELSEWHERE_DETAIL = 'the engine is reading another log'
/** The error code that goes with it (`shared/logReadReport.ts` reads it as the `mismatch` wait). */
export const ELSEWHERE_CODE = 'mismatch'

/** Everything the turn cannot get for itself. */
export interface AttachTurnDeps {
  /** The log this turn points the engine at. */
  readonly target: string
  /** Is this still the turn that started? Asked after every suspension point. */
  readonly mine: () => boolean
  /** The log the app wants the engine on NOW, whichever turn is asking. */
  readonly wanted: () => string | null
  /** `session.attach` on main's connection. */
  readonly attach: (params: ParamsFor<'session.attach'>) => Promise<{ readonly epoch: number; readonly accepted: boolean }>
  /** `session.health` on main's connection. */
  readonly health: () => Promise<FoldHealth>
  /** Push what the app knows. Before any attach, always. */
  readonly defines: () => Promise<void>
  /** The log main believes the engine is on. */
  readonly getAttached: () => string | null
  readonly setAttached: (logPath: string | null) => void
  /** THE ARTIFACT HANDOVER (`artifactOwner.ts attachStateDir`): stops this process persisting,
   *  then answers the directory to send. */
  readonly stateDir: () => string | undefined
  /** The host's clock hint, read fresh at each attach. */
  readonly clock: () => ParamsFor<'session.attach'>['clock']
  /** An attach is about to be sent. Answers what to call once the engine has taken it: the
   *  archive's half (`liveHistory.engineAttaching`), true of every accepted attach, stale or not. */
  readonly attaching: () => () => void
  /** A historical fold began that this app is waiting on: the catch-up bar's half. */
  readonly folding: () => void
  /** Sleep, without ever being the reason this process stays alive. */
  readonly rest: (ms: number) => Promise<void>
  /** The dev log. */
  readonly note: (line: string) => void
  /** The attach failed for good: the status's error (`code` is the engine error's, or ours). */
  readonly noteError: (detail: string, code: string | null) => void
  /** One health answer ABOUT THIS LOG, on the way past: the host's go-live edge. */
  readonly saw: (health: FoldHealth) => void
  /** The narration's denominator (`foldWait.ts`). */
  readonly logSize: () => number | null
  /** The read `ended`, or the polls went `unanswered` (`foldWait.ts`). */
  readonly failed: (why: 'ended' | 'unanswered', detail: string) => void
}

interface Turn {
  readonly deps: AttachTurnDeps
  /** The attach nobody answered: what to call if the engine turns out to have taken it. */
  unanswered: { readonly taken: () => void; readonly detail: string } | null
  /** The last health answer was not about this turn's log. */
  elsewhere: boolean
  resends: number
  differences: number
}

function describeErr(err: unknown): string {
  if (err instanceof EngineError) return `${err.code}: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

function spelled(path: string): string {
  return path.replace(/[\\/]+/g, '/').toLowerCase()
}

/**
 * Is this health answer about `target`? The mark's `log` is the path the app handed the engine,
 * compared in any letter case and either slash. A mark with no log cannot disagree.
 */
export function markAgrees(mark: FoldHealth['mark'], target: string): boolean {
  const log = mark?.log
  return log === undefined || spelled(log) === spelled(target)
}

/** The attach was answered. True when the turn goes on to the wait. */
function attached(turn: Turn, result: { readonly epoch: number; readonly accepted: boolean }, taken: () => void): boolean {
  const { deps } = turn
  const mine = deps.mine()
  // RULE 1. `accepted: false` lost to a later attach, whose own reply records its own log.
  if (result.accepted || mine) deps.setAttached(deps.target)
  if (result.accepted) {
    // The bar is told by the turn that owns the fold. A turn replaced by a rebuild of the SAME
    // log still tells it: the new turn finds the engine on its log and sends nothing.
    if (mine || deps.wanted() === deps.target) deps.folding()
    taken()
  }
  if (!mine) return false
  deps.note(
    `data-server engine attached: ${deps.target} (epoch ${String(result.epoch)}, ` +
      `accepted ${String(result.accepted)})`
  )
  return true
}

/** The attach was not answered with a result. True when the turn goes on to the wait. */
function notAttached(turn: Turn, err: unknown, taken: () => void): boolean {
  const { deps } = turn
  deps.note(`data-server client: session.attach was refused (${describeErr(err)})`)
  // RULE 2, and a turn that was replaced meanwhile says nothing.
  if (isLinkLost(err) || !deps.mine()) return false
  if (err instanceof EngineError && err.code === 'timeout') {
    // RULE 3: the wait finds out whether the engine took it.
    turn.unanswered = { taken, detail: describeErr(err) }
    return true
  }
  deps.noteError(describeErr(err), err instanceof EngineError ? err.code : null)
  return false
}

/** `session.attach`. True when the turn goes on to the wait. */
async function sendAttach(turn: Turn): Promise<boolean> {
  const { deps } = turn
  const logPath = deps.target
  // The handover first: the engine must not learn where the files are while this process writes them.
  const stateDir = deps.stateDir()
  const clock = deps.clock()
  const taken = deps.attaching()
  let result: { readonly epoch: number; readonly accepted: boolean }
  try {
    result = await deps.attach(stateDir === undefined ? { logPath, clock } : { logPath, stateDir, clock })
  } catch (err) {
    return notAttached(turn, err, taken)
  }
  return attached(turn, result, taken)
}

/** One health answer: passed on only when it is about this turn's log (rules 3 and 4). */
function sawHere(turn: Turn, health: FoldHealth): void {
  const { deps } = turn
  const pending = turn.unanswered
  // An attach nobody answered is adopted only on the engine's own word that it is on this log.
  const names = pending === null ? markAgrees(health.mark, deps.target) : namesLog(health, deps.target)
  if (!names) {
    turn.elsewhere = true
    return
  }
  if (pending !== null) {
    turn.unanswered = null
    deps.setAttached(deps.target)
    deps.note(`data-server engine attached: ${deps.target} (the attach went unanswered; the engine has it)`)
    deps.folding()
    pending.taken()
  }
  deps.saw(health)
}

function namesLog(health: FoldHealth, target: string): boolean {
  return health.mark?.log !== undefined && markAgrees(health.mark, target)
}

/** The engine is not on this turn's log. True when the attach is to be sent again. */
async function sendAgain(turn: Turn): Promise<boolean> {
  const { deps } = turn
  const pending = turn.unanswered
  if (pending === null) return differs(turn)
  // The attach nobody answered was not taken either.
  turn.unanswered = null
  if (turn.resends >= ATTACH_RESEND_PAUSES_MS.length) {
    deps.note('data-server client: the engine never took the attach; this turn stops sending it')
    deps.noteError(pending.detail, 'timeout')
    return false
  }
  const pause = ATTACH_RESEND_PAUSES_MS[turn.resends]
  turn.resends += 1
  deps.note(
    `data-server client: the engine did not take the attach; sending it again in ${String(pause)} ms ` +
      `(${String(turn.resends)} of ${String(ATTACH_RESEND_PAUSES_MS.length)})`
  )
  await deps.rest(pause)
  return deps.mine()
}

/** RULE 4: the engine answered about another log. True the first time, when one more attach is sent. */
function differs(turn: Turn): boolean {
  const { deps } = turn
  turn.differences += 1
  deps.setAttached(null)
  if (turn.differences > 1) {
    deps.note('data-server client: the engine is still reading another log; this turn stops')
    deps.noteError(ELSEWHERE_DETAIL, ELSEWHERE_CODE)
    return false
  }
  deps.note('data-server client: the engine is reading another log; attaching once more')
  return true
}

/**
 * Point the engine at `deps.target` and wait for its read. Resolves when the read is live, has
 * ended, could not be started, or the turn was replaced.
 *
 * THE ATTACH HAPPENS EVEN WHEN NOTHING CAN BE SERVED YET. An engine that becomes ready while the
 * app is still resolving its character starts reading at once.
 */
export async function runAttachTurn(deps: AttachTurnDeps): Promise<void> {
  // WHAT THE APP KNOWS GOES FIRST: a define pushed after the attach would fold the log under
  // other rules than it then serves (`engineClientHost.ts pushAllDefines`).
  await deps.defines()
  if (!deps.mine()) return
  const turn: Turn = { deps, unanswered: null, elsewhere: false, resends: 0, differences: 0 }
  for (;;) {
    // AN ATTACH IS A WHOLE RE-FOLD, so it is sent only when the FILE changes. This runs twice on an
    // ordinary launch (the engine becoming ready, then the app's own world landing on the same
    // log), and a second attach there would read the whole log twice for nothing.
    if (deps.getAttached() !== deps.target && !(await sendAttach(turn))) return
    if (!deps.mine()) return
    if (!(await waitHere(turn)) || !deps.mine()) return
    if (!(await sendAgain(turn))) return
  }
}

/**
 * Wait for this turn's read (`foldWait.ts`: no deadline; `deps.saw` is where the host records the
 * engine going live). True when the engine turned out not to be on this turn's log.
 */
async function waitHere(turn: Turn): Promise<boolean> {
  const { deps } = turn
  turn.elsewhere = false
  await waitForFold({
    ask: deps.health,
    // An answer about another log ends the wait at once: there is nothing here to wait for.
    mine: () => deps.mine() && !turn.elsewhere,
    rest: deps.rest,
    saw: (health) => {
      sawHere(turn, health)
    },
    note: deps.note,
    logSize: deps.logSize,
    failed: deps.failed
  })
  return turn.elsewhere
}
