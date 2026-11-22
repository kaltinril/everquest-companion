// PLAIN-TEXT SERIALIZATION of what the combat panel is currently showing — the "copy this
// view" feature. Pure and MUI-free (node-testable exactly like dashboardData.ts), so the
// golden tests assert EXACT output strings: the strings ARE the spec.
//
// What it is for: pasting a breakdown into guild chat / Discord. That is the whole reason for
// every constraint here —
//   - NO markdown (no **bold**, no | tables, no ``` fences): the app must not decide how the
//     destination renders it, and half of these destinations render markdown as literal text.
//   - No box drawing beyond spaces, '-' and the app's own '·' separator.
//   - Lines stay within MAX_WIDTH so a chat client's own wrapping never shreds a table.
//   - Numbers go through the app's ONE formatter (lib/formatRate), so a pasted total reads
//     '3.6k' exactly like the meter it came from.
//   - HONESTY (world-model laws 1 + 5): every value the source data flags as ESTIMATED keeps
//     its '~' prefix and the block carries a footer saying what '~' means. Observed maxima are
//     never prefixed — they are lower bounds, not scaled estimates (see dashboardData's header)
//     — and a column is NEVER emitted for data the segment doesn't have.
//
// There are FIVE views to serialize, one per drill level the user can be looking at:
//   level 1  formatSegmentText  — the ranked source meter (outgoing or incoming)
//   level 2  formatEntityText   — one source's flat skill list (pets nested, per the pref);
//            formatDrillText    — the same block under the header the panel prints over it
//   level 2  formatTargetText   — everything you+pet landed on one mob
//   panel    formatMobsText     — the Damage-by-mob card's ranked rows
//   panel    formatProcsText    — the Procs cell's ranked name/PPM/count list. Lives in
//                                 procsCopy.ts and is re-exported below, so every existing
//                                 importer is unaffected.
// The layout primitives every block shares live in copyTable.ts.

import type { SegmentView, SourceView } from '@shared/combat'
import { flattenSkills, type MobBreakdown, type SkillRow, type TargetDetail } from './dashboardData'
import { defenseHeadlineParts, defenseRowText, defenseRows, riposteLine, ripostesTakenLine } from './defenseRows'
import { landEvidence } from './landEvidence'
import { nestedRows, type OwnRow } from './petRows'
import { RANK, count, fmtDur, pctText, statLines, subjectLine, table, wrapText, type Col } from './copyTable'
import { headlineClockSec } from './headlineClock'
import { formatNum, formatRate } from '../../lib/formatRate'

// The width constant and the `m:ss` spelling keep their old import path: combatShared.tsx
// re-exports `fmtDur` from HERE for every JSX surface, and the copy goldens import MAX_WIDTH.
export { MAX_WIDTH, fmtDur } from './copyTable'
// The Procs half, re-exported from its own module (see the header).
export { fmtElapsed, formatProcsText } from './procsCopy'

/**
 * Label for the aggregated slay row + its inline tag. Spelled literally for the same reason
 * dashboardData spells it literally: a VALUE import from '@shared/combat' would break the node
 * tests, which run without the renderer's `@shared` alias.
 */
const SLAY_LABEL = 'Slay Undead'

/** The footer that makes a '~' in the block above mean something to someone who wasn't here. */
const APPROX_NOTE = '~ = estimated: this fight kept only a sample of its events.'

/**
 * `Vebarn (pet)` — the text equivalent of the meter row's pet chip. When `selfLabel` is given
 * (the `eq.combat.selfMeterName` pref is on) the self row reads that label — `Drammin (You)` —
 * exactly as the on-screen meter does, so a paste matches the meter it came from.
 */
function sourceName(e: SourceView, selfLabel: string | null = null): string {
  if (e.kind === 'you' && selfLabel) return selfLabel
  return e.kind === 'pet' ? `${e.name} (pet)` : e.name
}

