// shared/gapNeeds.ts — the one Mobs list (owner, 2026-11-10: "Merchants, factions, mobs, respawns are
// all basically the same page, just different REASONS the mob shows up"; "even Images is just mobs
// that need only an image update"; "mobs list can have a new column with npc, merchant, faction,
// drops, Images, respawn"; "we need filters under mobs for these things").
//
// The field domains (factions, drops, images, respawns) keep their rows: each is one thing a mob
// page lacks, with its own Copy text. This module reads them BY MOB, so the Mobs list can say what
// each mob needs: a mob the wiki lacks needs its page (every field goes into that page); a mob the
// wiki has needs the fields its page lacks, and gets an Update row here even when the engine served
// none (it was known, so it was no gap). A faction row for a mob with no page folds into that mob's
// New page row: the page carries the faction, so the row said nothing more (today's "Check mob page").
//
// Filters: the Needs chips under the Mobs tab. None ticked shows every row; ticked ones show the
// rows with ANY of those needs; a chip's count is mobs, not needs ("a mob with three needs counts
// once"). Pure, so the rules are tested apart from the tab (tests/gapNeeds.test.mts).

import { factionMob, type GapDomain, type GapRow, type GapsSnap, type GapActionContext } from './gaps'
import { gapJob } from './gapJob'
import { perObject } from './gapMemo'
import { mobKey } from './mobKey'

/** What a mob needs, in the column's order. `page`: the page itself; the rest: one field of a page that exists. */
export type NeedKind = 'page' | 'merchant' | 'factions' | 'drops' | 'picture' | 'respawn' | 'quests' | 'redirect'
export const NEED_KINDS: readonly NeedKind[] = ['page', 'merchant', 'factions', 'drops', 'picture', 'respawn', 'quests', 'redirect']

/** The filter chips' words. */
export const NEED_LABELS: Record<NeedKind, string> = { page: 'NPC page', merchant: 'merchant', factions: 'factions', drops: 'drops', picture: 'picture', respawn: 'respawn', quests: 'quests', redirect: 'redirect' }

/** Why a chip is there, for its tooltip. */
export const NEED_TIPS: Record<NeedKind, string> = {
  page: 'The wiki has no page for this mob: Copy wiki page gives the whole page.',
  merchant: 'The wiki lists this NPC without a merchant page: give it the merchant layout.',
  factions: "A kill moved a faction the mob's page does not list, or states otherwise.",
  drops: "You looted items the mob's page does not list.",
  picture: 'The page has no picture: screenshot it in the open row.',
  respawn: 'Your kills agree on a respawn the page does not state.',
  quests: 'The catalog says this NPC gives quests the page does not list.',
  redirect: 'The name reaches its page only through a redirect: check it.'
}

/** One need on a mob's row: its kind, how many things it covers, and the field rows behind it (their Copy texts). */
export interface GapNeed {
  kind: NeedKind
  n: number
  rows: readonly GapRow[]
}

/** The field rows of one mob, by what they are, and the page they go on. */
interface FieldRows {
  display: string
  page?: string
  factions: GapRow[]
  drops: GapRow[]
  images: GapRow[]
  respawns: GapRow[]
}

const FIELD_DOMAINS: ReadonlySet<GapDomain> = new Set<GapDomain>(['faction', 'drop', 'image', 'respawn'])
/** The tabs the Gaps page shows; the field domains fold into Mobs (`FOLDED_INTO`). Drops stays a tab for its per-item lines. */
export const GAP_TABS: readonly GapDomain[] = ['item', 'mob', 'spell', 'drop', 'notice', 'quest', 'zone']
/** A stored tab choice from before the fold, read as the Mobs tab. */
export const FOLDED_INTO: Readonly<Partial<Record<GapDomain, GapDomain>>> = { merchant: 'mob', faction: 'mob', image: 'mob', respawn: 'mob' }

