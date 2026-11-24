// characterFlags.test.mts — Group by item: per character on Loot, one app-wide choice on Wiki Gaps
// (owner, 2026-11-23, answering the bug hunt's open questions: "setting for the wiki gaps tab can be
// left for the app, not per character. LOOT drops? probably per character instead").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { characterFlag, characterFlagId, NO_CHARACTER, readCharacterFlags, withCharacterFlag } from '../src/shared/characterFlags'

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

test("one character's choice leaves every other character's alone, and survives a write-read round trip", () => {
  const drywrought = characterFlagId({ name: 'Drywrought', server: 'oggok' })
  const alt = characterFlagId({ name: 'Kaltinril', server: 'oggok' })
  assert.equal(drywrought, 'drywrought_oggok', "main's characterId spelling")
  let flags = readCharacterFlags(null)
  assert.equal(characterFlag(flags, drywrought, true), true, 'no choice yet: the default')
  flags = readCharacterFlags(JSON.stringify(withCharacterFlag(flags, drywrought, false)))
  assert.equal(characterFlag(flags, drywrought, true), false)
  assert.equal(characterFlag(flags, alt, true), true, 'the alt never chose, so it reads the default')
  flags = readCharacterFlags(JSON.stringify(withCharacterFlag(flags, alt, true)))
  assert.equal(characterFlag(flags, drywrought, true), false, 'the alt turning it on does not reach Drywrought')
})

test('one name on two servers is two characters; no character attached files under its own id', () => {
  assert.notEqual(characterFlagId({ name: 'Bob', server: 'oggok' }), characterFlagId({ name: 'Bob', server: 'other' }))
  assert.equal(characterFlagId(null), NO_CHARACTER)
  assert.equal(characterFlagId(undefined), NO_CHARACTER)
  const flags = withCharacterFlag({}, NO_CHARACTER, false)
  assert.equal(characterFlag(flags, 'bob_oggok', true), true, 'the no-character choice is not a character')
})

test('stored text that is not a choice map reads as no choices, never a throw', () => {
  for (const text of ['', 'not json', '[1,2]', 'null', '7']) assert.deepEqual(readCharacterFlags(text), {})
  assert.deepEqual(readCharacterFlags('{"a_b":false,"c_d":"yes","e_f":true}'), { a_b: false, e_f: true })
})

test('the Loot tab keeps Group by item per character, not in component state that a switch remounts', () => {
  const view = source('../src/renderer/src/features/loot/LootView.tsx')
  assert.doesNotMatch(view, /\[groupByItem, setGroupByItem\] = useState\(/)
  assert.match(view, /\[groupByItem, setGroupByItem\] = useGroupByItem\(\)/)
  const chrome = source('../src/renderer/src/features/loot/LootChrome.tsx')
  assert.match(chrome, /characterFlagId\(useModule<CharacterSnap>\('character'\)\?\.character\)/)
})

test("the Wiki Gaps tab's grouping is one app-wide choice: a fixed key, no character in it", () => {
  const grouping = source('../src/renderer/src/features/gaps/useGrouping.ts')
  assert.match(grouping, /const GROUPED_KEY = 'eq\.gaps\.grouped'/)
  assert.match(grouping, /useBoolPref\(GROUPED_KEY, false\)/)
  assert.doesNotMatch(grouping, /character/i)
})
