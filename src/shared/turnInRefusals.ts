// shared/turnInRefusals.ts — which offer a refusal really handed back.
//
// The log says only that the NPC returned something, and the engine (`turnins.rs`) takes it to be
// the last offer, keeping what it took out in `back`. On the owner's log (2026-09-20) Holwin was
// given the three Test of Fists items with a wrong rune offered before the right one, returned the
// wrong rune and completed the quest, so "the last offer" named the right rune and the turn-in went
// uncredited.
//
// A row is corrected only when the answer is not a guess: what the trade kept does not already make
// a quest of this giver, and exactly one of its quests is made up of as many offers as the NPC
// kept, all of them among the offers. Anything else stays as the engine read it.

import type { PoskyQuest, TurnInEvent } from './types'

type KeyOf = (item: string) => string

function settledRow(t: TurnInEvent, quests: readonly PoskyQuest[], keyOf: KeyOf): TurnInEvent {
  const { given: kept, back } = t
  if (kept === undefined || back === undefined || back.length === 0) return t
  const npc = t.npc.toLowerCase()
  const ours = quests.filter((q) => q.giver?.toLowerCase() === npc && q.items.length > 0)
  const keptKeys = new Set(kept.map((g) => keyOf(g.item)))
  if (ours.some((q) => q.items.every((it) => keptKeys.has(keyOf(it.name))))) return t
  const pool = [...kept, ...back]
  const offered = new Set(pool.map((g) => keyOf(g.item)))
  const fits = ours.filter((q) => q.items.length === kept.length && q.items.every((it) => offered.has(keyOf(it.name))))
  if (fits.length !== 1) return t
  const rest = [...pool]
  const given = fits[0].items.map((it) => {
    const key = keyOf(it.name)
    return rest.splice(rest.findIndex((g) => keyOf(g.item) === key), 1)[0]
  })
  return { ...t, given, back: rest }
}

/** The rows with each refusal on the item it really handed back; the same list when none has one. */
export function settleRefusalsBy(
  turnIns: readonly TurnInEvent[],
  quests: readonly PoskyQuest[],
  keyOf: KeyOf
): readonly TurnInEvent[] {
  return turnIns.some((t) => (t.back?.length ?? 0) > 0) ? turnIns.map((t) => settledRow(t, quests, keyOf)) : turnIns
}
