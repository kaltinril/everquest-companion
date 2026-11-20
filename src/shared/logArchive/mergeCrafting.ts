// shared/logArchive/mergeCrafting.ts — the `crafting` module across an archive and the live log.
//
// Counts add. The session columns are the newer log's alone: an older log's session is over.
// A last price, a merchant, a depot count and an item's tradeskill take the newer log's word.
//
// The engine counts a log's first line for a tradeskill as a raise, having nothing to compare it
// with. When that line states the level the older log ended on, it was a repeat: the raise is
// taken back off the item and the span it was credited to (as mergeSkills.ts does for a level).
// Not undone: an item's `firstRaise` when that repeat was its first, and a span already summed
// into `olderSpans`.
//
// Spans stay bounded by the engine's own rule: the newest CRAFT_SPAN_CAP one by one, the rest
// summed into `olderSpans`. A run of combines an archive cut in two is one span again when the
// two halves are within the five-minute gap.

import {
  CRAFT_SPAN_CAP,
  CRAFT_SPAN_GAP_MS,
  type BoughtRow,
  type CraftedItemRow,
  type CraftingSnap,
  type CraftLevelRow,
  type CraftSpan,
  type OlderCraftSpans,
  type SoldRow
} from '../crafting'

function named(rows: unknown, key: string): boolean {
  const is = (r: unknown): boolean => r !== null && typeof r === 'object' && typeof (r as Record<string, unknown>)[key] === 'string'
  return Array.isArray(rows) && rows.every(is)
}

function isCraftingSnap(x: unknown): x is CraftingSnap {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  const items = ['items', 'bought', 'sold', 'depot'].every((k) => named(o[k], 'item'))
  return items && named(o.levels, 'skill') && Array.isArray(o.spans)
}

/** Drops the keys left undefined, so a joined row has no more keys than the engine writes. */
function defined<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as T
}

interface Join<T> {
  key: (row: T) => string
  /** A name both logs hold. */
  both: (older: T, newer: T) => T
  /** A name only the older log holds; as it is when omitted. */
  carry?: (older: T) => T
}

/** The older log's rows in their order, each joined with its newer row, then the newer-only rows. */
function joinRows<T>(older: readonly T[], newer: readonly T[], how: Join<T>): T[] {
  const fresh = new Map(newer.map((r) => [how.key(r), r]))
  const out = older.map((o) => {
    const n = fresh.get(how.key(o))
    if (n === undefined) return how.carry === undefined ? o : how.carry(o)
    fresh.delete(how.key(o))
    return how.both(o, n)
  })
  return [...out, ...fresh.values()]
}

const ITEMS: Join<CraftedItemRow> = {
  key: (r) => r.item,
  both: (o, n) =>
    defined({
      ...n,
      made: o.made + n.made,
      failed: o.failed + n.failed,
      trivial: o.trivial + n.trivial,
      trivialTs: n.trivialTs ?? o.trivialTs,
      raises: o.raises + n.raises,
      firstRaise: o.firstRaise ?? n.firstRaise,
      lastRaise: n.lastRaise ?? o.lastRaise,
      tradeskill: n.tradeskill ?? o.tradeskill,
      firstTs: o.firstTs
    }),
  carry: (o) => ({ ...o, sessionMade: 0, sessionFailed: 0, sessionRaises: 0 })
}

/** The level is the newer log's; the first line is the older log's, for the join after this one. */
const LEVELS: Join<CraftLevelRow> = {
  key: (r) => r.skill,
  both: (o, n) => defined({ skill: n.skill, value: n.value, firstValue: o.firstValue, firstTs: o.firstTs, firstItem: o.firstItem }),
  carry: (o) => defined({ skill: o.skill, value: o.value, firstValue: o.firstValue, firstTs: o.firstTs, firstItem: o.firstItem })
}

const BOUGHT: Join<BoughtRow> = {
  key: (r) => r.item,
  both: (o, n) => ({ ...n, qty: o.qty + n.qty, copper: o.copper + n.copper })
}

const SOLD: Join<SoldRow> = {
  key: (r) => r.item,
  both: (o, n) => ({ ...n, lines: o.lines + n.lines, copper: o.copper + n.copper })
}

/** The newer log's first lines that restated the older log's level and were credited as a raise. */
function repeats(older: CraftingSnap, newer: CraftingSnap): CraftLevelRow[] {
  const held = new Map(older.levels.map((l) => [l.skill, l.value]))
  return newer.levels.filter((l) => l.firstItem !== undefined && held.get(l.skill) === l.firstValue)
}

function lessOne(raises: Readonly<Record<string, number>>, skill: string): Record<string, number> {
  const less = Object.entries(raises).map(([k, n]): [string, number] => [k, k === skill ? n - 1 : n])
  return Object.fromEntries(less.filter(([, n]) => n > 0))
}

