// spellPoolLine.ts — ONE EFFECT LINE OF A POOL, READ: the hitpoint and mana line reader that
// `spellMetrics.ts` folds into figures, split out at the 400-line ceiling (split, never ratchet)
// when the mana pool joined it (owner report 2026-09-12: the buff set never offered Breeze).
//
// Two heads, one arithmetic. `Increase Hitpoints by 10 (L39) to 16 (L50) per tick` and `Increase
// Mana by 4 per tick (L29) to 7 per tick (L60)` are the same shape one noun apart, and a ramp is
// evaluated at a level the same way whichever pool it feeds. What differs is only WHO READS THE
// ANSWER: `spellMetrics.ts` folds hitpoint lines into damage and healing figures, and the buff set
// (`spellLoadout.ts`) turns the per-tick lines of either pool into a regen grant.
//
// Pure, imports nothing, and every number it yields is a claim the wiki's own line made.

/** A hitpoint line, read: how much, per tick or not, and over how many ticks the line states. */
export interface HpLine {
  /** Positive magnitude at the evaluation level. */
  amount: number
  /** `Increase` (a heal) or `Decrease` (damage). */
  direction: 'up' | 'down'
  /** True when the amount lands EVERY tick rather than once. */
  perTick: boolean
  /**
   * THE LINE STATED ONE BARE NUMBER (JOS-451) — `by 10 per tick`, with no `(L44)` breakpoint, no
   * `between A and B` and no `by A to B`. Absent on every shape that carries a level range.
   *
   * It is here because it is the precondition of the client-curve rule below, and because only the
   * READER of a line can tell the two apart afterwards: a ramp evaluated at one level and a flat
   * line stating the same number are the same `amount`, and one of them is a claim about every
   * level while the other is a claim about one.
   */
  flat?: true
  /**
   * The tick count the LINE ITSELF states, when it states one.
   *
   * Two families do: `Increase Hitpoints between 165 and 190 for two additional ticks.` (the
   * cleric Echo tail - per tick, for exactly two) and `Increase Hitpoints by 300 after 4 ticks`
   * (Blooming Heal - the whole amount, once, after a delay). Where a line counts its own ticks
   * that count wins over the duration, because the line is the more specific evidence.
   */
  statedTicks?: number
}

/** The tick counts the two self-counting families spell out in words. */
const TICK_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

/**
 * The head of a hitpoint line: an increase or a decrease OF HIT POINTS, and nothing between the
 * verb and the noun but an optional `Current`.
 *
 * The gap is the whole point (the `spellEffectClass.ts` anchor argument, one noun further in):
 * `Increase Max Hitpoints` states a bigger HP POOL and `Increase Hitpoints` states hit points
 * arriving, and the only thing telling them apart is the word in between. The `v\d` tail is
 * Torpor's and Celestial Cleansing's spelling (`Increase Hitpoints v2 by 300 per tick`), and the
 * trailing `s` is `Increases hitpoints by 2 per tick` (Extended Regeneration).
 */
const HP_HEAD_RE = /^(increase|decrease)s?\s+(?:current\s+)?hit\s?points?(?:\s+v\d+)?\b/i

/**
 * The MANA pool's head, the same shape one noun over: `Increase Mana by 2 per tick` (Breeze),
 * `Increase Current Mana by 3 per tick` (the other spelling), `Increase Mana by 4 per tick (L29)
 * to 7 per tick (L60)` (Clarity, a ramp). `Decrease Target Mana` does not match, and should not:
 * that is a drain on somebody else. `Increase Max Mana` is a bigger pool and `spellStats.ts`'s.
 */
const MANA_HEAD_RE = /^(increase|decrease)s?\s+(?:current\s+)?mana\b/i

/**
 * `@L44` is the same statement as `(L44)`, and a `per tick` sitting BETWEEN a value and its
 * breakpoint is a rate marker rather than part of the ramp.
 *
 * The second half is what Sebilite Pox needs: `by 1 per tick (L1) to 22 per tick (L65)` states
 * the same two-point ramp as `by 1 (L1) to 22 (L65) per tick`, with the marker repeated inside
 * each clause. Reading it whole yields the value at L1 for every level. The rate is detected on
 * the untouched tail, so removing the words here costs nothing.
 */
function normalizeBreakpoints(s: string): string {
  return s.replace(/@\s*l(\d+)/gi, '(L$1)').replace(/\s*\bper\s+tick\b/gi, '')
}

/** A stated (level, value) breakpoint, e.g. the `22 (L50)` of a ramp. */
interface Breakpoint {
  level: number
  value: number
}

