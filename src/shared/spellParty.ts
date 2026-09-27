// spellParty.ts — THE BUFF SET, WITH THE GROUP IN IT.
//
// The ask (Garrett, 2026-09-26): *"Maybe see if you can add buff stacking to the app? There's this
// site that can do it, but only for your own combo. It doesn't take into account group members."*
//
// The stacking engine (`spellStack.ts`) and the selection (`spellLoadout.ts`) already answer the
// question for one class trio. A group changes the POOL and nothing else: the buffs that can be on
// you are the ones you cast plus the ones a group-mate can put on you, and which of them can stand
// together is the same question with more candidates in it. So this file builds that pool and hands
// it to `buildLoadout` unchanged.
//
// ── WHAT A GROUP-MATE CAN GIVE YOU IS NARROWER THAN WHAT THEY CAN CAST ────────────────────────
//
// A `Self` buff on a shaman is the shaman's. Only a spell whose target reaches another player is a
// candidate from a group-mate, and that is read off the catalog's own `target_type`. Your own
// spells take no such filter: everything you cast can land on you.
//
// ── THE GROUP IS TYPED IN, BECAUSE THE LOG DOES NOT STATE IT ──────────────────────────────────
//
// The roster knows names (`roster.ts`) and the `/who` rule reads the player's own row only, on
// purpose (`SelfWhoEvent`). Nothing the app reads states a group-mate's classes, so they are the
// user's to enter and this file validates what was stored rather than inferring anything.
//
// Pure: no React, no Electron, no storage. The renderer keeps the list; this file reads it back.

import { isClassAbbr, MAX_COMBO_SLOTS, type ClassAbbr } from './classCombo'
import type { UnlockSpell } from './levelUnlocks'
import {
  loadoutCandidates,
  type CandidateQuery,
  type LoadoutCandidate,
  type StatWeights
} from './spellLoadout'

/** One group-mate, as the user entered them. */
export interface PartyMember {
  name: string
  /** One to three classes, in the order they were picked. */
  classes: ClassAbbr[]
}

/** A group is six, and one of them is you. */
export const MAX_PARTY_MEMBERS = 5

const MAX_NAME_LENGTH = 32

/** The caster name your own spells carry. */
export const SELF_CASTER = 'You'

/** The pool, and who in the group can cast each spell in it. */
export interface PartyCandidates {
  candidates: LoadoutCandidate[]
  /** Spell name to caster names, you first. Empty when there is no group: every row is yours. */
  casters: ReadonlyMap<string, readonly string[]>
}

// =================================================================================================
// THE STORED LIST
// =================================================================================================

const nameKey = (name: string): string => name.trim().toLowerCase()

/** The classes of one stored row: deduped, closed-set, capped at a loadout's three. */
function memberClasses(raw: unknown): ClassAbbr[] {
  if (!Array.isArray(raw)) return []
  const out: ClassAbbr[] = []
  for (const c of raw) {
    if (isClassAbbr(c) && !out.includes(c) && out.length < MAX_COMBO_SLOTS) out.push(c)
  }
  return out
}

/** One stored row, or null when it names no class. A nameless member is named by their classes. */
function memberOf(raw: unknown): PartyMember | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as { name?: unknown; classes?: unknown }
  const classes = memberClasses(row.classes)
  if (classes.length === 0) return null
  const typed = typeof row.name === 'string' ? row.name.trim().slice(0, MAX_NAME_LENGTH) : ''
  return { name: typed === '' ? classes.join('/') : typed, classes }
}

/**
 * The group as stored, validated. Anything that is not a member is dropped rather than repaired, a
 * repeated name keeps its LATEST row, and the list is capped at a full group.
 */
export function normalizeParty(raw: unknown): PartyMember[] {
  if (!Array.isArray(raw)) return []
  let out: PartyMember[] = []
  for (const entry of raw) {
    const member = memberOf(entry)
    if (member !== null) out = withMember(out, member)
  }
  return out
}

/** The group out of its stored text. Unreadable text is an empty group, never a throw. */
export function readParty(text: string | null): PartyMember[] {
  if (text === null || text === '') return []
  try {
    return normalizeParty(JSON.parse(text) as unknown)
  } catch {
    return []
  }
}

/** The group with this member added, replacing a member of the same name. Refused when full. */
export function withMember(party: readonly PartyMember[], member: PartyMember): PartyMember[] {
  const next = memberOf(member)
  if (next === null) return [...party]
  const key = nameKey(next.name)
  const at = party.findIndex((m) => nameKey(m.name) === key)
  if (at >= 0) return party.map((m, i) => (i === at ? next : m))
  return party.length >= MAX_PARTY_MEMBERS ? [...party] : [...party, next]
}

/** The group without the member of this name. */
export function withoutMember(party: readonly PartyMember[], name: string): PartyMember[] {
  const key = nameKey(name)
  return party.filter((m) => nameKey(m.name) !== key)
}

// =================================================================================================
// THE POOL
// =================================================================================================

/** The catalog's target types that reach a player other than the caster. */
const REACHES_OTHERS: ReadonlySet<string> = new Set([
  'single',
  'single friendly (or self)',
  'target group member or self',
  'group',
  'group v1',
  'group v2',
  'party'
])

/**
 * CAN A GROUP-MATE PUT THIS SPELL ON YOU?
 *
 * Read off the catalog's `target_type`. A row that states none is kept: silence is not a verdict
 * (law 1), and every beneficial row in the committed catalog states one.
 */
export function landsOnOthers(spell: Pick<UnlockSpell, 'targetType'>): boolean {
  if (spell.targetType === undefined) return true
  return REACHES_OTHERS.has(spell.targetType.trim().toLowerCase())
}

/**
 * EVERY BUFF THAT CAN BE ON YOU: yours, plus what each group-mate can put on you.
 *
 * `query.level` is YOUR level and is applied to the group-mates too. The log states nobody else's
 * level, a group is usually within a few levels of itself, and a field per member for a number the
 * user would have to look up is a worse trade than saying so on the surface that draws this.
 *
 * WITH NO GROUP THIS IS `loadoutCandidates` AND NOTHING ELSE, the same array, so a solo player's
 * tab reads exactly as it did.
 */
export function partyCandidates(
  spells: readonly UnlockSpell[],
  own: readonly ClassAbbr[],
  party: readonly PartyMember[],
  scoring: { weights: StatWeights; query?: CandidateQuery }
): PartyCandidates {
  const { weights, query } = scoring
  const mine = loadoutCandidates(spells, own, weights, query)
  if (party.length === 0) return { candidates: mine, casters: new Map() }

  const byName = new Map<string, LoadoutCandidate>()
  const casters = new Map<string, string[]>()
  const admit = (c: LoadoutCandidate, caster: string): void => {
    if (!byName.has(c.name)) byName.set(c.name, c)
    const held = casters.get(c.name)
    if (held === undefined) casters.set(c.name, [caster])
    else if (!held.includes(caster)) held.push(caster)
  }
  for (const c of mine) admit(c, SELF_CASTER)
  const reach = spells.filter(landsOnOthers)
  for (const member of party) {
    for (const c of loadoutCandidates(reach, member.classes, weights, query)) admit(c, member.name)
  }
  // Score-descending, which `buildLoadout`'s greedy path relies on.
  const candidates = [...byName.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return { candidates, casters }
}

/** Who casts a spell, in words: `You`, `Garrett`, `You or Garrett`, `You, Garrett or Malkil`. */
export function castByLabel(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}
