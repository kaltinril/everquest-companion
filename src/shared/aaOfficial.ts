// aaOfficial.ts — what the game says of the AAs over the wiki's AA tables (owner, 2026-11-25: trust
// the game, the log and Daybreak's own patch notes, over the community wiki). A hand-written layer on
// top of shared/aaTable.generated.ts, which stays the wiki cache's mirror (tests/aaTable.test.mts).
// Every reader of the table (the Alt. Advancement tab, its ranks and points, Best in slot's cap)
// reads `AA_ROWS`; Wiki Gaps' AAs tab (shared/gapAas.ts) lists each correction the page still lacks.
//
// Each entry names its source and date. A changed field carries a mark with a one-sentence tooltip.
// The facts were read from everquestlegends.com patch notes, the wiki's copy of them and the game's
// AA window and `/alternateadv list` on 2026-11-25 (docs/community/agent/MEASURED.md); no fetch.

import { AA_TABLE, type AaTableRow } from './aaTable.generated'
import { aaFold } from './aaLogMatch'
import { classAbbrForDisplayName } from './spellLevels'

/** Where a correction comes from. `where` is the patch notes' URL, or the game's window in words. */
export interface AaSource {
  by: 'notes' | 'game'
  date: string
  where: string
}

export type AaField = 'row' | 'name' | 'ranks' | 'cost' | 'text' | 'hk' | 'removed' | 'header'

export interface AaCorrection {
  /** The wiki row's name; the new row's name for `add`. */
  name: string
  class?: string
  source: AaSource
  /** The mark's tooltip: one sentence naming the source. */
  tip: string
  add?: AaTableRow
  /** A placeholder the game lists: a Wiki Gaps row only, never a row of the tab. */
  gapsOnly?: true
  /** A note for the tab only: a Wiki Gaps row of its own would repeat another (the Special header's). */
  tabOnly?: true
  rename?: string
  ranks?: number
  cost?: string
  /** Words added to the Description, before its `Requirements:` when it has one. */
  append?: string
  /** The Description already says it when it matches (the wiki caught up). */
  onPage?: RegExp
  removed?: true
  /** A second source for a row another entry corrects: evidence only, nothing changed. */
  confirms?: true
  /** Words added to a Special row's hotkey cell (its activated ability). */
  hkNote?: string
  /** Not a row: a table header line of the page, what it says and the line it should be. */
  header?: { says: string; should: string; line: string }
}

export interface AaMark {
  field: AaField
  tip: string
  date: string
}

/** A table row with the corrections applied: what changed, and since when it is gone. */
export interface AaRow extends AaTableRow {
  marks?: AaMark[]
  /** The date of the notes that removed it; out of the points and the rank pickers. */
  removed?: string
}

const notes = (date: string, page: string): AaSource => ({ by: 'notes', date, where: `https://www.everquestlegends.com/patch-notes/${page}` })
/** Daybreak's notes as the wiki's Patch Notes page copies them (no everquestlegends.com page seen). */
const wikiCopy = (date: string): AaSource => ({ by: 'notes', date, where: 'https://eqlwiki.com/Patch_Notes' })
const GAME: AaSource = { by: 'game', date: '2026-11-25', where: "the game's AA window and /alternateadv list" }

const STRIKE_AS_ONE =
  // The game's own text (#2261); the level is Daybreak's notes'.
  "This passive ability grants the Beastlord a chance on hit to increase their Warder's chance to flurry by 30% for 12 seconds. Requirements: Level 35."
const POTTERY_4 =
  'Rank 4: reduces the chance of failing Pottery recipes by 50% and allows you to increase your skill past its Specialization cap by 5 points by learning more recipes.'

const HK_NOTE = 'Refresh 2:00, shared timer 90; rank 3 keeps its passive.'

/** The class reincarnation rows' activated rank 3, as the game's window shows it (Warrior, Monk, Shaman). */
function classHotkeys(table: readonly AaTableRow[]): AaCorrection[] {
  return table.flatMap((row) => {
    const m = row.section === 'special' ? /^Class Reincarnation:\s*(.+)$/.exec(row.name) : null
    if (m === null || classAbbrForDisplayName(m[1]) === undefined) return []
    const tip = "The game's AA window: refresh 2:00, shared timer 90; rank 3 keeps its passive."
    return [{ name: row.name, source: GAME, tip, hkNote: HK_NOTE, onPage: /2:00|shared timer 90/i, tabOnly: true as const }]
  })
}

/** The Special race rows the wiki writes `Class Reincarnation: <race>`; the game, `Race Reincarnation: <race>`. */
function raceRenames(table: readonly AaTableRow[]): AaCorrection[] {
  return table.flatMap((row) => {
    const m = row.section === 'special' ? /^Class Reincarnation:\s*(.+)$/.exec(row.name) : null
    if (m === null || classAbbrForDisplayName(m[1]) !== undefined) return []
    const tip = "The game names this AA Race Reincarnation, not the wiki's Class Reincarnation."
    return [{ name: row.name, source: GAME, tip, rename: `Race Reincarnation: ${m[1]}` }]
  })
}

