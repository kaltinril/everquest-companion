// posky/turnInActions.ts — the three things a user can SAY about the turn-in ledger.
//
// Split out of `useProgress.ts` when upstream issue #72 added the third one (the reset) and the
// file crossed its 400-line ceiling. The seam is the honest one: `useTurnInLedger` DERIVES the
// ledger (the log's detections merged with the store, minus what was taken back), and this module
// is the statements that change it. Every statement is arithmetic in shared/questTurnIns.ts
// (`takeBackTurnIn`, `rejectAllTurnIns`) and one IPC; nothing here decides what a count means.

import { useCallback, useRef } from 'react'
import type { ProgressState } from '@shared/types'
import {
  mergeTurnInInstants,
  rejectAllTurnIns,
  takeBackTurnIn,
  type QuestTurnIns,
  type TurnInInstants
} from '../../../../shared/questTurnIns'

export interface TurnInActions {
  /** Record one more turn-in of this quest, dated now (JOS-131). Multiple turn-ins are the norm. */
  recordTurnIn: (key: string) => Promise<void>
  /**
   * Take back the most recent turn-in, whoever recorded it. A hand-recorded instant is simply
   * dropped; a LOG-DETECTED one is dropped AND remembered as rejected (`rejectedTurnIns`, upstream
   * issue #72), because the next snapshot would otherwise re-assert it. Until that key existed a
   * count that was entirely log-detected could not be undone at all, and a wrong detection — an
   * abandoned offer folded into the next trade, a trade the NPC handed back — was permanent.
   */
  undoTurnIn: (key: string) => Promise<void>
  /**
   * Take back EVERY turn-in of every quest, the Sky tab's reset (upstream issue #72: "there is no
   * current working way to reset progress"). Each detection the log knows today is rejected, so
   * the store does not refill on the next snapshot; a trade the log shows AFTER this is a new
   * event and counts. Derived completions (the achievements dump, a reward in your bags) are not
   * turn-ins and are untouched: they say what your files say.
   */
  resetTurnIns: () => Promise<void>
}

/**
 * One quest's turn-ins as the next click must read them: the render's list, plus the '+' stamps it
 * does not show yet (`unseen`), less the take-backs it still shows (`gone`). Ascending, so the last
 * one is the newest.
 */
function newestKnown(
  base: readonly number[],
  sent: readonly number[],
  cut: readonly number[]
): { list: number[]; unseen: number[]; gone: number[] } {
  const unseen = sent.filter((ts) => !base.includes(ts))
  const gone = cut.filter((ts) => base.includes(ts))
  return { list: mergeTurnInInstants(base, unseen).filter((ts) => !gone.includes(ts)), unseen, gone }
}

/**
 * The statements, over the ledger `useTurnInLedger` derived. `detected` is the log's list with the
 * rejections already out, `rejected` the current rejected list, so each statement restates a
 * quest from what the user sees.
 *
 * `detected` IS NULL UNTIL THE TURN-INS MODULE HAS LOADED, and undo and reset do nothing until it
 * has (the Sky tab disables both on `turnInsReady`). Right after launch the store already holds
 * the persisted detections but the log's list is still empty, so a take-back could not tell a
 * detection from a hand-recorded turn-in: it dropped the instant without rejecting it, and the
 * module's first snapshot wrote it straight back.
 */
export function useTurnInActions(
  turnIns: QuestTurnIns,
  detected: TurnInInstants | null,
  rejected: TurnInInstants,
  setProgress: (p: ProgressState) => void
): TurnInActions {
  // Instants a '+' already sent that `turnIns` may not show yet: main REPLACES the list, so a
  // second click before the re-render would otherwise restate the old list and drop the first.
  const sent = useRef<Record<string, number[]>>({})
  // The other half: instants a '-' took back whose reply has not landed, so `turnIns` may still
  // show them. Held only while the statement is in flight: the reply re-renders at once, and a
  // trade the log shows again later must stay open to a second take-back.
  const cut = useRef<Record<string, number[]>>({})
  /** One more turn-in, dated NOW. `Date.now()` is the honest instant for a statement the user is
   *  making right now, and dating it is what keeps the ledger a list of events rather than a tally
   *  (an instant is what dedupes a detected turn-in against the stored one).
   *
   *  IT IS A CLICK TIME, NOT AN EVENT TIME, and JOS-409 is where that stopped being harmless: a
   *  player who hands a quest in and records it a day later stamps TOMORROW on YESTERDAY'S event.
   *  Nothing here can fix that — the user is telling us a thing happened, not when — so the fix is
   *  on the reader: only `detected` windows the dump. Do not "improve" this to guess an
   *  earlier instant; a guessed event time is exactly the kind of invention law 1 forbids. */
  const recordTurnIn = useCallback(
    async (key: string): Promise<void> => {
      const now = newestKnown(turnIns.instants[key] ?? [], sent.current[key] ?? [], cut.current[key] ?? [])
      const stamp = Date.now()
      sent.current[key] = [...now.unseen, stamp]
      setProgress(await window.eq.setQuestTurnIns(key, [...now.list, stamp]))
    },
    [turnIns, setProgress]
  )

  /**
   * Drop the newest turn-in. When it is one the LOG detected, it is also written to the rejected
   * list, so the very next snapshot cannot put it back (upstream issue #72); before that list
   * existed the control was disabled for a log-detected count, and a wrong detection was
   * permanent. With no instants at all, this clears a pre-JOS-131 completion, which is the only
   * other thing a count can come from.
   *
   * It builds on the newest known list, as '+' does: a second '-' before the first reply takes
   * back a second turn-in, and a '-' right after a '+' takes back that '+'. The rejected list is
   * restated whole, so a detection an in-flight '-' rejected is rejected in this statement too.
   */
  const undoTurnIn = useCallback(
    async (key: string): Promise<void> => {
      if (detected === null) return
      const now = newestKnown(turnIns.instants[key] ?? [], sent.current[key] ?? [], cut.current[key] ?? [])
      const det = detected[key] ?? []
      const refused = [...(rejected[key] ?? []), ...now.gone.filter((ts) => det.includes(ts))]
      const s = takeBackTurnIn(now.list, det, refused)
      const newest = now.list[now.list.length - 1]
      sent.current[key] = now.unseen.filter((ts) => ts !== newest)
      if (newest !== undefined) cut.current[key] = [...(cut.current[key] ?? []), newest]
      try {
        setProgress(await window.eq.setQuestTurnIns(key, s.instants, s.rejected))
      } finally {
        cut.current[key] = (cut.current[key] ?? []).filter((ts) => ts !== newest)
      }
    },
    [turnIns, detected, rejected, setProgress]
  )

  /**
   * Every quest back to "never turned in": the instants cleared, every detection the log shows
   * today rejected, the legacy mirror emptied. Quest by quest over the one IPC that carries both
   * lists, sequentially — the store is a file and the last answer is the state to keep.
   */
  const resetTurnIns = useCallback(async (): Promise<void> => {
    if (detected === null) return
    sent.current = {}
    cut.current = {}
    let last: ProgressState | null = null
    for (const key of new Set([...Object.keys(turnIns.all), ...Object.keys(detected)])) {
      const s = rejectAllTurnIns(detected[key] ?? [], rejected[key] ?? [])
      last = await window.eq.setQuestTurnIns(key, s.instants, s.rejected)
    }
    if (last) setProgress(last)
  }, [turnIns, detected, rejected, setProgress])

  return { recordTurnIn, undoTurnIn, resetTurnIns }
}
