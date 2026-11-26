// shared/gapAas.ts — Wiki Gaps' AAs tab (owner, 2026-11-25: "missing AA's from the wiki should be
// documented on the wiki gaps as a tab"): each AA the game states otherwise than the wiki's
// Alternate Advancement page. The game first: the log's purchase lines, then the corrections of
// shared/aaOfficial.ts (Daybreak's notes, the game's AA window). Pure; the app asks the wiki nothing.
//
// One row per AA, named as the game names it, holding every difference: a row the page lacks, a
// name it spells otherwise, a rank count below the log's or the notes', a cost, a Description line,
// a removal. Each says what the page says, what it should say and the evidence; Copy gives the row
// as the page's table writes it (`| Name || Ranks || Cost || Description`). A correction the page
// already holds is no row (the wiki marks Valiant and Abyssal Steed removed already).

import type { GapKind, GapRow } from './gaps'
import { AA_TABLE, type AaSection, type AaTableRow } from './aaTable.generated'
import { AA_CORRECTIONS, correctionAgrees, correctionTarget, withCorrection, type AaCorrection, type AaField, type AaRow, type AaSource } from './aaOfficial'
import { aaFold, aaLogAas, aaLogMatch, type LogAa } from './aaLogMatch'
import { aaLedger, type AaAbilityRow } from './aaLedger'
import { aaKey } from './aaRanks'
import type { AASpendLike } from './aa'

/** The wiki page every AAs row is about. */
export const AA_PAGE = 'Alternate Advancement'

export interface AaIssue {
  field: AaField
  says: string
  should: string
  evidence: string[]
}

export interface AaFix {
  /** The table the row belongs in; null for a log AA whose table the log does not say. */
  section: AaSection | null
  class?: string
  /** The page's own name for the row; null when the page has no row. */
  wikiName: string | null
  issues: AaIssue[]
  /** The row as the page should write it, in its table's layout. */
  wikitext: string
  /** A placeholder name the game lists (`Race Reincarnation: Race 18`). */
  placeholder?: true
  /** Not a row: a table's header line (the Special AAs' hotkey column). */
  header?: true
}

interface Acc {
  page: AaTableRow | undefined
  fixed: AaRow
  section: AaSection | null
  issues: AaIssue[]
  kinds: Set<GapKind>
  dates: string[]
  log?: AaAbilityRow
  placeholder?: true
  /** A header entry's line, in place of a row's. */
  line?: string
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`
const day = (ts: number): string => stamp(ts).slice(0, 10)

/** A log instant as the log prints it, local time. */
function stamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** A correction's source in words, with its URL. */
export function sourceText(s: AaSource): string {
  return s.by === 'notes' ? `Daybreak's ${s.date} notes: ${s.where}` : `${s.where}, ${s.date}`
}

/** The table a row goes in, as its heading names it. */
export function aaTableName(section: AaSection | null, cls?: string): string {
  if (section === null) return 'its table (General, Archetype or a class)'
  if (section === 'class') return `${cls ?? ''} Class AAs`
  return `${section.charAt(0).toUpperCase()}${section.slice(1)} AAs`
}

/** The row's line in the page's table: four cells, a Special row's rank cells, a removed row struck. */
export function aaRowWikitext(row: AaRow, isNew: boolean): string {
  const lead = isNew ? '|-\n' : ''
  if (row.section === 'special') return `${lead}| ${[row.name, ...(row.values ?? []), row.text, ...(row.hk === undefined ? [] : [row.hk])].join(' || ')}`
  if (row.removed !== undefined) return `${lead}| <s>${row.name}</s> || ${String(row.ranks)} || ${row.cost} || <s>${row.text}</s> This AA has been removed.`
  return `${lead}| ${row.name} || ${String(row.ranks)} || ${row.cost} || ${row.text}`
}