const specialRace = (race: string): AaTableRow => ({ section: 'special', name: `Race Reincarnation: ${race}`, ranks: 3, cost: '', values: ['?', '?', '?'], text: '' })

// prettier-ignore
const ENTRIES: readonly AaCorrection[] = [
  { name: 'Strike As One', class: 'Beastlord', source: GAME, tip: "The game's AA list shows Strike As One at cost 6; the wiki lacks it.", add: { section: 'class', class: 'Beastlord', name: 'Strike As One', ranks: 1, cost: '6', text: STRIKE_AS_ONE } },
  { name: 'Strike As One', class: 'Beastlord', source: notes('2026-08-25', 'eql-update-notes-8-25-2026'), tip: "Daybreak's 2026-08-25 notes added Strike As One at level 35.", confirms: true },
  { name: 'Rampage', source: notes('2026-10-22', 'eql-update-notes-10-22-2026'), tip: "Daybreak's 2026-10-22 notes: rank 2 at level 40 for Warriors and Berserkers.", ranks: 2, append: 'Rank 2: Level 40, Warriors and Berserkers.', onPage: /rank 2/i },
  { name: 'Rampage', source: GAME, tip: "The game's AA window shows Rampage rank 2 costing 4 points.", cost: '5/4' },
  { name: 'Valiant Steed', class: 'Paladin', source: notes('2026-09-01', 'eql-update-notes-9-01-2026'), tip: "Daybreak's 2026-09-01 notes removed this AA and refunded its points.", removed: true },
  { name: 'Abyssal Steed', class: 'Shadow Knight', source: notes('2026-09-01', 'eql-update-notes-9-01-2026'), tip: "Daybreak's 2026-09-01 notes removed this AA and refunded its points.", removed: true },
  { name: 'Unbounded Strikethrough', class: 'Ranger', source: wikiCopy('2026-06-16'), tip: "Daybreak's 2026-06-16 notes name it Unbound Strikethrough; the wiki says Unbounded.", rename: 'Unbound Strikethrough' },
  { name: 'Quick Buff', source: wikiCopy('2026-05-28'), tip: "Daybreak's 2026-05-28 notes: Quick Buff cannot be used in combat.", append: 'It cannot be used in combat.', onPage: /combat/i },
  { name: 'Quick Buff', source: notes('2026-07-14', 'eql-update-notes-7-14-2026'), tip: "Daybreak's 2026-07-14 notes: it turns off any invocation, then restores it.", append: 'It turns off any invocation and restores it after.', onPage: /invocation/i },
  { name: 'Quick Buff', source: notes('2026-07-28', 'eql-update-notes-7-28-2026'), tip: "Daybreak's 2026-07-28 notes: Quick Buff skips lull and pacify spells.", append: 'It does not cast lull or pacify spells.', onPage: /lull|pacify/i },
  { name: 'Quick Buff', source: notes('2026-09-15', 'eql-update-notes-9-15-2026'), tip: "Daybreak's 2026-09-15 notes: the Quick Buff timer resets on death.", append: 'Its timer resets on death.', onPage: /death/i },
  { name: 'Point Blank Fire', source: notes('2026-09-22', 'eql-update-notes-9-22-2026'), tip: "Daybreak's 2026-09-22 notes: Rangers, Rogues, Monks and Berserkers get it automatically.", append: 'Rangers, Rogues, Monks and Berserkers get it automatically.', onPage: /berserker/i },
  { name: 'Point Blank Fire', source: GAME, tip: "The game's AA window lists it in a Monk combo's Archetype tab.", confirms: true },
  { name: 'Pottery Mastery', source: GAME, tip: "The game's AA window shows a fourth rank costing 20 points.", ranks: 4, cost: '2/4/6/20', append: POTTERY_4, onPage: /rank 4/i },
  ...raceRenames(AA_TABLE),
  ...classHotkeys(AA_TABLE),
  { name: 'Special AAs header', source: GAME, tip: "The game's AA window: the hotkeys share ability timer 90, refresh 2 minutes.", gapsOnly: true, header: { says: 'HK Share CoolDown on 90sec timer', should: 'the hotkeys share ability timer 90; each refreshes in 2 minutes (seen on Warrior, Monk, Shaman)', line: '! Name !! Ranks I !! Rank II !! Rank III !! Description !! HK (shared ability timer 90, refresh 2:00)' } },
  { name: 'Race Reincarnation: Drakkin', source: GAME, tip: 'The game lists Race Reincarnation: Drakkin with three ranks; the wiki lacks it.', add: specialRace('Drakkin') },
  { name: 'Race Reincarnation: Race 18', source: GAME, tip: 'The game lists Race 18, a placeholder name, with no description yet.', add: specialRace('Race 18'), gapsOnly: true }
]

export const AA_CORRECTIONS: readonly AaCorrection[] = ENTRIES

/** The row a correction is about, matched by name (and class when it names one). */
export function correctionTarget<R extends AaTableRow>(rows: readonly R[], c: AaCorrection): R | undefined {
  return rows.find((r) => aaFold(r.name) === aaFold(c.name) && (c.class === undefined || r.class === c.class))
}