/**
 * A skill row's name with the category tag the UI's `SkillName` adds: a Slay Undead proc is
 * logged under its WEAPON verb, so 'Backstab' alone would read as a plain backstab row.
 */
function skillName(s: SkillRow): string {
  return s.category === 'slay' && s.name !== SLAY_LABEL ? `${s.name} · ${SLAY_LABEL}` : s.name
}

// ── Level 1: the ranked source meter ────────────────────────────────────────────────

/**
 * THE LEVEL-1 LIST AS THE PANEL IS SHOWING IT: the ranked rows after the meter scope and the pet
 * layout have had their say, and the headline figures over them (`SegmentPanel.headline`). The
 * paste prints these, so it cannot list a row the screen hides or headline a different total.
 */
export interface ShownSources {
  rows: SourceView[]
  total: number
  dps: number
  activeDps: number
}

/** The whole direction, unscoped: what a caller with no panel pastes. */
function wholeSegment(seg: SegmentView, mode: 'out' | 'in'): ShownSources {
  return mode === 'out'
    ? { rows: seg.entities, total: seg.outTotal, dps: seg.outDps, activeDps: seg.activeDps }
    : { rows: seg.incoming, total: seg.inTotal, dps: seg.inDps, activeDps: seg.inDps }
}

/**
 * ` over 0:50`: the time the headline rate was taken over, when it is not the fight's length the
 * subject line states. Under the You scope the rate is over your own clock, and the panel's header
 * prints that clock beside it (`headlineClockSec`, the same helper), so total, rate and time agree
 * in the paste as they do on screen.
 */
function ownClockNote(seg: SegmentView, mode: 'out' | 'in', shown: ShownSources): string {
  if (mode !== 'out') return ''
  const clock = fmtDur(headlineClockSec(shown.total, shown.dps, seg.durationSec))
  return clock === fmtDur(seg.durationSec) ? '' : ` over ${clock}`
}

/**
 * The header stat run: direction, total, dps. Active-time DPS rides along under exactly the
 * panel's condition (outgoing only, and only when the fight actually had idle gaps — otherwise
 * it is the same number twice), and so does the enemy-heal caveat.
 */
function segmentStats(seg: SegmentView, mode: 'out' | 'in', shown: ShownSources): string[] {
  const { total, dps, activeDps } = shown
  // The panel's two conditions (`ActiveDpsNote`): the fight had idle gaps, and the active rate is
  // above the headline. A headline over your own clock can already beat it.
  const gaps = mode === 'out' && seg.activeSec > 0 && seg.activeSec < seg.durationSec
  const act = gaps && activeDps > dps ? ` (act ${formatRate(activeDps)})` : ''
  const rate = `${formatRate(dps)}${ownClockNote(seg, mode, shown)}${act}`
  const stats = [`${mode === 'out' ? 'Outgoing' : 'Incoming'} damage`, formatNum(total), rate]
  if (mode === 'out' && seg.enemyHealTotal > 0) stats.push(`+${formatNum(seg.enemyHealTotal)} enemy heal`)
  return stats
}

/** The ranked source table. Optional columns appear only when some row HAS that data. */
function sourceTable(rows: SourceView[], mode: 'out' | 'in', selfLabel: string | null = null): string[] {
  const showCrit = rows.some((r) => r.crits > 0)
  const showHit = rows.some((r) => r.misses > 0)
  const showResist = rows.some((r) => r.resists > 0)
  const cols: Col[] = [
    { header: RANK, align: 'right' },
    { header: mode === 'out' ? 'Source' : 'Attacker', align: 'left' },
    { header: 'Total', align: 'right' },
    { header: 'DPS', align: 'right' }
  ]
  if (showCrit) cols.push({ header: 'Crit', align: 'right' })
  if (showHit) cols.push({ header: 'Hit', align: 'right' })
  if (showResist) cols.push({ header: 'Resist', align: 'right' })

  return table(
    cols,
    rows.map((e, i) => {
      const cells = [String(i + 1), sourceName(e, selfLabel), formatNum(e.total), formatRate(e.dps)]
      if (showCrit) cells.push(e.crits > 0 ? pctText(e.critPct) : '')
      // Same omission the meter row makes: hit% is only meaningful once a swing was avoided.
      if (showHit) cells.push(e.misses > 0 ? pctText(e.hitPct) : '')
      if (showResist) cells.push(e.resists > 0 ? pctText(e.resistPct) : '')
      return cells
    })
  )
}

