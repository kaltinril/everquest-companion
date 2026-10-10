// ============================================================================
// THE `/outputfile faction` KIND (the third graduated kind) — the format, characterized, pinned.
// ============================================================================
//
// The fixture `tests/fixtures/Drywrought_oggok-WAR-Factions.txt` is a REAL dump from the Legends
// server, exported 2026-09-05 and committed verbatim (5,602 bytes, 1 header + 185 rows). It
// contains faction names, numeric ids and standings — no chat, no character text beyond the
// filename — so the scrub law has nothing to drop, exactly as with the two dumps beside it.
//
// THE NUMBERS BELOW WERE MEASURED BEFORE THE PARSER EXISTED (the awaiting-sample law's actual
// procedure): read the real file, write the shape down (shared/outputs/factions.ts's header),
// THEN write the reader. This is the same characterization as assertions, so a client that
// changes the format fails here rather than quietly parsing to nothing.
//
// TWO REGISTRY FACTS THE SAMPLE CORRECTED are pinned here too: the command is `/outputfile
// faction` (SINGULAR — the in-game usage line lists `faction`, and the plural errors), and the
// filename carries a CLASS TOKEN (`<name>_<server>-WAR-Factions.txt`) that the exact-name
// preference could never match — `preferredOutputFile`'s prefix rule is what resolves it, and the
// multi-character case it exists for is asserted directly.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { factionNameKey, parseFactionsDump } from '../src/shared/outputs/factions'
import { parseAchievementsDump, raceUnlockClaims } from '../src/shared/outputs/achievements'
import { outputKind, parseOutput, preferredOutputFile } from '../src/main/outputs/kinds'
import { isOwnOutputFile } from '../src/shared/outputs/kinds'
import { FACTION_TIER_FLOORS, factionTier } from '../src/renderer/src/features/factions/factionTiers'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const REAL = readFileSync(join(FIXTURES, 'Drywrought_oggok-WAR-Factions.txt'), 'utf8')

// ---------------------------------------------------------------------------
// THE FILE ITSELF — the raw facts the header claims, asserted against the bytes.
// ---------------------------------------------------------------------------

test('the real dump is CRLF with a header row and four tab-separated fields per row', () => {
  assert.equal(REAL.startsWith('﻿'), false, 'no BOM')
  assert.equal((REAL.match(/(?<!\r)\n/g) ?? []).length, 0, 'no bare LF anywhere')
  const lines = REAL.split('\r\n').filter((l) => l !== '')
  assert.equal(lines[0], 'ID\tName\tStandingValue\tPointsToMax', 'the header row, verbatim')
  assert.equal(lines.length, 186, '1 header + 185 faction rows')
  for (const line of lines.slice(1)) {
    const f = line.split('\t')
    assert.equal(f.length, 4, `four fields: ${line}`)
    assert.match(f[0], /^\d+$/, `numeric id: ${line}`)
    assert.notEqual(f[1].trim(), '', `named: ${line}`)
    assert.match(f[2], /^-?\d+$/, `integer standing: ${line}`)
    assert.match(f[3], /^-?\d+$/, `integer toMax: ${line}`)
  }
})

test('every standing sits in [-2000, 2000] and PointsToMax is 2000 - standing on all 185 rows', () => {
  const rows = parseFactionsDump(REAL)
  assert.equal(rows.length, 185)
  for (const r of rows) {
    assert.ok(r.standing >= -2000 && r.standing <= 2000, `${r.name}: ${String(r.standing)}`)
    assert.equal(r.toMax, 2000 - r.standing, `${r.name}: toMax is derived today`)
  }
  // Both caps occur — the endpoints read as clamping, not coincidence (the header's claim).
  assert.equal(rows.filter((r) => r.standing === 2000).length, 21, 'rows parked at +2000')
  assert.equal(rows.filter((r) => r.standing === -2000).length, 12, 'rows parked at -2000')
})