/** The mob a field row is about: its name as met for an image or respawn row, the ` (mob)` of a faction or drop row. */
const fieldMob = (row: GapRow): string => (row.domain === 'image' || row.domain === 'respawn' ? row.name : factionMob(row))

const emptyFields = (display: string): FieldRows => ({ display, factions: [], drops: [], images: [], respawns: [] })

/** Every field row by its mob's key; built once per rows array. */
export const needIndex = perObject((rows: readonly GapRow[]): ReadonlyMap<string, FieldRows> => {
  const out = new Map<string, FieldRows>()
  for (const r of rows) {
    if (!FIELD_DOMAINS.has(r.domain)) continue
    const mob = fieldMob(r)
    const key = mobKey(mob)
    const at = out.get(key) ?? emptyFields(mob)
    if (!out.has(key)) out.set(key, at)
    if (at.page === undefined && r.page !== undefined) at.page = r.page
    if (r.domain === 'faction') at.factions.push(r)
    else if (r.domain === 'drop') at.drops.push(r)
    else if (r.domain === 'image') at.images.push(r)
    else at.respawns.push(r)
  }
  return out
})

const isMobRow = (r: GapRow): boolean => r.domain === 'mob' || r.domain === 'merchant'

/** The fields a page lacks, from the mob's field rows: factions, drops (one per item), picture, respawn. */
function fieldNeeds(f: FieldRows | undefined): GapNeed[] {
  if (f === undefined) return []
  const each: readonly (readonly [NeedKind, readonly GapRow[], number])[] = [
    ['factions', f.factions, f.factions.length],
    ['drops', f.drops, f.drops.length],
    ['picture', f.images, 1],
    ['respawn', f.respawns, 1]
  ]
  return each.filter(([, rows]) => rows.length > 0).map(([kind, rows, n]) => ({ kind, n, rows }))
}

/** A mob's needs: its page when the wiki lacks it, else each field its page lacks, in `NEED_KINDS` order. */
export function needsOf(row: GapRow, index: ReadonlyMap<string, FieldRows>, ctx: GapActionContext = {}): GapNeed[] {
  if (!isMobRow(row)) return []
  if (gapJob(row, ctx) === 'new') return [{ kind: 'page', n: 1, rows: [] }]
  const needs: GapNeed[] = []
  if (row.domain === 'merchant') needs.push({ kind: 'merchant', n: 1, rows: [] })
  needs.push(...fieldNeeds(index.get(mobKey(row.name))))
  if (row.questGaps !== undefined) needs.push({ kind: 'quests', n: row.questGaps.quests.length, rows: [] })
  if (row.viaRedirect !== undefined) needs.push({ kind: 'redirect', n: 1, rows: [] })
  return needs
}

/** A chip's words: `drops 13`, `factions 2`, `picture`. */
export const needLabel = (need: GapNeed): string => (need.n > 1 ? `${NEED_LABELS[need.kind]} ${String(need.n)}` : NEED_LABELS[need.kind])

/** The earliest and latest stamps among rows that have them; '' when none does. */
function span(rows: readonly GapRow[]): { first: string; last: string } {
  const firsts = rows.map((r) => r.first).filter((s) => s !== '')
  const lasts = rows.map((r) => r.last).filter((s) => s !== '')
  return { first: firsts.length === 0 ? '' : firsts.reduce((a, b) => (a < b ? a : b)), last: lasts.length === 0 ? '' : lasts.reduce((a, b) => (a > b ? a : b)) }
}

/**
 * The Update row for a known mob that has field rows and no row of its own: its page, the kinds and
 * zones its field rows carry, the most of their counts. `page` set is what makes it an update (gapJob.ts).
 */
function updateRow(f: FieldRows): GapRow {
  const all = [...f.images, ...f.respawns, ...f.factions, ...f.drops]
  const kinds = [...new Set(all.flatMap((r) => r.kinds))]
  const zones = all.find((r) => r.details.zones !== undefined)?.details.zones
  return {
    domain: 'mob',
    name: f.display,
    kinds,
    count: Math.max(0, ...all.map((r) => r.count)),
    ...span(all),
    details: { samples: [], ...(zones === undefined ? {} : { zones }) },
    ...(f.page === undefined ? {} : { page: f.page })
  }
}

