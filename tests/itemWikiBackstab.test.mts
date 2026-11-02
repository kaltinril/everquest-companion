// The wiki's own BACKSTAB default (owner, 2026-11-01): `Template:Itembox` draws `BACKSTAB: <DMG>` for
// a rogue-usable `Skill: Piercing` weapon whose statsblock states DMG and no BACKSTAB. The page text
// never says it, so the parse must. Fixtures are trimmed copies of the cached pages they are named after.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseItemWikitext } from '../src/main/itemLookupParse'
import { parseStatsBlock, wikiDefaultBackstab } from '../src/shared/itemStats'

const page = (name: string, statsblock: string): string => `<onlyinclude>{{Itempage
|itemname    = ${name}
|lucy_img_ID = 574
|statsblock  =
${statsblock}
|dropsfrom =
}}</onlyinclude>`

const THORNSTINGER = page('Thornstinger', `MAGIC ITEM  LORE ITEM  NO DROP<br>
Slot: PRIMARY  SECONDARY<br>
Skill: Piercing  Atk Delay: 19<br>
DMG: 12 <br>
STR: +5  DEX: +5  AGI: +5  HP: +50<br>
WT: 2.0  Size: SMALL<br>
Class: ROG<br>
Race: ALL<br>`)

const RIB_BONE_STILETTO = page('Rib-bone Stiletto', `Attunable<br>
Slot: PRIMARY SECONDARY<br>
Skill: Piercing  Atk Delay: 18<br>
DMG: 4 <br>
BACKSTAB: 7<br>
WT: 3.0  Size: SMALL<br>
Class: WAR PAL RNG SHD MNK BRD ROG NEC WIZ MAG ENC BST BER<br>
Race: ALL<br>`)

const BEETLE_STINGER = page('Beetle Stinger', `Slot: PRIMARY SECONDARY<br>
Skill: Piercing  Atk Delay: 24<br>
DMG: 8<br>
WT: 1.0  Size: SMALL<br>
Class: WAR SHM<br>
Race: ALL<br>`)

const ROGUE_SWORD = page('Rogue Sword', `Slot: PRIMARY SECONDARY<br>
Skill: 1H Slashing  Atk Delay: 24<br>
DMG: 8<br>
WT: 4.0  Size: MEDIUM<br>
Class: WAR ROG<br>
Race: ALL<br>`)

const ALL_EXCEPT = page('Some Dagger', `Slot: PRIMARY SECONDARY<br>
Skill: Piercing  Atk Delay: 20<br>
DMG: 6<br>
Class: ALL except CLR PAL DRU MNK SHM<br>
Race: ALL<br>`)

const backstabOf = (wikitext: string, name: string): number | undefined => parseItemWikitext(name, wikitext).stats?.backstab

test('A ROGUE PIERCER WITH NO BACKSTAB LINE TAKES ITS DMG, AS THE WIKI DRAWS IT (Thornstinger)', () => {
  assert.equal(backstabOf(THORNSTINGER, 'Thornstinger'), 12)
})

test('AN EXPLICIT BACKSTAB LINE WINS OVER THE DEFAULT (Rib-bone Stiletto, DMG 4, BACKSTAB 7)', () => {
  assert.equal(backstabOf(RIB_BONE_STILETTO, 'Rib-bone Stiletto'), 7)
})

test('A PIERCER NO ROGUE CAN USE GETS NO BACKSTAB (Beetle Stinger, WAR SHM)', () => {
  assert.equal(backstabOf(BEETLE_STINGER, 'Beetle Stinger'), undefined)
})

test('A ROGUE WEAPON THAT IS NOT PIERCING GETS NO BACKSTAB', () => {
  assert.equal(backstabOf(ROGUE_SWORD, 'Rogue Sword'), undefined)
})

test('AN "ALL except ..." CLASS LINE COUNTS, AS THE TEMPLATE TESTS FOR THE TEXT ALL', () => {
  assert.equal(backstabOf(ALL_EXCEPT, 'Some Dagger'), 6)
})

test('1H PIERCING IS NOT THE TEMPLATE\'S "Skill: Piercing": NO DEFAULT', () => {
  const block = parseStatsBlock('Skill: 1H Piercing  Atk Delay: 30<br>\nDMG: 9<br>\nClass: ROG<br>')
  assert.equal(wikiDefaultBackstab(block).backstab, undefined)
})

test('THE PLAIN STATSBLOCK PARSE (the game window\'s path) DOES NOT INVENT A BACKSTAB', () => {
  const block = parseStatsBlock('Skill: Piercing  Atk Delay: 19<br>\nDMG: 12<br>\nClass: ROG<br>')
  assert.equal(block.backstab, undefined)
  assert.equal(wikiDefaultBackstab(block).backstab, 12)
})
