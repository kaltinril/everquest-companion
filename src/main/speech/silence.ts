// silence.ts — "Shorter pauses" for the downloaded voice: cap the silent stretches in one
// synthesized utterance. PURE: samples in, samples out, no I/O.
//
// Only audio below SILENCE_LEVEL is ever dropped, and a little of every pause is kept, so a
// consonant's closure (the quiet before a "t" or "p", well under 80 ms) is never cut.

/** Longest silent stretch kept between words, in ms. A longer one is shortened to this. */
export const PAUSE_KEEP_MS = 80
/** Silence kept before the first sound and after the last, in ms. */
export const EDGE_KEEP_MS = 20
/** Peak amplitude under which a window counts as silent (about -46 dBFS). */
const SILENCE_LEVEL = 0.005
/** The window the peak is read over, in ms. */
const WINDOW_MS = 5

/** `[start, end)` sample ranges of the silent runs, window-aligned. */
function silentRuns(samples: Float32Array, win: number): [number, number][] {
  const runs: [number, number][] = []
  let runStart = -1
  for (let at = 0; at < samples.length; at += win) {
    const end = Math.min(at + win, samples.length)
    let quiet = true
    for (let i = at; i < end; i++) {
      if (Math.abs(samples[i]) >= SILENCE_LEVEL) {
        quiet = false
        break
      }
    }
    if (quiet && runStart < 0) runStart = at
    if (!quiet && runStart >= 0) {
      runs.push([runStart, at])
      runStart = -1
    }
  }
  if (runStart >= 0) runs.push([runStart, samples.length])
  return runs
}

/**
 * The same utterance with every silent stretch capped: PAUSE_KEEP_MS inside it, EDGE_KEEP_MS at
 * either end. An utterance that is silent throughout is returned as it came.
 */
export function capSilence(samples: Float32Array, sampleRate: number): Float32Array {
  const win = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000))
  const pauseKeep = Math.round((sampleRate * PAUSE_KEEP_MS) / 1000)
  const edgeKeep = Math.round((sampleRate * EDGE_KEEP_MS) / 1000)
  const runs = silentRuns(samples, win)
  if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === samples.length) return samples
  // The ranges to DROP: the middle of a long pause, the outside of a long edge.
  const cuts: [number, number][] = []
  for (const [start, end] of runs) {
    const atStart = start === 0
    const atEnd = end === samples.length
    const keep = atStart || atEnd ? edgeKeep : pauseKeep
    if (end - start <= keep) continue
    if (atStart) cuts.push([start, end - keep])
    else if (atEnd) cuts.push([start + keep, end])
    else cuts.push([start + Math.floor(keep / 2), end - Math.ceil(keep / 2)])
  }
  if (cuts.length === 0) return samples
  const dropped = cuts.reduce((n, [a, b]) => n + (b - a), 0)
  const out = new Float32Array(samples.length - dropped)
  let from = 0
  let to = 0
  for (const [a, b] of cuts) {
    out.set(samples.subarray(from, a), to)
    to += a - from
    from = b
  }
  out.set(samples.subarray(from), to)
  return out
}
