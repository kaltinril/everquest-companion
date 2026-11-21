// ============================================================================
// telemetry/errorReports.ts — which error is this, and may it be logged again (JOS-100, JOS-197).
// ============================================================================
//
// WHAT IS LEFT HERE (2026-11-20). This module used to build the error reports the usage-analytics
// service received. That service and everything that sent to it are removed. What remains is the
// half the LOCAL error log needs: an error's FINGERPRINT, and the per-fingerprint session budget
// (`../errorBudget.ts`) that is asked with it. Nothing here is stored and nothing leaves the
// machine. The file keeps its old path so its importers do not move.
//
// WHERE IT IS FED FROM. `errorLog.ts logError`, the one funnel every error append passes through:
// `main:uncaughtException` / `main:unhandledRejection` (crashGuards.ts), the renderer's
// `error:report` IPC (ipc/windowControls.ts), and the window failures (windowErrors.ts).
//
// IT STAYS A LEAF. `errorLog` imports this file on the app's error path, so this file imports only
// pure `shared/` code and `errorBudget.ts`, which imports nothing.
//
// WHEN THE THROW WILL NOT SAY WHERE (JOS-111). Many payloads carry no stack of their own (a
// forwarded console message, a failed load, a rejected string), and without a location they all
// hashed the error name alone and shared one fingerprint, so one noisy source could spend the
// budget of every other. `locate` below answers it anyway: the throw's own bundle frames, else a
// stack `errorLog` captured at its call site, else nothing, with the fingerprint falling back on
// the external frames and the shape of the already-redacted message. The classification, the
// unwrap and the skeleton are pure and live in `shared/errorReportLocation.ts`.

import { errorBudget, type BudgetVerdict } from '../errorBudget'
import {
  errorFingerprint,
  errorNameOf,
  parseStackFrames,
  redactMessage,
  type ErrorFrame
} from '../../shared/errorReport'
import {
  caughtFields,
  fingerprintFallback,
  parseExternalFrames,
  stampedMessage,
  type CaughtFields
} from '../../shared/errorReportLocation'

/** The verdict for an occurrence that never reached the budget at all — see `noteError`'s two
 *  named fail-open cases. It says "write it as you always did", and never carries a notice. */
const UNBUDGETED: BudgetVerdict = { report: true, notice: null }

/**
 * What `logError` hands over. Deliberately NOT `Error`: the renderer's IPC report is a plain
 * object, `unhandledRejection` can carry anything at all, and `throw 42` is legal JavaScript.
 * Every field is read defensively and every one has an honest fallback.
 *
 * The read itself lives in `shared/errorReportLocation.ts` (`caughtFields`), because since
 * JOS-111 it also FOLLOWS NESTED ERRORS — `logError('main:preload-error', { preloadPath, error })`
 * carries a real stack one property down — and that unwrap is pure, adversarial, and worth
 * driving from a test with no Electron in the process.
 */
export type CaughtError = CaughtFields

/**
 * WHERE THIS ERROR HAPPENED, in the order that prefers the truest answer (JOS-111).
 *
 * 1. THE THROW'S OWN BUNDLE FRAMES. Everything below is only reached when there are none.
 * 2. THE CAPTURE SITE, synthesised from a stack `logError` took at its own call site. A forwarded
 *    renderer console error is `{ level, message, source }` and never had a stack; the app still
 *    knows which of its eighty-odd `logError` calls the line came out of, and those are
 *    different issues.
 * 3. NOTHING, and the fingerprint's fallback (below) is what stops that colliding.
 *
 * `external` is independent of all three: a stack can carry Node/Electron/dependency frames
 * whether or not it carries ours, and the fallback reads them.
 */
interface Location {
  frames: ErrorFrame[]
  external: ErrorFrame[]
}

function locate(stack: unknown, captureSite: (() => string) | undefined): Location {
  const external = parseExternalFrames(stack)
  const frames = parseStackFrames(stack)
  if (frames.length > 0 || captureSite === undefined) return { frames, external }
  const site = parseStackFrames(captureSite())
  return { frames: site.length > 0 ? site : frames, external }
}

/**
 * THE FINGERPRINT OF ONE CAUGHT ERROR: `hash(name + top frames)`, or the fallback when there are
 * no frames at all. Exported for the tests; `noteError` is the app's only caller.
 *
 * `source` is the tag `logError` already uses (`main:uncaughtException`, `renderer:ErrorBoundary`,
 * …). Since JOS-418 it is the LAST RESORT for an error whose message came out empty:
 * `stampedMessage` puts the tag where the blank message was, so two blank errors from two
 * different sites do not share a fingerprint. `errorFingerprint` reads the fallback ONLY when
 * `frames` is empty, so an error that HAS frames hashes exactly what it always hashed.
 *
 * `captureSite` IS A THUNK AND IS CALLED AT MOST ONCE, only when the payload turned out to carry
 * no bundle frames of its own. Capturing a stack is the expensive part and the overwhelming
 * majority of errors do not need it.
 */
export function fingerprintOf(source: string, payload: unknown, captureSite?: () => string): string {
  const f = caughtFields(payload)
  const where = locate(f.stack, captureSite)
  const redactedMessage = stampedMessage(redactMessage(f.message), source)
  return errorFingerprint(
    errorNameOf(f.name),
    where.frames,
    fingerprintFallback(where.external, redactedMessage)
  )
}

/**
 * ASK THE BUDGET ABOUT ONE CAUGHT ERROR. Never throws — it is called from inside `logError`, which
 * is itself called from inside `catch` blocks and from process-level crash handlers. An exception
 * here would turn a logged error into an unlogged crash, so the whole body is guarded.
 *
 * IT RETURNS THE BUDGET'S VERDICT (JOS-197). The per-fingerprint session cap is the OUTER gate over
 * the errors.log line and the dev stdout line, which belong to `logError`. The fingerprint is
 * known only here, so the decision is taken here and handed back.
 *
 * THE TWO FAIL-OPEN CASES ARE NAMED RATHER THAN IMPLIED, and both stay bounded downstream by
 * `errorRepeat`'s five identical lines: the `errorLog` self-report refusal and the `catch`. Neither
 * computes a fingerprint, so neither has anything to budget.
 */
export function noteError(source: string, payload: unknown, captureSite?: () => string): BudgetVerdict {
  try {
    // A failure INSIDE the error-log writer must not be budgeted against the error-log writer,
    // on the path that is already failing to write. `errorLog.ts` tags that line `[errorLog]`.
    if (source.includes('errorLog')) return UNBUDGETED
    return errorBudget(fingerprintOf(source, payload, captureSite))
  } catch {
    // Fingerprinting is never worth an app failure, and this runs on the error path.
    return UNBUDGETED
  }
}
