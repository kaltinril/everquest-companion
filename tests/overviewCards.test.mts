// The four Overview widgets of the first batch (shared/overviewCards.ts): the values each card
// shows. The e2e spec checks only that the cards mount with engine data.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { ActiveBuff, BuffsSnap } from '../src/shared/buffTypes'
import type { LootEvent } from '../src/shared/types'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import { DEFAULT_BUFF_ALLOW_PREFS } from '../src/shared/buffAllow'
import { EMPTY_RESPAWN_SNAP, RESPAWN_LINGER_MS, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'
import { buffsRunningOut, coinCard, motesCard, respawnsHere } from '../src/shared/overviewCards'

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.parse('Sat Aug 01 12:00:00 2026')

// ─── Buffs running out ─────────────────────────────────────────────────────────────────────

function buff(spell: string, over: Partial<ActiveBuff> = {}): ActiveBuff {
  return {
    spell,
    cls: 'buff',
    self: true,
    startedTs: T0 - 10 * MIN,
    estimatedMs: null,
    p25: null,
    p75: null,
    n: 0,
    ...over
  } as ActiveBuff
}

const snapOf = (...active: ActiveBuff[]): BuffsSnap => ({ active, stats: {} }) as BuffsSnap
const NO_TIMERS = { holds: [], ends: [] }

test('buffs: countdowns only, soonest to end first, with the time left at now', () => {
  const buffs = snapOf(
    buff('Valor', { overlayDurationMs: 40 * MIN }), // 30m left
    buff('Clarity', { overlayDurationMs: 12 * MIN }), // 2m left
    buff('Spirit of Wolf', { overlayDurationMs: 70 * MIN }), // 60m left
    buff('Yaulp', { permanent: true }),
    buff('Mystery', {}), // no stated duration: counts up, cannot run out
    buff('Ensnare', { cls: 'debuff', self: false, target: 'a gnoll', overlayDurationMs: 11 * MIN })
  )
  const rows = buffsRunningOut({ buffs, timers: NO_TIMERS, allow: DEFAULT_BUFF_ALLOW_PREFS }, T0)
  assert.deepEqual(
    rows.map((r) => [r.name, r.remainingMs]),
    [
      ['Clarity', 2 * MIN],
      ['Valor', 30 * MIN],
      ['Spirit of Wolf', 60 * MIN]
    ]
  )
  assert.ok(rows.every((r) => !r.overdue && r.target === undefined))
})

test('buffs: at most the limit, a pet buff names its target, an overdue one reads 0 left', () => {
  const buffs = snapOf(
    buff('A', { overlayDurationMs: 11 * MIN }),
    buff('B', { overlayDurationMs: 12 * MIN }),
    buff('C', { overlayDurationMs: 13 * MIN }),
    buff('Gone', { overlayDurationMs: 5 * MIN }),
    buff('Symbol', { self: false, target: 'Vebarn', overlayDurationMs: 14 * MIN })
  )
  const rows = buffsRunningOut({ buffs, timers: NO_TIMERS, allow: DEFAULT_BUFF_ALLOW_PREFS }, T0, 3)
  assert.deepEqual(rows.map((r) => r.name), ['Gone', 'A', 'B'])
  assert.deepEqual([rows[0].overdue, rows[0].remainingMs], [true, 0])
  const all = buffsRunningOut({ buffs, timers: NO_TIMERS, allow: DEFAULT_BUFF_ALLOW_PREFS }, T0)
  assert.equal(all.find((r) => r.name === 'Symbol')?.target, 'Vebarn')
})

test('buffs: the Buffs tab allow-list hides what it hides on the overlay', () => {
  const buffs = snapOf(buff('Valor', { overlayDurationMs: 40 * MIN }), buff('Clarity', { overlayDurationMs: 12 * MIN }))
  const allow = { optIn: true, lines: { valor: true } }
  const rows = buffsRunningOut({ buffs, timers: NO_TIMERS, allow }, T0)
  assert.deepEqual(rows.map((r) => r.name), ['Valor'])
})

// ─── Respawns here ─────────────────────────────────────────────────────────────────────────

const fmt = (ms: number | null | undefined): string => `${String(Math.round((ms ?? 0) / 1000))}s`

function row(display: string, zone: string, over: Partial<RespawnRow> = {}): RespawnRow {
  return {
    id: `${zone.toLowerCase()}::${display.toLowerCase()}`,
    key: display.toLowerCase(),
    display,
    zone,
    baseTs: T0 - 10 * MIN,
    basis: 'death',
    estimateMs: 30 * MIN,
    source: 'wiki',
    samples: 0,
    kills: 1,
    ...over
  }
}

function respawnSnap(rows: RespawnRow[], zone = 'Befallen'): RespawnSnap {
  return {
    ...EMPTY_RESPAWN_SNAP,
    zone,
    rows,
    prefs: { watches: rows.map((r) => ({ key: r.key, display: r.display })) }
  }
}

test('respawns: this zone only, seen first, then soonest; the Timers tab words', () => {
  const snap = respawnSnap([
    row('a skeleton', 'Befallen', { baseTs: T0 - 25 * MIN }), // 5m left
    row('Gynok Moltor', 'Befallen', { baseTs: T0 - 40 * MIN }), // due 10m ago
    row('a ghoul', 'Befallen', { baseTs: T0 - 5 * MIN, seenTs: T0 - MIN, seenVia: 'combat' }), // UP
    row('a kobold', 'Befallen', { estimateMs: undefined, baseTs: T0 - 2 * MIN }), // counting up
    row('Guk frog', 'Lower Guk', { baseTs: T0 - 29 * MIN })
  ])
  const view = respawnsHere(snap, T0, fmt)
  assert.deepEqual(
    view.rows.map((r) => [r.display, r.label]),
    [
      ['a ghoul', 'UP'],
      ['Gynok Moltor', 'due 600s ago'],
      ['a skeleton', '300s'],
      ['a kobold', '+120s']
    ]
  )
  assert.deepEqual([view.rows[0].seen, view.rows[1].due, view.rows[2].due], [true, true, false])
  assert.equal(view.tracked, 5)
})

test('respawns: a clock gone stale is left to the tab, and the list stops at the limit', () => {
  const stale = row('old', 'Befallen', { baseTs: T0 - 30 * MIN - RESPAWN_LINGER_MS - MIN })
  const live = Array.from({ length: 7 }, (_, i) => row(`m${String(i)}`, 'Befallen', { baseTs: T0 - (i + 1) * MIN }))
  const view = respawnsHere(respawnSnap([stale, ...live]), T0, fmt)
  assert.equal(view.rows.length, 5)
  assert.ok(!view.rows.some((r) => r.display === 'old'))
  assert.equal(view.rows[0].display, 'm6')
  assert.deepEqual(respawnsHere(respawnSnap([]), T0, fmt), { zone: 'Befallen', rows: [], tracked: 0 })
})

// ─── Motes and coin ────────────────────────────────────────────────────────────────────────

/**
 * Three hours of record ending at T0. A logout from -2h to -1h makes the session the last hour.
 * Befallen until -30m, then Lake Rathetear. Coin: 1000cp before the session, 2000cp at -50m
 * (Befallen), 500cp at -20m (the lake).
 */
function progression(): ProgressionSnap {
  return {
    expTs: [], expPct: [], expFlag: [],
    killTs: [], killZone: [], killCredit: [],
    witnessTs: [], recentKills: [], lootTs: [],
    zoneStart: [T0 - 3 * HOUR, T0 - 30 * MIN], zoneEnd: [T0 - 30 * MIN, 0], zoneName: ['Befallen', 'Lake Rathetear'],
    offlineStart: [T0 - 2 * HOUR], offlineEnd: [T0 - HOUR], offlineCamped: [1],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [],
    coinTs: [T0 - 150 * MIN, T0 - 50 * MIN, T0 - 20 * MIN],
    coinCopper: [1000, 2000, 500],
    coinSold: ['', '', ''],
    lastTs: T0, windowStart: 0, dropped: 0
  } as ProgressionSnap
}

const LOOT: LootEvent[] = [
  { ts: T0 - 150 * MIN, item: 'Mote of Minor Potential', zone: 'Befallen' },
  { ts: T0 - 50 * MIN, item: 'Mote of Minor Potential', zone: 'Befallen' },
  { ts: T0 - 45 * MIN, item: 'Mote of Major Potential', zone: 'Befallen' },
  { ts: T0 - 40 * MIN, item: 'Bone Chips', zone: 'Befallen' },
  { ts: T0 - 10 * MIN, item: 'Mote of Minor Potential', zone: 'Lake Rathetear', count: 2 }
]

const ARGS = { prog: progression(), loot: LOOT, bounds: { lo: T0 - 3 * HOUR, hi: T0 }, basis: 'elapsed' as const }

const near = (a: number | null, b: number): boolean => a !== null && Math.abs(a - b) < 0.01

test('motes: this session by tier, per hour, and in this zone this session', () => {
  const view = motesCard(ARGS)
  assert.equal(view.session.count, 4)
  assert.ok(near(view.session.perHour, 4), String(view.session.perHour))
  assert.deepEqual(view.tiers.map((t) => [t.tier, t.drops]), [['Minor', 3], ['Major', 1]])
  assert.equal(view.zone?.name, 'Lake Rathetear')
  assert.equal(view.zone?.count, 2)
  assert.ok(near(view.zone?.perHour ?? null, 4), String(view.zone?.perHour))
})

test('motes: no loot is a zero, never a rate over nothing; no zone line means no zone half', () => {
  const view = motesCard({ ...ARGS, loot: [] })
  assert.deepEqual([view.session.count, view.tiers.length, view.zone?.count], [0, 0, 0])
  const noZone = motesCard({ ...ARGS, prog: { ...progression(), zoneStart: [], zoneEnd: [], zoneName: [] } })
  assert.equal(noZone.zone, null)
})

test('coin: copper this session and per hour, and in this zone this session', () => {
  const view = coinCard(ARGS)
  assert.equal(view.session.count, 2500)
  assert.ok(near(view.session.perHour, 2500), String(view.session.perHour))
  assert.equal(view.zone?.name, 'Lake Rathetear')
  assert.equal(view.zone?.count, 500)
  assert.ok(near(view.zone?.perHour ?? null, 1000), String(view.zone?.perHour))
})

test('coin: a merchant sale is credited to where its item dropped (the Leveling tab rule)', () => {
  const prog = progression()
  // 300cp for the Bone Chips looted in Befallen, sold in the lake at -5m.
  prog.coinTs = [...(prog.coinTs ?? []), T0 - 5 * MIN]
  prog.coinCopper = [...(prog.coinCopper ?? []), 300]
  prog.coinSold = [...(prog.coinSold ?? []), 'Bone Chips']
  const view = coinCard({ ...ARGS, prog })
  assert.equal(view.session.count, 2800)
  assert.equal(view.zone?.count, 500)
})