test('ids are unique across the file, and known rows read back verbatim', () => {
  const rows = parseFactionsDump(REAL)
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'distinct ids')
  const byName = new Map(rows.map((r) => [r.name, r]))
  // Spot pins across the value range: a cap, a floor, a negative, a positive, an untouched zero.
  assert.deepEqual(byName.get('Ring of Scale'), { id: 304, name: 'Ring of Scale', standing: 2000, toMax: 0 })
  assert.deepEqual(byName.get('Vox'), { id: 319, name: 'Vox', standing: -2000, toMax: 4000 })
  assert.deepEqual(byName.get('Clan Runnyeye'), { id: 225, name: 'Clan Runnyeye', standing: -377, toMax: 2377 })
  assert.deepEqual(byName.get('Frogloks of Guk'), { id: 251, name: 'Frogloks of Guk', standing: 1815, toMax: 185 })
  assert.deepEqual(byName.get('Oggok Guards'), { id: 337, name: 'Oggok Guards', standing: 0, toMax: 2000 })
})

// ---------------------------------------------------------------------------
// THE PARSER'S STRICTNESS — a shape the real file never printed is dropped, never guessed at.
// ---------------------------------------------------------------------------

test('malformed rows are dropped: wrong field count, non-integer values, blank names', () => {
  const text = [
    'ID\tName\tStandingValue\tPointsToMax',
    '225\tClan Runnyeye\t-377\t2377',
    '1\tToo\tFew', // 3 fields
    '2\tToo\tMany\t0\t0', // 5 fields
    'x\tBad Id\t0\t2000',
    '3\tBad Standing\tsome\t2000',
    '4\t \t0\t2000', // blank name
    '5\tTrailing Junk\t12abc\t2000', // parseInt would guess 12; this parser must not
    '',
    '6\tSurvivor\t100\t1900'
  ].join('\r\n')
  assert.deepEqual(parseFactionsDump(text), [
    { id: 225, name: 'Clan Runnyeye', standing: -377, toMax: 2377 },
    { id: 6, name: 'Survivor', standing: 100, toMax: 1900 }
  ])
})

test('a dump that lost its CRLFs still reads, and a repeated header is skipped by rule', () => {
  const text = 'ID\tName\tStandingValue\tPointsToMax\n225\tClan Runnyeye\t-377\t2377\nID\tName\tStandingValue\tPointsToMax\n'
  assert.deepEqual(parseFactionsDump(text), [{ id: 225, name: 'Clan Runnyeye', standing: -377, toMax: 2377 }])
})

// ---------------------------------------------------------------------------
// THE REGISTRY — the graduated entry, and the two facts the sample corrected.
// ---------------------------------------------------------------------------

test('the faction kind is supported, its command is SINGULAR, and parseOutput answers typed', () => {
  const def = outputKind('faction')
  assert.equal(def.command, '/outputfile faction', 'the usage line lists faction; the plural errors')
  assert.equal(def.fileKind, 'Factions', 'the suffix the client actually wrote stays plural')
  assert.equal(def.fileKindVerified, true)
  assert.equal(def.status, 'supported')
  const res = parseOutput('faction', REAL)
  assert.ok(res.ok)
  assert.equal(res.data.kind, 'faction')
  if (res.data.kind === 'faction') assert.equal(res.data.standings.length, 185)
})

test('preferredOutputFile resolves the class-token filename to ITS character, not to the newest file', () => {
  const def = outputKind('faction')
  // Someone else's dump is NEWER (first in the list). The exact-name preference cannot match
  // Drywrought's file — the class token is in the way — and before the prefix rule the newest-file
  // fallback would have answered with the other character's standings.
  const files = ['Other_oggok-Factions.txt', 'Drywrought_oggok-WAR-Factions.txt']
  assert.equal(
    preferredOutputFile(files, def, 'Drywrought', 'oggok'),
    'Drywrought_oggok-WAR-Factions.txt'
  )
  // The exact form still wins outright when it exists (nothing regressed for the other kinds)…
  assert.equal(
    preferredOutputFile(['Drywrought_oggok-WAR-Factions.txt', 'Drywrought_oggok-Factions.txt'], def, 'Drywrought', 'oggok'),
    'Drywrought_oggok-Factions.txt'
  )
  // …a character with SEVERAL class-token dumps gets the newest of their own…
  assert.equal(
    preferredOutputFile(
      ['Drywrought_oggok-SHD-Factions.txt', 'Drywrought_oggok-WAR-Factions.txt'],
      def,
      'Drywrought',
      'oggok'
    ),
    'Drywrought_oggok-SHD-Factions.txt'
  )
  // …and an unknown character still lands on the newest file, the one-character machine's answer.
  assert.equal(preferredOutputFile(files, def), 'Other_oggok-Factions.txt')
})

