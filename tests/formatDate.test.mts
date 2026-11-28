// lib/formatDate's formatter cache (perf audit, 2026-10-20): the cached Intl.DateTimeFormat path
// must print EXACTLY what the toLocale* calls it replaced printed — same defaults when the caller
// names no component, same option merging, same "Invalid Date", same zone. Each case is asserted
// against the original expression, so the test holds in whatever locale and zone it runs in.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDate,
  formatDateTime,
  formatShortStamp,
  formatTime,
  localDayKey,
  localInputValue
} from '../src/renderer/src/lib/formatDate'

// A spread of instants: both sides of a DST change in the northern and southern hemispheres,
// midnight and noon, a leap day, the epoch's neighbourhood, and a sub-second remainder.
const STAMPS = [
  Date.UTC(2026, 7, 1, 20, 0, 28),
  Date.UTC(2026, 0, 15, 8, 5, 3, 456),
  Date.UTC(2026, 2, 8, 9, 59, 59),
  Date.UTC(2026, 10, 1, 9, 0, 0),
  Date.UTC(2024, 1, 29, 0, 0, 0),
  Date.UTC(2026, 11, 31, 23, 59, 59, 999),
  1000
]

// Every option shape the app passes today, plus the shapes whose DEFAULTS differ between the
// toLocale* methods and the Intl.DateTimeFormat constructor (a date-only bag given to a time
// method, a time-only bag given to a date method, a bag naming no component at all).
const OPTIONS: (Intl.DateTimeFormatOptions | undefined)[] = [
  undefined,
  {},
  { hour: '2-digit', minute: '2-digit' },
  { hour12: true },
  { hour12: false },
  { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
  { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' },
  { weekday: 'short', month: 'numeric', day: 'numeric' },
  { month: 'long' },
  { second: '2-digit' },
  { weekday: 'long' },
  { era: 'short' },
  { timeZoneName: 'short' },
  { year: '2-digit', hour: 'numeric' },
  { dayPeriod: 'short' },
  { hourCycle: 'h23', minute: '2-digit' },
  { dateStyle: 'medium' },
  { timeStyle: 'short' }
]

function native(fn: () => string): string {
  try {
    return fn()
  } catch (e) {
    return `throws ${(e as Error).name}`
  }
}

function assertMatchesNative(label: string): void {
  for (const ts of STAMPS) {
    for (const opts of OPTIONS) {
      const tag = `${label} ts=${String(ts)} opts=${JSON.stringify(opts)}`
      const d = new Date(ts)
      assert.equal(native(() => formatDate(ts, opts)), native(() => d.toLocaleDateString(undefined, opts)), `formatDate ${tag}`)
      assert.equal(native(() => formatTime(ts, opts)), native(() => d.toLocaleTimeString([], { hour12: false, ...opts })), `formatTime ${tag}`)
      assert.equal(native(() => formatDateTime(ts, opts)), native(() => d.toLocaleString([], opts)), `formatDateTime ${tag}`)
    }
  }
}

test('the cached formatters print exactly what the toLocale* calls printed', () => {
  // Twice: the first pass builds the cache, the second must read the same strings back out of it.
  assertMatchesNative('cold')
  assertMatchesNative('warm')
})

test('a falsy timestamp is still empty, and an invalid one still reads "Invalid Date"', () => {
  assert.equal(formatDate(0), '')
  assert.equal(formatTime(Number.NaN), '')
  assert.equal(formatDateTime(0, { hour: '2-digit' }), '')
  assert.equal(formatTime(Number.POSITIVE_INFINITY), new Date(Number.POSITIVE_INFINITY).toLocaleTimeString([], { hour12: false }))
  assert.equal(formatDateTime(9e15), new Date(9e15).toLocaleString([]))
})

test('a formatter built before the zone changed does not keep printing the old zone', () => {
  // A formatter fixes its time zone when it is built; the toLocale* calls read the current one.
  // Node re-reads `process.env.TZ` on assignment, which stands in for the OS zone changing under
  // a running app.
  const before = process.env.TZ
  try {
    for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'UTC']) {
      process.env.TZ = tz
      assertMatchesNative(tz)
    }
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

// formatShortStamp (2026-11-27, dup-ui-b-6): the Loot rows and the timeslice caption print one
// 24-hour shape, and the engine's `display_time` (views/loot.rs) prints the same string for the
// same instant. The exact strings are en-US (the engine's fixed locale), so they are pinned only
// when the runtime is en-US; the 24-hour claims hold in any locale.
const EN_US = new Intl.DateTimeFormat().resolvedOptions().locale === 'en-US'

function inZone<T>(tz: string, fn: () => T): T {
  const before = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

test('a short stamp is 24-hour, in the strings the engine serves for the same instants', { skip: !EN_US && 'runtime locale is not en-US' }, () => {
  inZone('America/Los_Angeles', () => {
    // The same instants the engine's `views::loot` tests pin.
    assert.equal(formatShortStamp(1_787_181_707_000), 'Aug 19, 16:21')
    assert.equal(formatShortStamp(new Date(2026, 7, 19, 0, 5).getTime()), 'Aug 19, 00:05')
    assert.equal(formatShortStamp(new Date(2026, 7, 19, 12, 5).getTime()), 'Aug 19, 12:05')
    assert.equal(formatShortStamp(new Date(2026, 7, 5, 20, 26).getTime()), 'Aug 5, 20:26')
  })
})

test('a short stamp never carries a day period, and an unknown instant is empty', () => {
  for (const ts of STAMPS) assert.doesNotMatch(formatShortStamp(ts), /AM|PM/)
  assert.equal(formatShortStamp(0), '')
})

test('the datetime-local value is the LOCAL wall time, whatever the zone', () => {
  for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
    inZone(tz, () => {
      const ts = new Date(2026, 0, 2, 3, 4, 59).getTime()
      assert.equal(localInputValue(ts), '2026-01-02T03:04', tz)
      assert.equal(localInputValue(ts).slice(0, 10), localDayKey(ts), tz)
    })
  }
})
