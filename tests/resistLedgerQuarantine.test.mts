// A resist ledger that will not parse is moved aside, and an earlier kept copy survives it.
//
// The ledger used to move onto one fixed name, and a rename replaces what is there. The ledger
// holds other characters' learned resists, which no log re-derives (main/userDataSeed.ts), so the
// second damaged file destroyed the only copy of the first.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadUserLedgerFile } from '../src/main/resist/ledgerFile'
import { quarantinePathFor, quarantineSlots } from '../src/main/tornJson'

const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function ledgerPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'resist-quarantine-'))
  roots.push(root)
  return join(root, 'resist-ledger.json')
}

test('a second damaged ledger does not replace the first kept copy', () => {
  const path = ledgerPath()
  writeFileSync(path, '{"version":1,"sources":[{"key":"first"')
  assert.equal(loadUserLedgerFile(path, 1).quarantinedPath, quarantinePathFor(path))

  writeFileSync(path, '{"version":1,"sources":[{"key":"second"')
  const again = loadUserLedgerFile(path, 1)

  assert.equal(readFileSync(quarantinePathFor(path), 'utf8'), '{"version":1,"sources":[{"key":"first"')
  assert.equal(again.quarantinedPath, quarantineSlots(path)[1])
  assert.equal(readFileSync(quarantineSlots(path)[1], 'utf8'), '{"version":1,"sources":[{"key":"second"')
  assert.ok(again.notice?.includes(quarantineSlots(path)[1]), 'the log line names where it went')
})

test('with every slot taken the first copy is still the one kept', () => {
  const path = ledgerPath()
  const slots = quarantineSlots(path)
  for (const slot of slots) writeFileSync(slot, `kept ${slot}`)
  writeFileSync(path, 'not json')

  const load = loadUserLedgerFile(path, 1)

  assert.equal(load.quarantinedPath, slots[slots.length - 1])
  assert.equal(readFileSync(slots[0], 'utf8'), `kept ${slots[0]}`)
  assert.equal(existsSync(path), false)
})
