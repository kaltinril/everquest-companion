// shared/bazaarForecast.ts — an item's average price now, and its predicted price now.
//
// AVERAGE NOW is the mean of every price kept (outliers already left out) in the AVG_DAYS ending
// on the newest day of the log: the plain average beside the tab's median.
//
// PREDICTED NOW is a weighted straight line through the newest FIT_DAYS priced days' medians, read
// at the newest day of the log. A day weighs more the more offers it had (square root, so one busy
// day does not drown the rest) and the newer it is (half as much every HALF_LIFE days). With fewer
// than three priced days there is no line to draw, so it is that weighted average instead. The
// result is held within CLAMP of the recent median: chat prices move, but a line through a short
// spike should not promise ten times the going rate.

export interface ForecastDay {
  day: string
  /** That direction's median and mean that day, outliers left out, and how many prices. */
  median: number | null
  mean: number | null
  n: number
}

const AVG_DAYS = 7
const FIT_DAYS = 10
const HALF_LIFE = 7
const CLAMP = 2
const DAY_MS = 86_400_000

const ageOf = (day: string, endDay: string): number => (Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS

/** Mean of every kept price in the AVG_DAYS ending `endDay`, or null when none. */
export function averageNow(days: readonly ForecastDay[], endDay: string): number | null {
  let sum = 0
  let n = 0
  for (const d of days) {
    if (d.mean === null || ageOf(d.day, endDay) >= AVG_DAYS) continue
    sum += d.mean * d.n
    n += d.n
  }
  return n > 0 ? sum / n : null
}

interface Pt {
  x: number
  y: number
  w: number
}

function weighted(pts: readonly Pt[]): { x: number; y: number; w: number } {
  let w = 0
  let x = 0
  let y = 0
  for (const p of pts) {
    w += p.w
    x += p.w * p.x
    y += p.w * p.y
  }
  return { x: x / w, y: y / w, w }
}

/** The weighted line's value at x = 0, or the weighted mean when there is no line to draw. */
function fitAtZero(pts: readonly Pt[]): number {
  const m = weighted(pts)
  if (pts.length < 3) return m.y
  let sxy = 0
  let sxx = 0
  for (const p of pts) {
    sxy += p.w * (p.x - m.x) * (p.y - m.y)
    sxx += p.w * (p.x - m.x) ** 2
  }
  return sxx > 0 ? m.y + (sxy / sxx) * (0 - m.x) : m.y
}

/** The predicted price on `endDay`, or null with no priced day at all. */
export function predictNow(days: readonly ForecastDay[], endDay: string, recentMedian: number | null): number | null {
  const priced = days.flatMap((d) => (d.median === null ? [] : [d])).slice(-FIT_DAYS)
  if (priced.length === 0) return null
  const pts = priced.map((d) => {
    const age = ageOf(d.day, endDay)
    return { x: -age, y: d.median ?? 0, w: Math.sqrt(Math.max(1, d.n)) * 0.5 ** (age / HALF_LIFE) }
  })
  const raw = fitAtZero(pts)
  const anchor = recentMedian ?? weighted(pts).y
  return Math.min(anchor * CLAMP, Math.max(anchor / CLAMP, raw))
}
