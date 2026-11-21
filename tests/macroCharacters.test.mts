// The Macros tab's character picker: files grouped by character with their loadouts, and the
// name a player gives a loadout (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupCharacters, loadoutLabel, loadoutText, loadoutsCaption, newestLoadout, setLoadoutLabel, LOADOUT_LABEL_MAX } from '../src/shared/macros/characters'
import { readLibrary } from '../src/shared/macros/document'
import { emptyLibrary } from '../src/shared/macros/library'

const file = (character: string, server: string, loadout: number, mtimeMs = 0) => ({
  file: `${character}_${server}_LO${String(loadout)}.ini`,
  character,
  server,
  loadout,
  mtimeMs
})

test('one group per character and server, loadouts in number order', () => {
  const groups = groupCharacters([file('Brannoc', 'oggok', 4), file('Sylwen', 'freeport', 1), file('Brannoc', 'oggok', 1), file('brannoc', 'halas', 1)])
  assert.deepEqual(
    groups.map((g) => [g.character, g.server, g.loadouts.map((f) => f.loadout)]),
    [
      ['Brannoc', 'oggok', [1, 4]],
      ['Sylwen', 'freeport', [1]],
      ['brannoc', 'halas', [1]]
    ]
  )
  assert.equal(loadoutsCaption(groups[0]), 'oggok, 2 loadouts')
  assert.equal(loadoutsCaption(groups[1]), 'freeport, loadout 1')
  assert.deepEqual(groupCharacters([]), [])
})

test('the newest loadout is the one whose file changed last', () => {
  const [group] = groupCharacters([file('Brannoc', 'oggok', 1, 50), file('Brannoc', 'oggok', 4, 90), file('Brannoc', 'oggok', 2, 10)])
  assert.equal(newestLoadout(group).loadout, 4)
})

test('a loadout takes a name, keeps it through a save, and loses it when blanked', () => {
  const lo4 = file('Brannoc', 'oggok', 4)
  const lo1 = file('Brannoc', 'oggok', 1)
  let lib = emptyLibrary()
  assert.equal(loadoutLabel(lib, lo4), '')
  assert.equal(loadoutText(lo4, loadoutLabel(lib, lo4)), 'Loadout 4')
  lib = setLoadoutLabel(lib, lo4, '  Tank ')
  // Kept as typed, so the next word can follow the space; shown trimmed.
  assert.equal(lib.labels?.brannoc_oggok_lo4, 'Tank ')
  assert.equal(loadoutLabel(lib, lo4), 'Tank')
  assert.equal(loadoutText(lo4, loadoutLabel(lib, lo4)), 'Loadout 4: Tank')
  assert.equal(loadoutLabel(lib, lo1), '')
  assert.deepEqual(readLibrary(JSON.parse(JSON.stringify(lib))), lib)
  lib = setLoadoutLabel(lib, lo4, 'x'.repeat(LOADOUT_LABEL_MAX + 9))
  assert.equal(loadoutLabel(lib, lo4).length, LOADOUT_LABEL_MAX)
  lib = setLoadoutLabel(lib, lo4, '   ')
  assert.equal(loadoutLabel(lib, lo4), '')
  assert.deepEqual(lib.labels, {})
  // A library saved before loadouts had names reads back with no labels field at all.
  assert.deepEqual(readLibrary(emptyLibrary()), emptyLibrary())
})
