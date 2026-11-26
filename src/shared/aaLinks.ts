// aaLinks.ts — where an AA row links in the rest of the app (owner, 2026-11-25: "can we hook things up
// cross link etc"). Pure: a row in, link chips out; the tab turns each into a navigation.
//
// Masteries open their Tradeskills workbench; stat and resist AAs, and the stat cap lines, Best in
// slot; Mnemonic Retention and Mastery of the Past the Spells tab; an activated AA Timers; the
// reincarnation lines Leveling; Banestrike Achievements; a row the game corrects Wiki Gaps > AAs.

import type { AaRow } from './aaOfficial'
import type { Tradeskill } from './tradeskills'

export type AaLinkTo =
  | { kind: 'tradeskill'; tradeskill: Tradeskill }
  | { kind: 'view'; view: 'tradeskills' | 'bis' | 'spells' | 'timers' | 'leveling' | 'slayer' }
  | { kind: 'gaps' }

export interface AaLink {
  label: string
  to: AaLinkTo
}

const MASTERY: Readonly<Record<string, Tradeskill>> = {
  'Alchemy Mastery': 'Alchemy',
  'Baking Mastery': 'Baking',
  'Blacksmithing Mastery': 'Blacksmithing',
  'Brewing Mastery': 'Brewing',
  'Fletching Mastery': 'Fletching',
  'Jewel Craft Mastery': 'Jewelcrafting',
  'Pottery Mastery': 'Pottery',
  'Tailoring Mastery': 'Tailoring'
}

const BEST_IN_SLOT = new Set([
  'Innate Eminence', 'Natural Durability', 'Innate Spell Resistance', 'Combat Stability', 'Combat Agility',
  'Physical Enhancement', 'Race Reincarnation: Human', 'Race Reincarnation: Half Elf'
])

const SPELLS = new Set(['Mnemonic Retention', 'Mastery of the Past'])

const REFRESH = /Refresh Time:\s*([\d:]+)\s*-\s*Ability Timer\(s\):\s*(\d+)/i

export interface AaActivation {
  /** "10 min", "6 h", "30 s". */
  refresh: string
  timer: number
}

/** An activated AA's refresh and timer, from the text's activation line; null for a passive. */
export function aaActivation(text: string): AaActivation | null {
  const m = REFRESH.exec(text)
  if (m === null) return null
  const [h = 0, min = 0, s = 0] = m[1].split(':').map(Number)
  const parts = [h > 0 ? `${String(h)} h` : '', min > 0 ? `${String(min)} min` : '', s > 0 && h === 0 ? `${String(s)} s` : ''].filter((p) => p !== '')
  return { refresh: parts.length === 0 ? '1 s' : parts.join(' '), timer: Number(m[2]) }
}

/** The link chips a row's details show. */
export function aaLinks(row: AaRow, key: string): AaLink[] {
  const out: AaLink[] = []
  const mastery = MASTERY[row.name]
  if (mastery !== undefined) out.push({ label: mastery, to: { kind: 'tradeskill', tradeskill: mastery } })
  if (row.name === 'Crafting Mastery' || row.name === 'Foraging') out.push({ label: 'Tradeskills', to: { kind: 'view', view: 'tradeskills' } })
  if (BEST_IN_SLOT.has(key)) out.push({ label: 'Best in slot', to: { kind: 'view', view: 'bis' } })
  if (SPELLS.has(row.name)) out.push({ label: 'Spells', to: { kind: 'view', view: 'spells' } })
  const act = aaActivation(row.text)
  if (act !== null) out.push({ label: `Timers · ${act.refresh}`, to: { kind: 'view', view: 'timers' } })
  if (key.includes('Reincarnation: ')) out.push({ label: 'Leveling · reincarnations', to: { kind: 'view', view: 'leveling' } })
  if (row.name === 'Banestrike') out.push({ label: 'Slayer achievements', to: { kind: 'view', view: 'slayer' } })
  if ((row.marks ?? []).length > 0) out.push({ label: 'Wiki Gaps · AAs', to: { kind: 'gaps' } })
  return out
}