const said = (row: AaTableRow, field: AaField): string =>
  ({ row: 'no row', name: row.name, ranks: plural(row.ranks, 'rank'), cost: `cost ${row.cost}`, text: 'a Description without it', hk: 'a hotkey cell without it', removed: 'the AA as current', header: 'the header' })[field]

/** What the corrected row should say of one field. */
function should(row: AaRow, field: AaField, c?: AaCorrection): string {
  if (field === 'row') return `a ${aaTableName(row.section, row.class)} row: ${plural(row.ranks, 'rank')}${row.cost === '' ? '' : `, cost ${row.cost}`}`
  if (field === 'name') return row.name
  if (field === 'ranks') return plural(row.ranks, 'rank')
  if (field === 'cost') return `cost ${row.cost}`
  if (field === 'text') return `the Description adds "${c?.append ?? ''}"`
  if (field === 'hk') return `the hotkey cell adds "${c?.hkNote ?? ''}"`
  return 'the AA marked removed'
}

/** The issue for a field, made once; a second source of the same change adds its evidence. */
function issueOf(acc: Acc, field: AaField, says: string, shouldSay: string): AaIssue {
  const hit = acc.issues.find((i) => i.field === field && (field !== 'text' || i.should === shouldSay))
  if (hit !== undefined) return hit
  const made: AaIssue = { field, says, should: shouldSay, evidence: [] }
  acc.issues.push(made)
  return made
}

/** One piece of evidence: its words, the kind of source, and its date ('' for a log line, dated by the ledger). */
interface Evidence {
  text: string
  kind: GapKind
  date: string
}

function note(acc: Acc, issue: AaIssue, ev: Evidence): void {
  if (!issue.evidence.includes(ev.text)) issue.evidence.push(ev.text)
  acc.kinds.add(ev.kind)
  if (ev.date !== '') acc.dates.push(ev.date)
}

const rowKey = (row: AaTableRow): string => `${row.class ?? row.section}|${aaFold(row.name)}`
const sourceEvidence = (c: AaCorrection): Evidence => ({ text: sourceText(c.source), kind: c.source.by === 'notes' ? 'announced' : 'listed', date: c.source.date })

/** The log's evidence for an AA it names: the rank it states, and when. */
function logged(acc: Acc, hit: LogAa, ledger: AaAbilityRow | undefined): Evidence {
  acc.log = ledger
  const at = ledger?.ranks.find((r) => r.rank === hit.rank)?.ts ?? ledger?.lastTs
  return { text: `Your log: ${hit.name} rank ${String(hit.rank)}${at === undefined ? '' : `, ${day(at)}`}`, kind: 'trained', date: '' }
}

class Builder {
  readonly accs = new Map<string, Acc>()
  constructor(readonly table: readonly AaTableRow[]) {}

  /** The entry for a page row, made on first use. */
  accOf(row: AaTableRow): Acc {
    const key = rowKey(row)
    const had = this.accs.get(key)
    if (had !== undefined) return had
    const acc: Acc = { page: row, fixed: { ...row }, section: row.section, issues: [], kinds: new Set(), dates: [] }
    this.accs.set(key, acc)
    return acc
  }

  /** The entry for a row the page lacks, by its name. */
  newAcc(row: AaTableRow, section: AaSection | null): Acc {
    const key = `new|${aaFold(row.name)}`
    const had = this.accs.get(key)
    if (had !== undefined) return had
    const acc: Acc = { page: undefined, fixed: { ...row }, section, issues: [], kinds: new Set(), dates: [] }
    this.accs.set(key, acc)
    return acc
  }