/**
 * YOUR DEFENCE, exactly as the panel states it (JOS-354). Same three builders the panel uses
 * (`defenseRows.ts`), so the paste and the screen can never disagree about a rate, about which
 * outcomes are your own skills, or — since JOS-361 — about the ORDER the rows are ranked in.
 *
 * THE PANEL PUTS IT BEHIND A TAB NOW AND THE PASTE STILL CARRIES IT (JOS-361). The copy affordance
 * belongs to the card's header, above the tab strip, so it serializes the whole incoming direction
 * rather than whichever of the two tabs happens to be open; a clipboard that changed shape with a
 * tab click would make a paste depend on something the reader of the paste cannot see.
 */
function defenseHeader(seg: SegmentView): string[] {
  const d = seg.defense
  if (d.swings === 0) return []
  const notes = [riposteLine(d), ripostesTakenLine(d)].filter((l): l is string => l !== null)
  return [
    '',
    // Both runs go through the app's ' · ' packer, so a segment with every outcome present wraps
    // instead of handing the chat client the break point (copyTable.statLines' whole argument).
    ...statLines(['Your defence', ...defenseHeadlineParts(d)]),
    ...statLines(defenseRows(d).map(defenseRowText)),
    // The riposte notes are PROSE — the counter-swing's "already inside your melee total" caveat
    // is the honesty, so it wraps on words and is never summarised away.
    ...notes.flatMap((n) => wrapText(n))
  ]
}

/** The incoming view's healing footer, exactly as the panel appends it under the list. */
function healFooter(seg: SegmentView): string[] {
  if (seg.incomingHealTotal <= 0) return []
  const out = ['', `Heals received: ${formatNum(seg.incomingHealTotal)}`]
  for (const h of seg.incomingHealers.slice(0, 4)) out.push(`  ${h.name} · ${formatNum(h.total)} (${h.count})`)
  return out
}

/**
 * The meter as the user sees it at level 1: the panel's header line, then the ranked sources.
 * `mode` picks the same rows/total/dps the panel does, so an Incoming copy can never carry
 * outgoing numbers. Optional columns appear only when some row HAS that data — a fight with no
 * avoided swings has no Hit column at all, rather than a column of '100%'.
 *
 * `shown` is the panel's own list and headline (`ShownSources`). Without it the whole direction is
 * pasted, unscoped.
 */
export function formatSegmentText(
  seg: SegmentView,
  mode: 'out' | 'in',
  selfLabel: string | null = null,
  shown: ShownSources = wholeSegment(seg, mode)
): string {
  const rows = shown.rows
  const out: string[] = [subjectLine(null, seg), ...statLines(segmentStats(seg, mode, shown))]

  // The defence block rides ABOVE the rows in the Incoming direction — where the panel used to put
  // it, and where a linear paste still wants it (it is the summary; the table is the detail). It is
  // emitted even when nothing landed, because "37 swings, all of them avoided" is a segment worth
  // pasting and the row table below would be empty for it.
  if (mode === 'in') out.push(...defenseHeader(seg))

  if (rows.length === 0) {
    out.push(mode === 'out' ? 'No outgoing damage in this segment.' : 'No incoming damage in this segment.')
    return out.join('\n')
  }

  out.push('', ...sourceTable(rows, mode, selfLabel))
  if (mode === 'in') out.push(...healFooter(seg))
  return out.join('\n')
}

// ── Level 2a: one source's flat skill list ──────────────────────────────────────────

