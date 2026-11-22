// shared/lootFrame.ts: the loot ledger, sent as what a window does not hold yet
// (docs/community/plans/2026-11-21-loot-append-frames.md, step 1).
//
// A pickup used to clone the whole ledger into each window that reads it. Main still reads the
// whole merged ledger; what crosses IPC now is the rows the window lacks.
//
// THE LAW: a window's array always equals a full read. So nothing here trusts a count, a cursor or
// a length. Main compares every row it holds by value before it calls a reply an append, and a
// window that cannot prove its copy is the base of a reply throws the reply away and asks for all.
//
// Pure, with no Electron and no DOM: `tests/lootFrame.test.mts` runs both halves over a fake wire.

import type { ModuleSnapshot } from './types'

export const LOOT_MODULE = 'loot'

/** What a window holds: which unbroken run of ledgers (`gen`), and how many rows of it. */
export interface LootMark {
  readonly gen: number
  readonly length: number
}

interface FrameHead {
  readonly seq: number
  readonly served?: true
}

/** The ledger from row `from` on. `from` 0 is all of it. */
export interface LootRows extends FrameHead {
  readonly gen: number
  readonly from: number
  readonly rows: readonly unknown[]
}

/** A state that is not a ledger: handed over exactly as a full read would hand it. */
export interface LootOther extends FrameHead {
  readonly state: unknown
}

export type LootFrame = LootRows | LootOther

/** A served module snapshot, as far as a frame reads one. */
type Served = FrameHead & { readonly state: unknown }

function plainProto(v: object): object | null | undefined {
  const proto = Object.getPrototypeOf(v) as object | null
  return proto === Object.prototype || proto === Array.prototype ? proto : undefined
}

/** Equal by value, key order included. Anything but plain JSON shapes counts as different. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const proto = plainProto(a)
  if (proto === undefined || proto !== plainProto(b)) return false
  const keys = Object.keys(a)
  const others = Object.keys(b)
  if (keys.length !== others.length) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return keys.every((k, i) => k === others[i] && sameValue(x[k], y[k]))
}

function isPrefix(held: readonly unknown[], next: readonly unknown[]): boolean {
  if (held === next) return true
  if (held.length > next.length) return false
  for (let i = 0; i < held.length; i++) {
    if (!sameValue(held[i], next[i])) return false
  }
  return true
}

/** The mark a window sent, if it names rows of the run `gen` this ledger belongs to. */
function usableLength(known: unknown, gen: number, length: number): number {
  if (typeof known !== 'object' || known === null) return 0
  const { gen: markGen, length: held } = known as Partial<LootMark>
  if (markGen !== gen || held === undefined || !Number.isSafeInteger(held)) return 0
  return held >= 0 && held <= length ? held : 0
}

function headOf(snap: FrameHead): FrameHead {
  return snap.served === true ? { seq: snap.seq, served: true } : { seq: snap.seq }
}

export interface LootFrameServer {
  /** One window's reply to a full read `snap`, given the mark it sent. */
  answer: (snap: Served | null, known: unknown) => LootFrame | null
}

/**
 * Main's half: the last ledger, and the run it belongs to. An exact prefix keeps `gen`; anything
 * else (a clear, a rebirth, a changed row, an archive swap, no answer at all) starts a new run, so
 * every mark taken before it stops matching.
 */
export function createLootFrames(): LootFrameServer {
  let last: readonly unknown[] | null = null
  let gen = 0
  return {
    answer(snap, known) {
      if (snap === null) {
        last = null
        return null
      }
      if (!Array.isArray(snap.state)) {
        last = null
        return { ...headOf(snap), state: snap.state }
      }
      const next = snap.state as readonly unknown[]
      if (last === null || !isPrefix(last, next)) gen += 1
      last = next
      const from = usableLength(known, gen, next.length)
      return { ...headOf(snap), gen, from, rows: from === 0 ? next : next.slice(from) }
    }
  }
}

interface Held {
  readonly gen: number
  readonly rows: readonly unknown[]
}

/** The ledger this reply completes, or null when `basis` cannot be proved to be its base. */
function joined(basis: Held | null, current: Held | null, reply: LootRows): readonly unknown[] | null {
  if (basis !== null && basis === current && reply.gen === basis.gen && reply.from === basis.rows.length) {
    return reply.rows.length === 0 ? basis.rows : basis.rows.concat(reply.rows)
  }
  return reply.from === 0 ? reply.rows : null
}

export interface LootFrameReader {
  /** The ledger, as a full read would answer. Rejects when `forget` overtook it. */
  read: () => Promise<ModuleSnapshot | null>
  /** The world behind the held copy changed hands: the next read asks for everything. */
  forget: () => void
}

/**
 * A window's half. Holds its copy and its mark, and turns frames back into what
 * `module:getSnapshot` answers, so nothing downstream of it can tell the two apart.
 */
export function createLootFrameReader(ask: (known: LootMark | null) => Promise<LootFrame | null>): LootFrameReader {
  let held: Held | null = null
  /** The newest answer given, for a slower reply that a newer one overtook. */
  let answer: ModuleSnapshot | null = null
  let era = 0
  let asked = 0
  let answered = 0

  function settle(basis: Held | null, reply: LootFrame | null): ModuleSnapshot | null | undefined {
    if (reply === null) {
      held = null
      answer = null
    } else if (!('rows' in reply)) {
      held = null
      answer = { ...headOf(reply), state: reply.state }
    } else {
      const rows = joined(basis, held, reply)
      if (rows === null) return undefined
      held = { gen: reply.gen, rows }
      answer = { ...headOf(reply), state: rows }
    }
    return answer
  }

  async function attempt(basis: Held | null): Promise<ModuleSnapshot | null> {
    const startedIn = era
    asked += 1
    const mine = asked
    let reply: LootFrame | null
    try {
      reply = await ask(basis === null ? null : { gen: basis.gen, length: basis.rows.length })
    } catch (err) {
      if (startedIn === era) held = null
      throw err
    }
    if (startedIn !== era) throw new Error('loot frame: the world changed during this read')
    if (mine < answered) return answer
    answered = mine
    const settled = settle(basis, reply)
    if (settled !== undefined) return settled
    held = null
    // A full ask always answers from row 0; one that does not is a broken wire, not a retry.
    if (basis === null) throw new Error('loot frame: a full read answered part of the ledger')
    return attempt(null)
  }

  return {
    read: () => attempt(held),
    forget: () => {
      era += 1
      held = null
      answer = null
    }
  }
}
