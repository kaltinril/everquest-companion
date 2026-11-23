// Pure turn-in matching + celebration detection (Task #46, JOS-131) — the testable core of
// the "celebrate a Sky quest turn-in, never on load" rule. Kept free of
// React/data-bundle imports so tests can exercise it directly (the useProgress module
// pulls in @shared value imports the bare test runner can't alias-resolve).
//
// The celebration mirrors the boss-defeat baseline contract (bossStatus.bossKills):
// the FIRST observation seeds a silent baseline, and only turn-ins observed AFTER the
// baseline count as live transitions. This keeps historical
// completions (already persisted, or found in the initial log scan) from firing
// confetti/sound on launch.
//
// JOS-131 MADE IT A COUNT. A Sky quest can be run again, so the baseline is a COUNT PER QUEST
// rather than a set of keys: the second turn-in of the same quest is a transition too, and it
// celebrates the same way the boss-kill watch celebrates a repeat kill ("every time is worth
// celebrating", owner 2026-08-04). Exactly-once is still guaranteed per turn-in, because the
// baseline advances to the count that just fired.

import type { PoskyQuest, TurnInEvent } from '@shared/types'
import type { TurnInInstants } from '@shared/questTurnIns'
import { itemCountKey } from '../../lib/itemName'
import { questKey } from './keys'

/**
 * Match logged turn-ins to quests: a quest is turned in when its giver received
 * (in one trade) every item the quest requires. The +N variant is normalized at the
 * matching boundary (a `Sphinx Claw +1` offer satisfies a `Sphinx Claw` requirement,
 * Task #42), so the user's `Brass Knuckles +2` loot satisfies the base requirement.
 *
 * Returns the INSTANTS, quest key → every `TurnInEvent.ts` that satisfied it (JOS-131). The
 * count is the list's length; the instants are what let a turn-in be placed relative to an
 * inventory dump, and what let the log's turn-ins merge with the persisted ones without
 * double-counting (shared/questTurnIns.ts owns that merge).
 */
export function countTurnIns(turnIns: readonly TurnInEvent[], quests: PoskyQuest[]): TurnInInstants {
  const out: TurnInInstants = {}
  for (const t of turnIns) {
    const npc = t.npc.toLowerCase()
    // What the trade really took: a cancelled or refused offer is no turn-in anywhere (owner,
    // 2026-10-23). A row from before `given` existed keeps its offers as listed.
    const taken = t.given?.map((g) => g.item) ?? t.items
    const offered = new Set(taken.map((i) => itemCountKey(i)))
    for (const q of quests) {
      if (q.giver?.toLowerCase() !== npc) continue
      if (q.items.length > 0 && q.items.every((it) => offered.has(itemCountKey(it.name)))) {
        ;(out[questKey(q)] ??= []).push(t.ts)
      }
    }
  }
  return out
}

/**
 * THE ITEM A REFUSAL HANDED BACK. The log says only that the NPC returned something, and the engine
 * takes it to be the last offer. On the owner's log (2026-09-20) Holwin was given the three Test of
 * Fists items with a wrong rune offered before the right one, returned the wrong rune and completed
 * the quest, so "the last offer" named the right rune and the turn-in went uncredited.
 *
 * A row is corrected only when the answer is not a guess: what the trade kept does not already
 * make a quest of this giver, and exactly one of its quests is made up of as many offers as the NPC
 * kept, all of them among the offers. Anything else stays as the engine read it.
 */
function settledRow(t: TurnInEvent, quests: readonly PoskyQuest[]): TurnInEvent {
  if (t.given === undefined || t.back === undefined || t.back.length === 0) return t
  const npc = t.npc.toLowerCase()
  const ours = quests.filter((q) => q.giver?.toLowerCase() === npc && q.items.length > 0)
  const kept = new Set(t.given.map((g) => itemCountKey(g.item)))
  if (ours.some((q) => q.items.every((it) => kept.has(itemCountKey(it.name))))) return t
  const pool = [...t.given, ...t.back]
  const offered = new Set(pool.map((g) => itemCountKey(g.item)))
  const fits = ours.filter(
    (q) => q.items.length === t.given!.length && q.items.every((it) => offered.has(itemCountKey(it.name)))
  )
  if (fits.length !== 1) return t
  const rest = [...pool]
  const given = fits[0].items.map((it) => {
    const key = itemCountKey(it.name)
    return rest.splice(rest.findIndex((g) => itemCountKey(g.item) === key), 1)[0]
  })
  return { ...t, given, back: rest }
}

/** The rows with each refusal placed on the item it really handed back; the same list when none has one. */
export function settleRefusals(
  turnIns: readonly TurnInEvent[],
  quests: readonly PoskyQuest[]
): readonly TurnInEvent[] {
  return turnIns.some((t) => (t.back?.length ?? 0) > 0) ? turnIns.map((t) => settledRow(t, quests)) : turnIns
}

/** A turn-in that just happened, and which number it was for that quest. */
export interface TurnInTransition {
  key: string
  /** how many times this quest has now been turned in — 1 the first time, 2 the second */
  count: number
}

/**
 * Given the previous per-quest turn-in COUNTS (null = not yet baselined) and the current ones,
 * return the quests that just gained a turn-in. Returns [] on the baseline run (prev == null) —
 * the historical set is seeded silently and never celebrated.
 *
 * A count that GREW by more than one (a delta carrying two turn-ins of the same quest, or a
 * catch-up after the app was closed) reports ONE transition at the new count. The event being
 * celebrated is "you turned this in", not "here are N confetti bursts", and the count in hand is
 * the honest one to show.
 */
export function newlyCompletedTurnIns(
  prevCounts: Record<string, number> | null,
  counts: Record<string, number>
): TurnInTransition[] {
  if (prevCounts == null) return []
  const out: TurnInTransition[] = []
  for (const [key, count] of Object.entries(counts)) {
    if (count > (prevCounts[key] ?? 0)) out.push({ key, count })
  }
  return out
}