/**
 * The OPTIONAL columns a flat skill list needs, decided by the DATA and decided ONCE: a fight
 * with no avoided swings has no Miss column at all, rather than a column of blanks. Split out
 * of `skillTable` so a table that mixes skill rows with nested PET rows can share exactly the
 * same column set — two stacked tables would drift apart the moment a pet's total was wider
 * than any skill's.
 */
function skillCols(rows: SkillRow[]): Col[] {
  const cols: Col[] = [
    { header: 'Skill', align: 'left' },
    { header: 'Total', align: 'right' },
    { header: 'Hits', align: 'right' }
  ]
  if (rows.some((s) => s.hits > 0)) cols.push({ header: 'Avg', align: 'right' }, { header: 'Max', align: 'right' })
  if (rows.some((s) => s.crits > 0)) cols.push({ header: 'Crit', align: 'right' })
  if (rows.some((s) => (s.lands ?? 0) > 0)) cols.push({ header: 'Landed', align: 'right' })
  if (rows.some((s) => (s.misses ?? 0) > 0)) cols.push({ header: 'Miss', align: 'right' })
  if (rows.some((s) => (s.resists ?? 0) > 0)) cols.push({ header: 'Resist', align: 'right' })
  return cols
}

/**
 * One skill row's cells, in whatever column order `skillCols` produced. `a` is the estimate
 * prefix: it rides on every DERIVED number, and never on `Max` — an observed maximum is a lower
 * bound, not a scaled estimate, and prefixing it would claim it had been adjusted.
 */
function skillCells(s: SkillRow, cols: Col[], a: string): string[] {
  const misses = s.misses ?? 0
  const resists = s.resists ?? 0
  // Resist rate over ATTEMPTS — landings included, and an effect proc's landings are its emotes
  // (`landEvidence`, which owns the one case where the rate is withheld because the lane has no
  // landing evidence at all). Pasting `100%` for a Weakening Strike that landed 562 times was
  // the same defect the panel had.
  const land = landEvidence(s, a)
  const by = new Map<string, string>([
    ['Total', `${a}${formatNum(s.total)}`],
    ['Hits', `${a}${s.hits}`],
    ['Landed', (s.lands ?? 0) > 0 ? `${a}${s.lands}` : ''],
    ['Avg', s.hits > 0 ? `${a}${formatNum(Math.round(s.total / s.hits))}` : ''],
    ['Max', s.hits > 0 ? formatNum(s.max) : ''],
    ['Crit', s.crits > 0 ? pctText((s.crits / Math.max(1, s.hits)) * 100, a) : ''],
    // Same omission the meter row makes: a rate is only meaningful once something was avoided.
    ['Miss', misses > 0 ? pctText((misses / (s.hits + misses)) * 100, a) : ''],
    ['Resist', resists > 0 && land.resistPct !== undefined ? pctText(land.resistPct, a) : '']
  ])
  return cols.map((c, i) => (i === 0 ? skillName(s) : (by.get(c.header) ?? '')))
}

/** The flat skill list as a table — a source's list, or one mob's. */
function skillTable(rows: SkillRow[], a: string): string[] {
  const cols = skillCols(rows)
  return table(
    cols,
    rows.map((s) => skillCells(s, cols, a))
  )
}

/**
 * A NESTED PET row, as the panel draws it: one line item inside your breakdown, ranked among
 * your skill lanes, wearing the pet's real display name (law 4 — the label is never a coined
 * "Pet", and no point of pet damage is ever folded into a lane of yours).
 *
 * Total and Hits are the pet's own; every remaining skill column stays EMPTY rather than
 * borrowing a skill's meaning — a pet aggregate has no single biggest hit, and printing one
 * would invent an observation.
 */
function petCells(r: Extract<OwnRow, { kind: 'pet' }>, width: number): string[] {
  const cells = [`${r.pet.name} (pet)`, formatNum(r.pet.total), String(r.pet.hits)]
  while (cells.length < width) cells.push('')
  return cells
}