/**
 * The snapshot with the Mobs list joined: an Update row for every known mob with field rows and no
 * row of its own (counted under `mob`), and the faction rows of mobs the wiki lacks folded into those
 * mobs' own New page rows (no longer under `faction`). Once per snapshot object.
 */
export const withMobNeeds = perObject((snap: GapsSnap): GapsSnap => {
  const index = needIndex(snap.rows)
  const own = new Set(snap.rows.filter(isMobRow).map((r) => mobKey(r.name)))
  const folded = (r: GapRow): boolean => r.domain === 'faction' && r.noPage === true && own.has(mobKey(factionMob(r)))
  const rows = snap.rows.filter((r) => !folded(r))
  const dropped = snap.rows.length - rows.length
  const updates = [...index.entries()].filter(([key]) => !own.has(key)).map(([, f]) => updateRow(f))
  if (dropped === 0 && updates.length === 0) return snap
  const totals = { ...snap.totals, mob: (snap.totals.mob ?? 0) + updates.length, ...(dropped === 0 ? {} : { faction: Math.max(0, (snap.totals.faction ?? 0) - dropped) }) }
  return { ...snap, rows: [...rows, ...updates], totals }
})

/** The rows with any of the ticked needs; every row when none is ticked. */
export function needsFilter(rows: readonly GapRow[], picked: ReadonlySet<NeedKind>, needs: (row: GapRow) => readonly GapNeed[]): GapRow[] {
  if (picked.size === 0) return [...rows]
  return rows.filter((r) => needs(r).some((n) => picked.has(n.kind)))
}

/** How many of the rows have each need: the chips' counts, mobs not needs. */
export function needCounts(rows: readonly GapRow[], needs: (row: GapRow) => readonly GapNeed[]): ReadonlyMap<NeedKind, number> {
  const out = new Map<NeedKind, number>()
  for (const r of rows) for (const n of new Set(needs(r).map((x) => x.kind))) out.set(n, (out.get(n) ?? 0) + 1)
  return out
}

/** The stored Needs choice (`factions,drops`) as a set of kinds; unknown words dropped. */
export function needsPickOf(raw: string | null): ReadonlySet<NeedKind> {
  return new Set((raw ?? '').split(',').filter((w): w is NeedKind => NEED_KINDS.some((k) => k === w)))
}

export const needsPickText = (picked: ReadonlySet<NeedKind>): string => NEED_KINDS.filter((k) => picked.has(k)).join(',')

/**
 * An Update row's Copy: the Copy texts of its field rows, one after another (a faction's lines, a
 * drop's lines, the image file name, the respawn line), never a whole page over one that exists.
 * Undefined for a row with no field rows (its own Copy applies).
 */
export function needsCopyText(row: GapRow, index: ReadonlyMap<string, FieldRows>, pageText: (row: GapRow) => string, ctx: GapActionContext = {}): string | undefined {
  const rows = needsOf(row, index, ctx).flatMap((n) => n.rows)
  if (rows.length === 0) return undefined
  return rows.map(pageText).filter((t) => t.trim() !== '').join('\n\n')
}

/** A Mobs or Merchants row whose page exists (an Update row): its Copy is its needed lines, never a page, and it reads no page. */
export function isUpdateMob(row: GapRow, ctx: GapActionContext = {}): boolean {
  return isMobRow(row) && gapJob(row, ctx) === 'update'
}

/** Seen as, collapsed: the first two kinds and how many more (owner, 2026-11-10: "fixed width and gets chips cut off"). */
export function seenAs(kinds: readonly string[]): { shown: string[]; more: number } {
  return { shown: kinds.slice(0, 2), more: Math.max(0, kinds.length - 2) }
}