/** `snap` with one repeat's raise taken back off its item and its span. */
function takeBack(snap: CraftingSnap, repeat: CraftLevelRow): CraftingSnap {
  const items = snap.items.map((r) => {
    if (r.item !== repeat.firstItem || r.raises <= 0) return r
    const row = { ...r, raises: r.raises - 1 }
    if (repeat.firstInSession === true) row.sessionRaises = Math.max(0, r.sessionRaises - 1)
    return row.raises === 0 ? defined({ ...row, firstRaise: undefined, lastRaise: undefined }) : row
  })
  const holds = (s: CraftSpan): boolean => s.start <= repeat.firstTs && repeat.firstTs <= s.end && s.raises[repeat.skill] > 0
  const spans = snap.spans.map((s) => (holds(s) ? { ...s, raises: lessOne(s.raises, repeat.skill) } : s))
  return { ...snap, items, spans }
}

function addCounts(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const out = { ...a }
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n
  return out
}

const folded = (o: OlderCraftSpans | undefined): o is OlderCraftSpans => o !== undefined && o.spans > 0

/** `total` with one span summed in, as the engine sums a span past the cap. */
function foldSpan(total: OlderCraftSpans, span: CraftSpan): void {
  const ms = span.end - span.start
  total.spans += 1
  total.ms += ms
  total.combines += span.combines
  total.made += span.made
  total.failed += span.failed
  for (const [skill, raises] of Object.entries(span.raises)) {
    const of = (total.bySkill[skill] ??= { spans: 0, ms: 0, combines: 0, raises: 0 })
    of.spans += 1
    of.ms += ms
    of.combines += span.combines
    of.raises += raises
  }
}

function addFolded(total: OlderCraftSpans, more: OlderCraftSpans | undefined): void {
  if (!folded(more)) return
  total.spans += more.spans
  total.ms += more.ms
  total.combines += more.combines
  total.made += more.made
  total.failed += more.failed
  for (const [skill, of] of Object.entries(more.bySkill)) {
    const mine = (total.bySkill[skill] ??= { spans: 0, ms: 0, combines: 0, raises: 0 })
    mine.spans += of.spans
    mine.ms += of.ms
    mine.combines += of.combines
    mine.raises += of.raises
  }
}

/** Older then newer; the two spans an archive cut apart, within the gap, become one. */
function bridged(older: readonly CraftSpan[], newer: readonly CraftSpan[]): CraftSpan[] {
  const last = older.at(-1)
  const next = newer.at(0)
  if (last === undefined || next === undefined || next.start - last.end > CRAFT_SPAN_GAP_MS) return [...older, ...newer]
  const one: CraftSpan = {
    start: last.start,
    end: Math.max(last.end, next.end),
    combines: last.combines + next.combines,
    made: last.made + next.made,
    failed: last.failed + next.failed,
    raises: addCounts(last.raises, next.raises)
  }
  return [...older.slice(0, -1), one, ...newer.slice(1)]
}

function joinSpans(older: CraftingSnap, newer: CraftingSnap): { spans: CraftSpan[]; olderSpans?: OlderCraftSpans } {
  const total: OlderCraftSpans = { spans: 0, ms: 0, combines: 0, made: 0, failed: 0, bySkill: {} }
  addFolded(total, older.olderSpans)
  let spans: CraftSpan[]
  if (folded(newer.olderSpans)) {
    // The newer log summed spans of its own: every older span lies before those.
    for (const span of older.spans) foldSpan(total, span)
    spans = [...newer.spans]
  } else spans = bridged(older.spans, newer.spans)
  addFolded(total, newer.olderSpans)
  for (const span of spans.splice(0, Math.max(0, spans.length - CRAFT_SPAN_CAP))) foldSpan(total, span)
  return total.spans > 0 ? { spans, olderSpans: total } : { spans }
}

/** `older` then `newer`, or null when either is not a crafting snapshot. */
export function mergeCrafting(older: unknown, newer: unknown): CraftingSnap | null {
  if (!isCraftingSnap(older) || !isCraftingSnap(newer)) return null
  const live = repeats(older, newer).reduce(takeBack, newer)
  const joined = joinSpans(older, live)
  const out: CraftingSnap = {
    ...live,
    items: joinRows(older.items, live.items, ITEMS),
    levels: joinRows(older.levels, live.levels, LEVELS),
    spans: joined.spans,
    bought: joinRows(older.bought, live.bought, BOUGHT),
    sold: joinRows(older.sold, live.sold, SOLD),
    depot: joinRows(older.depot, live.depot, { key: (r) => r.item, both: (_o, n) => n })
  }
  if (joined.olderSpans === undefined) delete out.olderSpans
  else out.olderSpans = joined.olderSpans
  return out
}
