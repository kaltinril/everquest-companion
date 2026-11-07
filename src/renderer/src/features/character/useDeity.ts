// useDeity — the character's FOLDED deity key, off the window's one held progress state.
//
// It used to ask main for the whole progress state on every mount and keep a second subscription
// to its pushes, for one field; since the 2026-11-06 renderer pass it reads `useHeldProgress`
// (posky/progressStore.ts), the store every other progress reader rides: one read per character,
// kept current by main's pushes, dropped on a switch. A revisit paints with the held answer.

import { useMemo } from 'react'
import { deityKey } from '@shared/planner/deity'
import { useHeldProgress } from '../posky/progressStore'

/**
 * The FOLDED deity key, or null when nothing has stated one.
 *
 * NULL IS THE ORDINARY ANSWER and it means UNKNOWN rather than "none" - most players have never
 * typed the command. Every consumer treats it as "do not filter" (`deityFits`), so a character we
 * know nothing about gets the advice he always got.
 */
export function useDeity(): string | null {
  const [progress] = useHeldProgress()
  const stated = progress?.deity
  return useMemo(() => (stated === undefined ? null : deityKey(stated)), [stated])
}