  correct(c: AaCorrection): void {
    // A tab-only note: the Special header's row says it once for every class row.
    if (c.tabOnly === true) return
    if (c.header !== undefined) {
      this.headerRow(c, c.header)
      return
    }
    if (c.confirms === true) {
      this.confirm(c)
      return
    }
    if (c.add !== undefined) {
      if (correctionTarget(this.table, c) !== undefined) return
      const acc = this.newAcc(c.add, c.add.section)
      if (c.gapsOnly === true) acc.placeholder = true
      note(acc, issueOf(acc, 'row', 'no row', should(acc.fixed, 'row')), sourceEvidence(c))
      return
    }
    const target = correctionTarget(this.table, c)
    if (target === undefined) return
    if (correctionAgrees(target, c)) return
    const acc = this.accOf(target)
    const before = acc.fixed.marks?.length ?? 0
    acc.fixed = withCorrection(acc.fixed, c)
    for (const m of (acc.fixed.marks ?? []).slice(before)) note(acc, issueOf(acc, m.field, said(target, m.field), should(acc.fixed, m.field, c)), sourceEvidence(c))
  }

  /** A table header line the game states otherwise: one row, its Copy the line itself. */
  headerRow(c: AaCorrection, h: { says: string; should: string; line: string }): void {
    const acc = this.newAcc({ section: 'special', name: c.name, ranks: 0, cost: '', text: '' }, 'special')
    acc.line = h.line
    note(acc, issueOf(acc, 'header', h.says, h.should), sourceEvidence(c))
  }

  /** A second source for a row another entry corrects or adds: its evidence on every issue the row has. */
  confirm(c: AaCorrection): void {
    const target = correctionTarget(this.table, c)
    const acc = this.accs.get(target === undefined ? `new|${aaFold(c.name)}` : rowKey(target))
    if (acc !== undefined) for (const i of acc.issues) note(acc, i, sourceEvidence(c))
  }

  /** A log AA on a page row: its name and rank against the page's, after the corrections. */
  fromLog(row: AaTableRow, hit: LogAa, ledger: AaAbilityRow | undefined): void {
    const known = this.accs.get(rowKey(row))
    const fixed = known?.fixed ?? row
    const has = (field: AaField): boolean => known?.issues.some((i) => i.field === field) === true
    const renamed = aaFold(fixed.name) !== aaFold(hit.name) && aaFold(aaKey(fixed)) !== aaFold(hit.name)
    const above = hit.rank > fixed.ranks && row.section !== 'special'
    const named = renamed || has('name')
    const ranked = above || (has('ranks') && hit.rank >= fixed.ranks)
    if (named || ranked) this.logFix(row, hit, ledger, { renamed, above, named, ranked })
  }

  /** The log's evidence on a page row's name and ranks issues, the row fixed to what the log states. */
  logFix(row: AaTableRow, hit: LogAa, ledger: AaAbilityRow | undefined, d: { renamed: boolean; above: boolean; named: boolean; ranked: boolean }): void {
    const { renamed, above, named, ranked } = d
    const acc = this.accOf(row)
    const ev = logged(acc, hit, ledger)
    if (renamed) acc.fixed = { ...acc.fixed, name: hit.name }
    if (named) note(acc, issueOf(acc, 'name', row.name, acc.fixed.name), ev)
    if (above) acc.fixed = { ...acc.fixed, ranks: hit.rank, cost: withLogCosts(acc.fixed, hit.rank, ledger) }
    if (ranked) note(acc, issueOf(acc, 'ranks', plural(row.ranks, 'rank'), `${plural(acc.fixed.ranks, 'rank')}, cost ${acc.fixed.cost}`), ev)
  }

  /** A log AA no page row answers to. */
  unplaced(hit: LogAa, ledger: AaAbilityRow | undefined): void {
    const cost = withLogCosts({ section: 'general', name: hit.name, ranks: 0, cost: '', text: '' }, hit.rank, ledger)
    const acc = this.accs.get(`new|${aaFold(hit.name)}`) ?? this.newAcc({ section: 'general', name: hit.name, ranks: hit.rank, cost, text: '' }, null)
    const issue = acc.issues.find((i) => i.field === 'row') ?? issueOf(acc, 'row', 'no row', `a row: ${plural(hit.rank, 'rank')}, cost ${cost}`)
    note(acc, issue, logged(acc, hit, ledger))
  }
}

