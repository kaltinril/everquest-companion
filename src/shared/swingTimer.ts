// Swing timer: your weapon swing cadence read off the seconds you swung in (`swingRounds` on the
// combat snapshot, from the engine's `swing.rs`), and where the next swing falls.
//
// What the log can back and no more. A stamp is a whole second, so no single gap is the weapon's
// delay; the mean of a run of gaps is, to within a second over the run (the gaps telescope to
// span / count). No delay or haste formula is applied: the cadence is measured. With two weapons
// main and off hand share a verb, so it is both hands' combined cadence.

/** A quieter gap than this is a pause (a pull, a cast, a run), not a swing. */
export const SWING_PAUSE_MS = 8_000
/** Fewer gaps than this and there is no cadence to show. */
export const SWING_MIN_GAPS = 3
/** The most recent gaps are used, so a haste or a weapon change shows within a few swings. */
export const SWING_RECENT_GAPS = 16
/** A swing fell somewhere in its stamped second: its midpoint is the unbiased guess. */
const MID_SECOND_MS = 500

export interface SwingCadence {
  intervalMs: number
  /** how many gaps the interval is the mean of. */
  samples: number
}

export interface SwingReading extends SwingCadence {
  /** 0 just after a swing, 1 when the next one is due. */
  progress: number
  nextInMs: number
  /** no swing for a pause or two intervals: the bar stops. */
  idle: boolean
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The mean recent gap, dropping pauses and any gap more than a second off the median. */
export function swingCadence(rounds: readonly number[] | undefined): SwingCadence | null {
  const r = rounds ?? []
  const gaps: number[] = []
  for (let i = r.length - 1; i > 0 && gaps.length < SWING_RECENT_GAPS; i--) {
    const g = r[i] - r[i - 1]
    if (g > 0 && g <= SWING_PAUSE_MS) gaps.push(g)
  }
  if (gaps.length < SWING_MIN_GAPS) return null
  const m = median(gaps)
  const kept = gaps.filter((g) => Math.abs(g - m) <= 1000)
  return { intervalMs: kept.reduce((n, g) => n + g, 0) / kept.length, samples: kept.length }
}

export function swingReading(rounds: readonly number[] | undefined, nowMs: number): SwingReading | null {
  const cadence = swingCadence(rounds)
  if (!cadence || !rounds) return null
  const elapsed = nowMs - (rounds[rounds.length - 1] + MID_SECOND_MS)
  const { intervalMs } = cadence
  return {
    ...cadence,
    progress: Math.min(1, Math.max(0, elapsed / intervalMs)),
    nextInMs: Math.max(0, intervalMs - elapsed),
    idle: elapsed > Math.max(SWING_PAUSE_MS, 2 * intervalMs)
  }
}