/** The flat list with pets nested in, as ONE table sharing ONE column set. */
function ownTable(rows: OwnRow[]): string[] {
  const cols = skillCols(rows.flatMap((r) => (r.kind === 'skill' ? [r.skill] : [])))
  return table(
    cols,
    rows.map((r) => (r.kind === 'pet' ? petCells(r, cols.length) : skillCells(r.skill, cols, '')))
  )
}

/**
 * Level 2, entity drill: one source's flat ranked skill list — the SAME list the panel shows
 * (`flattenSkills`, slay already grouped into one row), plus the melee-rounds footer when the
 * heuristic has anything to say. These numbers come from the engine's authoritative aggregate,
 * never from the event ring, so nothing here is ever estimated.
 *
 * `pets` are the pet sources NESTED into this list, exactly as the panel nests them while the
 * 'Combine pet into your damage' preference is on. Passing them is what closes the gap the
 * drill wave left: the panel showed the pet as a line item and the clipboard silently dropped
 * it, so a pasted "your breakdown" was missing a row the reader could see on screen.
 *
 * `selfLabel` relabels the self subject line — `Drammin (You)` — when the `eq.combat.selfMeterName`
 * pref is on, matching the meter at this drill level too.
 */
export function formatEntityText(
  seg: SegmentView,
  entity: SourceView,
  pets: SourceView[] = [],
  selfLabel: string | null = null
): string {
  return entityBlock(seg, entity, pets, { selfLabel, lead: [], stats: entityStats(entity) })
}

/** One source's own figures, the run under the subject line. */
function entityStats(entity: SourceView): string[] {
  const stats = [formatNum(entity.total), formatRate(entity.dps), `${entity.hits} hits`]
  if (entity.crits > 0) stats.push(`${Math.round(entity.critPct)}% crit`)
  if (entity.misses > 0) stats.push(`${Math.round(entity.hitPct)}% hit`)
  if (entity.resists > 0) stats.push(`${Math.round(entity.resistPct)}% resist`)
  return stats
}

/**
 * THE DRILLED VIEW AS THE PANEL SHOWS IT. With a pet nested in, the panel's header is the subject
 * plus that pet (`petRows.panelTotals`) and the table holds the pet's row, so the paste states that
 * figure first and then names whose the hits and rates beneath it are. With no pet nested the two
 * are one number and the block is `formatEntityText`'s.
 */
export function formatDrillText(
  seg: SegmentView,
  entity: SourceView,
  pets: SourceView[],
  shown: { selfLabel: string | null; total: number; dps: number }
): string {
  const { selfLabel } = shown
  if (pets.length === 0) return formatEntityText(seg, entity, pets, selfLabel)
  const who = pets.length > 1 ? 'With pets' : 'With pet'
  const lead = statLines([who, formatNum(shown.total), formatRate(shown.dps)])
  return entityBlock(seg, entity, pets, { selfLabel, lead, stats: [sourceName(entity, selfLabel), ...entityStats(entity)] })
}

/** The drilled block: subject line, any lead line, the stat run, then the one table. */
function entityBlock(
  seg: SegmentView,
  entity: SourceView,
  pets: SourceView[],
  head: { selfLabel: string | null; lead: string[]; stats: string[] }
): string {
  const rows = pets.length > 0 ? nestedRows(entity, pets) : null
  const skills = flattenSkills(entity)
  const out = [subjectLine(sourceName(entity, head.selfLabel), seg), ...head.lead, ...statLines(head.stats)]
  if (skills.length === 0 && !rows) {
    out.push('No skill breakdown for this source.')
    return out.join('\n')
  }
  out.push('', ...(rows ? ownTable(rows) : skillTable(skills, '')), ...roundsFooter(entity.rounds))
  return out.join('\n')
}

/** The melee-rounds footer, appended only when the multi-hit heuristic has something to say. */
function roundsFooter(r: SourceView['rounds']): string[] {
  if (!r || (r.multiHitRounds === 0 && r.maxHitsInRound <= 1)) return []
  return [
    '',
    `Melee rounds: ${r.totalRounds} · avg ${r.avgHitsPerRound.toFixed(2)} hits/round · ${r.multiHitRounds} multi-hit · up to ${r.maxHitsInRound}/round`
  ]
}