/** The Cost cell carried to `ranks` ranks with the log's costs, `?` for a rank the log has no line for. */
function withLogCosts(row: AaTableRow, ranks: number, ledger: AaAbilityRow | undefined): string {
  const parts = row.cost === '' ? [] : row.cost.split('/').map((p) => p.trim())
  if (/for all ranks/i.test(row.cost) || (parts.length === 1 && row.ranks > 1)) return row.cost
  for (let r = parts.length + 1; r <= ranks; r++) parts.push(String(ledger?.ranks.find((x) => x.rank === r)?.cost ?? '?'))
  return parts.join('/')
}

function gapRowOf(acc: Acc): GapRow {
  const lines = acc.issues.map((i) => `Page: ${i.says}. Should be: ${i.should}. Evidence: ${i.evidence.join('; ')}.`)
  const ts = acc.log === undefined ? [] : acc.log.ranks.map((r) => stamp(r.ts))
  const when = [...acc.dates, ...ts].sort()
  const fix: AaFix = {
    section: acc.section,
    ...(acc.fixed.class === undefined ? {} : { class: acc.fixed.class }),
    wikiName: acc.page?.name ?? null,
    issues: acc.issues,
    wikitext: acc.line ?? aaRowWikitext(acc.fixed, acc.page === undefined),
    ...(acc.placeholder === true ? { placeholder: true as const } : {}),
    ...(acc.line === undefined ? {} : { header: true as const })
  }
  const count = acc.log === undefined ? acc.issues.reduce((n, i) => n + i.evidence.length, 0) : acc.log.ranks.reduce((n, r) => n + r.buys, 0)
  return { domain: 'aa', name: acc.fixed.name, kinds: [...acc.kinds], count, first: when[0] ?? '', last: when[when.length - 1] ?? '', details: { samples: lines }, page: AA_PAGE, aaFix: fix }
}

/**
 * The AAs rows: the corrections the page lacks, then what the log states otherwise. A race's rank
 * is left out: its line states none (shared/aaLogMatch.ts counts reincarnations instead).
 */
export function aaGapRows(spends: readonly AASpendLike[], table: readonly AaTableRow[] = AA_TABLE, corrections: readonly AaCorrection[] = AA_CORRECTIONS): GapRow[] {
  const b = new Builder(table)
  for (const c of corrections) b.correct(c)
  const ledger = new Map(aaLedger(spends).map((r) => [aaFold(r.name), r]))
  const log = aaLogAas(spends)
  const match = aaLogMatch(log, table, aaKey)
  for (const row of table) {
    const hit = match.byRow.get(aaFold(row.name))
    if (hit !== undefined) b.fromLog(row, hit, ledger.get(aaFold(hit.name)))
  }
  for (const hit of match.unplaced) b.unplaced(hit, ledger.get(aaFold(hit.name)))
  return [...b.accs.values()].filter((a) => a.issues.length > 0).map(gapRowOf)
}

/** A row's Copy: its line for the AA page's table. */
export function aaFixText(row: Pick<GapRow, 'aaFix' | 'name'>): string {
  return `${row.aaFix?.wikitext ?? `| ${row.name} || ? || ? || `}\n`
}

/** The chip's words: which table and row, and what it should say. */
export function aaFixWhy(fix: AaFix): string {
  const table = aaTableName(fix.section, fix.class)
  const where = fix.header === true ? `The ${table} table header` : fix.wikiName === null ? `The ${table} table lacks it` : `${table}, row ${fix.wikiName}`
  const what = fix.issues.map((i) => `${i.should} (page: ${i.says})`).join('; ')
  return `${where}: ${what}.${fix.placeholder === true ? ' The game lists a placeholder name: check before adding it.' : ''}`
}
