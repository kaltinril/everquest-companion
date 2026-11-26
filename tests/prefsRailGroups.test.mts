// The Preferences rail's groups (owner, 2026-11-26): sections are cut into groups at each id
// RAIL_GROUP_STARTS names, in order, so every section sits under exactly one heading.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { railGroups } from '../src/renderer/src/features/preferences/PrefsRail'
import { RAIL_GROUP_STARTS } from '../src/renderer/src/features/preferences/prefsRailGroups'

const sec = (id: string): { id: string; label: string; icon: null; items: [] } => ({ id, label: id, icon: null, items: [] })

test('sections are cut into groups at each heading id, order kept', () => {
  const ids = ['game', 'log-archive', 'textsize', 'window', 'overlays', 'voice', 'profiles', 'thanks']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = railGroups(ids.map(sec) as any)
  assert.deepEqual(
    groups.map((g) => [g.heading, g.sections.map((s) => s.id)]),
    [
      [RAIL_GROUP_STARTS.game, ['game', 'log-archive']],
      [RAIL_GROUP_STARTS.textsize, ['textsize', 'window']],
      [RAIL_GROUP_STARTS.overlays, ['overlays', 'voice']],
      [RAIL_GROUP_STARTS.profiles, ['profiles', 'thanks']]
    ]
  )
})

test('sections before the first heading form a group with no heading', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = railGroups(['loose', 'game'].map(sec) as any)
  assert.deepEqual(groups.map((g) => g.heading), [null, RAIL_GROUP_STARTS.game])
})
