// tableSort.test.mts — the one sortable-header rule and the remembered sort's read-back
// (src/shared/tableSort.ts, dup-ui-a-7, 2026-11-27).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { namesUpNumbersDown, nextSort, sanitizeColumnSort, TABLE_SORT_KEYS, type ColumnSort } from '../src/shared/tableSort'
import { AA_WIKI_ORDER, type AaSort } from '../src/shared/aaBoard'
import { DEFAULT_HISTORY_SORT, HISTORY_SORT_KEYS } from '../src/shared/zoneHistory'
import { DEFAULT_ZONE_SORT, ZONE_SORT_KEYS } from '../src/renderer/src/features/leveling/rangeStatsRows'

type K = 'name' | 'kills'
const natural = namesUpNumbersDown<K>(['name'])

test('a new column opens on its natural end; the same column again flips', () => {
  assert.deepEqual(nextSort<K>(null, 'name', natural), { key: 'name', dir: 'asc' })
  assert.deepEqual(nextSort<K>({ key: 'name', dir: 'asc' }, 'kills', natural), { key: 'kills', dir: 'desc' })
  let s: ColumnSort<K> = { key: 'kills', dir: 'desc' }
  s = nextSort(s, 'kills', natural)
  assert.deepEqual(s, { key: 'kills', dir: 'asc' })
  s = nextSort(s, 'kills', natural)
  assert.deepEqual(s, { key: 'kills', dir: 'desc' }, 'no source order: a two-state flip, forever')
})

test('a table with a source order cycles natural, reversed, source (AA: back to the wiki order)', () => {
  const up = (): 'asc' => 'asc'
  const click = (s: AaSort, key: 'name' | 'level'): AaSort => nextSort<AaSort['key']>(s, key, up, AA_WIKI_ORDER)
  let s = click(AA_WIKI_ORDER, 'level')
  assert.deepEqual(s, { key: 'level', dir: 'asc' })
  s = click(s, 'level')
  assert.deepEqual(s, { key: 'level', dir: 'desc' })
  s = click(s, 'level')
  assert.deepEqual(s, AA_WIKI_ORDER, 'the third click is the wiki order (requirements/alt-advancement.md 2026-11-26)')
  assert.deepEqual(click({ key: 'level', dir: 'desc' }, 'name'), { key: 'name', dir: 'asc' }, 'another column starts fresh')
})

test('a stored sort reads back, and anything that is not one of the columns is the default', () => {
  const keys: readonly K[] = ['name', 'kills']
  const dflt: ColumnSort<K> = { key: 'kills', dir: 'desc' }
  assert.deepEqual(sanitizeColumnSort(JSON.parse('{"key":"name","dir":"desc"}'), keys, dflt), { key: 'name', dir: 'desc' })
  for (const raw of [null, undefined, 'kills', 7, [], {}, { key: 'gone', dir: 'asc' }, { key: 'NAME', dir: 'asc' }]) {
    assert.deepEqual(sanitizeColumnSort(raw, keys, dflt), dflt, JSON.stringify(raw) ?? 'undefined')
  }
  assert.deepEqual(sanitizeColumnSort({ key: 'name', dir: 'sideways' }, keys, dflt), { key: 'name', dir: 'desc' }, 'a bad direction takes the default one')
})

test('a stored column a later build removed falls back to each table\'s default', () => {
  const gone = { key: 'coinPerMinute', dir: 'asc' }
  assert.deepEqual(sanitizeColumnSort(gone, ZONE_SORT_KEYS, DEFAULT_ZONE_SORT), DEFAULT_ZONE_SORT)
  assert.deepEqual(sanitizeColumnSort(gone, HISTORY_SORT_KEYS, DEFAULT_HISTORY_SORT), DEFAULT_HISTORY_SORT)
  assert.deepEqual(sanitizeColumnSort({ key: 'coinPeak', dir: 'asc' }, ZONE_SORT_KEYS, DEFAULT_ZONE_SORT), { key: 'coinPeak', dir: 'asc' })
  assert.deepEqual(sanitizeColumnSort({ key: 'coinPeak', dir: 'asc' }, HISTORY_SORT_KEYS, DEFAULT_HISTORY_SORT), DEFAULT_HISTORY_SORT, 'a Leveling-only column is not a Maps column')
})

test('each table keeps its sort under its own fixed key (a rename forgets every player\'s sort)', () => {
  assert.deepEqual(TABLE_SORT_KEYS, {
    aa: 'eq.aa.sort',
    bazaarQuotes: 'eq.bazaar.quotes.sort',
    bazaarOffers: 'eq.bazaar.offers.sort',
    factions: 'eq.factions.sort',
    levelingZones: 'eq.leveling.rangeZones.sort',
    mapsZoneHistory: 'eq.maps.zoneHistory.sort'
  })
  const all = [...Object.values(TABLE_SORT_KEYS), 'eq.gear.sort', 'eq.achievements.sort']
  assert.equal(new Set(all).size, all.length, 'no two tables share a key, nor Gear or Achievements')
})