// ── Level 2b: everything you + pet landed on ONE mob ────────────────────────────────

/**
 * Level 2, mob drill. Derived from the encounter's event ring, so the whole block wears the
 * `~` treatment whenever that ring was downsampled and/or truncated — including the footer that
 * says what `~` means. The "you + pet combined" line is not decoration: this list answers what
 * killed the mob, not who, and the panel says so too.
 */
export function formatTargetText(seg: SegmentView, target: string, detail: TargetDetail): string {
  const a = detail.estimated ? '~' : ''
  const share = seg.outTotal > 0 ? (detail.total / seg.outTotal) * 100 : 0
  const stats = [`${a}${formatNum(detail.total)}`, `${Math.round(share)}% of outgoing`, `${a}${detail.hits} hits`]
  if (detail.crits > 0) stats.push(`${a}${detail.crits} crit`)
  if (detail.misses > 0) stats.push(`${a}${detail.misses} avoided`)
  if (detail.resists > 0) stats.push(`${a}${detail.resists} resisted`)

  const out = [subjectLine(`Damage to ${target}`, seg), ...statLines(stats), 'you + pet combined']
  if (detail.rows.length === 0) {
    out.push('Nothing landed on this mob in the selected segment.')
    return out.join('\n')
  }
  out.push('', ...skillTable(detail.rows, a))
  if (detail.estimated) out.push('', APPROX_NOTE)
  return out.join('\n')
}

// ── The Damage-by-mob card ──────────────────────────────────────────────────────────

/**
 * The mob card's ranked rows. `limit` is the card's own row cap, so the paste is what the user
 * is LOOKING at; the rows the card left off are acknowledged rather than silently dropped.
 * Counts here are event-derived (hence `~` when the ring was inexact); `Share` is a ratio of
 * two estimates and is left unprefixed, exactly as the card renders it.
 */
export function formatMobsText(seg: SegmentView, mobs: MobBreakdown, limit?: number): string {
  const a = mobs.estimated ? '~' : ''
  const shown = limit != null ? mobs.rows.slice(0, limit) : mobs.rows
  const out = [subjectLine('Damage by mob', seg), `${count(mobs.rows.length, 'mob')} · ${a}${formatNum(mobs.total)}`]
  if (shown.length === 0) {
    out.push('Nothing landed on anything yet.')
    return out.join('\n')
  }

  const showCrit = shown.some((m) => m.crits > 0)
  const showMiss = shown.some((m) => m.misses > 0)
  const showResist = shown.some((m) => m.resists > 0)
  const cols: Col[] = [
    { header: RANK, align: 'right' },
    { header: 'Mob', align: 'left' },
    { header: 'Total', align: 'right' },
    { header: 'Share', align: 'right' },
    { header: 'Hits', align: 'right' }
  ]
  if (showCrit) cols.push({ header: 'Crit', align: 'right' })
  if (showMiss) cols.push({ header: 'Avoided', align: 'right' })
  if (showResist) cols.push({ header: 'Resist', align: 'right' })

  out.push(
    '',
    ...table(
      cols,
      shown.map((m, i) => {
        const cells = [String(i + 1), m.target, `${a}${formatNum(m.total)}`, `${Math.round(m.share)}%`, `${a}${m.hits}`]
        if (showCrit) cells.push(m.crits > 0 ? `${a}${m.crits}` : '')
        if (showMiss) cells.push(m.misses > 0 ? `${a}${m.misses}` : '')
        if (showResist) cells.push(m.resists > 0 ? `${a}${m.resists}` : '')
        return cells
      })
    )
  )
  if (mobs.rows.length > shown.length) out.push(`+${mobs.rows.length - shown.length} more not shown`)
  if (mobs.estimated) out.push('', APPROX_NOTE)
  return out.join('\n')
}