/** Every `N (LM)` the tail states, ascending by level. */
function breakpointsOf(tail: string): Breakpoint[] {
  const out: Breakpoint[] = []
  const re = /(-?\d+)\s*\(L(\d+)\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(tail)) !== null) out.push({ value: Number(m[1]), level: Number(m[2]) })
  return out.sort((a, b) => a.level - b.level)
}

/**
 * A ramp read at `level`: linear between the two breakpoints it falls between, CLAMPED outside.
 *
 * Clamped rather than extrapolated because the wiki's ramp is a statement about a band, not a
 * formula - `Decrease Hitpoints by 10 (L1) to 0 (L70) to 65 (L110)` extrapolated below 1 or above
 * 110 produces numbers the page never claimed. Non-monotonic ramps like that one are handled for
 * free: nothing here assumes the values ascend, only that the LEVELS do.
 */
function rampAt(points: readonly Breakpoint[], level: number): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (level <= first.level) return first.value
  if (level >= last.level) return last.value
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (level > b.level) continue
    const span = b.level - a.level
    if (span <= 0) return b.value
    return a.value + ((b.value - a.value) * (level - a.level)) / span
  }
  return last.value
}

/**
 * The magnitude the tail states at `level`, or null when it states none.
 *
 * The order is specific-to-general and each arm is a measured family:
 *   breakpoints  `by 273 (L34) to 288 (L39)`, `by 10 (L1) to 0 (L70) to 65 (L110)`, `by 360 (L50)`
 *   between/and  `between 165 and 190` (the Echo tail, and `Decrease Hitpoints between 40 and 90.`)
 *   bare range   `by 7 to 12` (Lifespike)
 *   constant     `by 100`
 * A range is read at its MIDPOINT: the page states two bounds and no distribution, and the
 * midpoint is the only summary that does not prefer one end of a claim the wiki did not make.
 */
function magnitudeAt(tailRaw: string, level: number): { value: number; flat: boolean } | null {
  const tail = normalizeBreakpoints(tailRaw)
  const points = breakpointsOf(tail)
  if (points.length > 0) return { value: rampAt(points, level), flat: false }
  const between = /\bbetween\s+(-?\d+)\s+and\s+(-?\d+)/i.exec(tail)
  if (between) return { value: (Number(between[1]) + Number(between[2])) / 2, flat: false }
  const range = /\bby\s+(-?\d+)\s+to\s+(-?\d+)/i.exec(tail)
  if (range) return { value: (Number(range[1]) + Number(range[2])) / 2, flat: false }
  const flat = /\bby\s+(-?\d+)/i.exec(tail)
  return flat ? { value: Number(flat[1]), flat: true } : null
}

/** `for two additional ticks` / `after 4 ticks` - the count, when the line counts for itself. */
function statedTicksOf(tail: string): number | undefined {
  const m = /\b(?:for|after)\s+(\d+|one|two|three|four|five|six)\s+(?:additional\s+)?ticks?\b/i.exec(tail)
  if (!m) return undefined
  const word = m[1].toLowerCase()
  const n = TICK_WORDS[word] ?? Number(word)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Read ONE effect line, or null when it is not a hitpoint line.
 *
 * `after N ticks` is a DELAY, not a rate (`Increase Hitpoints by 300 after 4 ticks` heals 300
 * once, four ticks late), so it is deliberately NOT `perTick`; `for N additional ticks` IS a rate
 * and carries its own count. Everything else marked `per tick` takes its count from the duration.
 */
export function parseHpLine(line: string, level: number): HpLine | null {
  return parsePoolLine(HP_HEAD_RE, line, level)
}

/**
 * Read ONE effect line, or null when it is not a MANA line. The same reader as `parseHpLine` with
 * the mana head, so a mana regen ramp is evaluated at a level by exactly the arithmetic a hitpoint
 * ramp is (owner report 2026-09-12: the buff set never offered Breeze, whose only line is
 * `Increase Mana by 2 per tick` - a line `spellStats.ts` refuses on purpose and nothing else read).
 */
export function parseManaLine(line: string, level: number): HpLine | null {
  return parsePoolLine(MANA_HEAD_RE, line, level)
}

function parsePoolLine(headRe: RegExp, line: string, level: number): HpLine | null {
  const s = line.trim()
  const head = headRe.exec(s)
  if (!head) return null
  const tail = s.slice(head[0].length)
  const read = magnitudeAt(tail, level)
  if (read === null) return null
  const statedTicks = statedTicksOf(tail)
  const perTick = /\bper\s+tick\b/i.test(tail) || /\bfor\s+\S+\s+additional\s+ticks?\b/i.test(tail)
  const out: HpLine = {
    amount: Math.abs(read.value),
    direction: head[1].toLowerCase() === 'increase' ? 'up' : 'down',
    perTick
  }
  if (read.flat) out.flat = true
  if (statedTicks !== undefined) out.statedTicks = statedTicks
  return out
}