/** The Description with words added before its `Requirements:`, or at its end. */
function withText(text: string, add: string): string {
  const at = text.search(/\s*Requirements:/)
  if (at < 0) return text === '' ? add : `${text} ${add}`
  return `${text.slice(0, at)} ${add}${text.slice(at)}`
}

type FieldChange = (row: AaRow, c: AaCorrection) => Partial<AaRow> | null

/** A rank count raised, a Special row's rank cells padded with `?` to match. */
const ranksTo = (row: AaRow, ranks: number): Partial<AaRow> =>
  row.values === undefined ? { ranks } : { ranks, values: Array.from({ length: ranks }, (_, i) => row.values?.[i] ?? '?') }

/** Each field a correction can change: its new values, or null when the row already holds them. */
const FIELD_CHANGES: readonly (readonly [AaField, FieldChange])[] = [
  ['name', (row, c) => (c.rename !== undefined && row.name !== c.rename ? { name: c.rename } : null)],
  ['ranks', (row, c) => (c.ranks !== undefined && row.ranks < c.ranks ? ranksTo(row, c.ranks) : null)],
  ['cost', (row, c) => (c.cost !== undefined && row.cost !== c.cost ? { cost: c.cost } : null)],
  ['text', (row, c) => (c.append !== undefined && c.onPage?.test(row.text) !== true ? { text: withText(row.text, c.append) } : null)],
  ['hk', (row, c) => (c.hkNote !== undefined && c.onPage?.test(row.hk ?? '') !== true ? { hk: row.hk === undefined ? c.hkNote : `${row.hk}. ${c.hkNote}` } : null)]
]

/** Whether the row already says what the correction says (the wiki caught up), so it changes nothing. */
export function correctionAgrees(row: AaTableRow, c: AaCorrection): boolean {
  return FIELD_CHANGES.every(([, change]) => change(row, c) === null) && (c.removed !== true || /\bremoved\b/i.test(row.text))
}

/** The fields a correction changes on this row, with their new values. */
function changes(row: AaRow, c: AaCorrection, removedDate: string): [AaField, Partial<AaRow>][] {
  const out = FIELD_CHANGES.flatMap(([field, change]): [AaField, Partial<AaRow>][] => {
    const v = change(row, c)
    return v === null ? [] : [[field, v]]
  })
  return c.removed === true ? [...out, ['removed', { removed: removedDate }]] : out
}

/** One row with one correction applied, each changed field marked. A row the change already holds stays. */
export function withCorrection(row: AaRow, c: AaCorrection, removedDate = c.source.date): AaRow {
  const done = changes(row, c, removedDate)
  if (done.length === 0) return row
  const marks = [...(row.marks ?? []), ...done.map(([field]) => ({ field, tip: c.tip, date: c.source.date }))]
  return Object.assign({}, row, ...done.map(([, v]) => v), { marks }) as AaRow
}

/** Where a new row goes: before the first row of its table whose name sorts after it, else after its table's last. */
function insertAt(rows: readonly AaRow[], add: AaTableRow): number {
  const same = (r: AaRow): boolean => r.section === add.section && r.class === add.class
  const after = rows.findIndex((r) => same(r) && r.name.localeCompare(add.name) > 0)
  if (after >= 0) return after
  let last = -1
  rows.forEach((r, i) => {
    if (same(r)) last = i
  })
  return last < 0 ? rows.length : last + 1
}

/** The table with every correction applied, for the tab. A removed row stays, marked, out of the points. */
export function applyAaCorrections(table: readonly AaTableRow[] = AA_TABLE, corrections: readonly AaCorrection[] = AA_CORRECTIONS): AaRow[] {
  const rows: AaRow[] = table.map((r) => ({ ...r }))
  for (const c of corrections) {
    if (c.confirms === true || c.gapsOnly === true) continue
    const hit = correctionTarget(rows, c)
    if (c.add !== undefined) {
      if (hit === undefined) rows.splice(insertAt(rows, c.add), 0, { ...c.add, marks: [{ field: 'row', tip: c.tip, date: c.source.date }] })
      continue
    }
    if (hit !== undefined) rows[rows.indexOf(hit)] = withCorrection(hit, c)
  }
  return rows
}

/** The AA table every reader uses: the wiki's, corrected by the game. */
export const AA_ROWS: readonly AaRow[] = applyAaCorrections()

/** The marks on one field of a row. */
export function aaMarks(row: AaRow, field: AaField): AaMark[] {
  return (row.marks ?? []).filter((m) => m.field === field)
}

/** One tooltip for a field's marks: the one sentence, or the span of the notes behind several. */
export function aaMarkTip(marks: readonly AaMark[]): string {
  if (marks.length <= 1) return marks[0]?.tip ?? ''
  const dates = marks.map((m) => m.date).sort()
  return `Daybreak's notes from ${dates[0]} to ${dates[dates.length - 1]} changed this, ${String(marks.length)} times.`
}