test("isOwnOutputFile refuses another character's dump, the one the newest-file fallback hands back", () => {
  const def = outputKind('faction')
  // A character with no dump of their own: the fallback answers with Other's file, and the load
  // must not persist Other's standings under this character.
  const only = ['Other_oggok-WAR-Factions.txt']
  const picked = preferredOutputFile(only, def, 'Drywrought', 'oggok')
  assert.equal(picked, 'Other_oggok-WAR-Factions.txt')
  assert.equal(isOwnOutputFile(`C:\\EQ\\${picked}`, def, 'Drywrought', 'oggok'), false)
  // Their own dump is accepted under every name the resolver would pick it by, case folded…
  for (const own of [
    'Drywrought_oggok-WAR-Factions.txt',
    'drywrought_OGGOK-shd-factions.txt',
    'Drywrought_oggok-Factions.txt',
    'Drywrought-Factions.txt'
  ]) {
    assert.equal(isOwnOutputFile(`C:\\EQ\\${own}`, def, 'Drywrought', 'oggok'), true, own)
  }
  // …a name that merely starts the same is someone else…
  assert.equal(isOwnOutputFile('Drywroughter_oggok-WAR-Factions.txt', def, 'Drywrought', 'oggok'), false)
  // …and an unknown character accepts any file, the one-character machine's answer.
  assert.equal(isOwnOutputFile('Other_oggok-WAR-Factions.txt', def), true)
})

// ---------------------------------------------------------------------------
// THE TIER TABLE — assumed floors (factionTiers.ts's header), pinned at their edges so a future
// calibration is a deliberate table edit, never drift.
// ---------------------------------------------------------------------------

test('every tier floor maps to its own rung, the value below it to the next, and the scale tiles', () => {
  assert.equal(FACTION_TIER_FLOORS[FACTION_TIER_FLOORS.length - 1].floor, -2000, 'the last floor is the scale bottom')
  for (const [i, { faction, floor }] of FACTION_TIER_FLOORS.entries()) {
    assert.equal(factionTier(floor), faction, `${faction} at its floor`)
    const next = FACTION_TIER_FLOORS[i + 1]
    if (next) assert.equal(factionTier(floor - 1), next.faction, `below ${faction}'s floor is ${next.faction}`)
  }
  assert.equal(factionTier(2000), 'ally')
  assert.equal(factionTier(0), 'indifferent')
  assert.equal(factionTier(-1), 'apprehensive')
  assert.equal(factionTier(-2000), 'scowls')
  // Out-of-range values (a format change) land on an honest extreme rather than throwing.
  assert.equal(factionTier(99_999), 'ally')
  assert.equal(factionTier(-99_999), 'scowls')
})

// ---------------------------------------------------------------------------
// THE NAME JOIN — the achievements dump's race-unlock rows against this file's Name column.
// ---------------------------------------------------------------------------

test('every faction a race unlock names joins a row of the real dump through factionNameKey', () => {
  const achievements = readFileSync(join(FIXTURES, 'Primitive_freeport-Achievements.txt'), 'utf8')
  const keys = new Set(parseFactionsDump(REAL).map((r) => factionNameKey(r.name)))
  const named = raceUnlockClaims(parseAchievementsDump(achievements)).flatMap((c) => c.factions.map((f) => f.name))
  assert.equal(named.length, 40, 'the 40 requirement rows the header measured')
  const missed = named.filter((n) => !keys.has(factionNameKey(n)))
  assert.deepEqual(missed, [], 'every requirement finds its faction row')
  // The four the achievements dump spells differently, each landing on the right row.
  assert.equal(factionNameKey('Coalition of Tradesfolk'), factionNameKey('Coalition of Tradefolk'))
  assert.equal(factionNameKey('Freeport Militia'), factionNameKey('The Freeport Militia'))
  assert.equal(factionNameKey('Corrupt Qeynos Guard'), factionNameKey('Corrupt Qeynos Guards'))
  assert.equal(factionNameKey('Da Bashers'), factionNameKey('DaBashers'))
  assert.notEqual(factionNameKey('Coalition of Tradesfolk'), factionNameKey('Coalition of Tradefolk Underground'))
})
