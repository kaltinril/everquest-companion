// aaEffects.ts — an AA's effect in a few words, per rank: "Melee crit chance +5%" (owner, 2026-11-25,
// the redesigned Alt. Advancement tab). Pure: a table row in, short text out.
//
// THE NUMBERS come from shared/aaEffectTable.ts where it states them, else from the row's own text:
// the first slash list ("by 2/5/10%", one number a rank), or "N per rank". A list whose length is not
// the row's rank count is not guessed at: the row then shows its label alone, never "none". A Special
// row reads its own rank cells. The sign is the text's last verb before the numbers ("reduces" is -).

import type { AaTableRow } from './aaTable.generated'
import { AA_EFFECT_DEFS, type AaEffectDef, type AaGroup } from './aaEffectTable'

export interface AaEffect {
  group: AaGroup
  label: string
  /** One shown value a rank ("+5%", "-10 s", "?"); null when the AA has no number to show. */
  values: string[] | null
}

const LIST = /(?:\d+(?:\.\d+)?%?|\?)(?:\s*\/\s*(?:\d+(?:\.\d+)?%?|\?))+%?/
const PER_RANK = /(\d+(?:\.\d+)?)(%?)\s*(?:points?\s*)?(?:chance\s*)?\(?per rank\)?/i
const VERB = /\b(reduc\w*|lower\w*|decreas\w*|increas\w*|improv\w*|raise\w*|extend\w*|additional)\b/gi
const ACTIVATION = /^Ability Activation ID:[^.]*\.\s*/i
const MAX_LABEL = 44

/** The description without its activation prefix and requirements: where the numbers are read. */
export function aaEffectBody(text: string): string {
  const body = text.replace(ACTIVATION, '')
  const cut = body.search(/Requirements:|\bRequires\b/)
  return (cut < 0 ? body : body.slice(0, cut)).trim()
}

/** '-' when the last verb before `at` lowers something, '+' when it raises one, '' when neither. */
function signBefore(text: string, at: number): string {
  const verbs = [...text.slice(0, at).matchAll(VERB)]
  const last = verbs.length === 0 ? '' : verbs[verbs.length - 1][1].toLowerCase()
  if (last === '') return ''
  return /^(reduc|lower|decreas)/.test(last) ? '-' : '+'
}

const shown = (token: string, sign: string, unit: string): string => (token === '?' ? '?' : `${sign}${token}${unit}`)

/** The per-rank values the text states, or null when it states none that fit the rank count. */
function valuesFromText(row: AaTableRow): string[] | null {
  const body = aaEffectBody(row.text)
  const list = LIST.exec(body)
  if (list !== null) {
    const tokens = list[0].split('/').map((t) => t.trim().replace('%', ''))
    if (tokens.length !== row.ranks) return null
    const after = body.slice(list.index + list[0].length)
    const unit = list[0].includes('%') ? '%' : /^\s*second/i.test(after) ? ' s' : ''
    const sign = signBefore(body, list.index)
    return tokens.map((t) => shown(t, sign, unit))
  }
  const per = PER_RANK.exec(body)
  if (per === null || row.ranks < 2) return null
  const sign = signBefore(body, per.index) || '+'
  const step = Number(per[1])
  return Array.from({ length: row.ranks }, (_, i) => shown(String(Math.round(step * (i + 1) * 100) / 100), sign, per[2]))
}

/** A Special row's rank cells, signed and given the text's unit where the cell is a bare number. */
function specialValues(row: AaTableRow): string[] | null {
  if (row.values === undefined || row.values.length === 0) return null
  const sign = signBefore(row.text, row.text.length)
  const unit = /\d%/.test(row.text) ? '%' : ''
  return row.values.map((v) => {
    const t = v.trim()
    if (/[a-z]/i.test(t.replace('%', '')) || /^[-+]/.test(t)) return t
    return shown(t.replace('%', ''), sign, t.includes('%') ? '%' : unit)
  })
}

/** The table's own values: "on" for none, else one per rank (one value holds for every rank). */
function valuesFromDef(def: AaEffectDef, ranks: number): string[] | null {
  const raw = def[2]
  if (raw === undefined || raw === 'on') return null
  const unit = def[3] ?? ''
  const tokens = raw.split('/').map((t) => t.trim())
  const each = tokens.length === 1 ? Array.from({ length: Math.max(1, ranks) }, () => tokens[0]) : tokens
  return each.map((t) => (t === '?' || /[a-z]/i.test(t) ? t : `${t}${unit}`))
}

/** What the text says a row requires (after its last "Requirements:"), or null. */
export function aaRequirementText(text: string): string | null {
  const at = text.lastIndexOf('Requirements:')
  if (at < 0) return null
  const req = text.slice(at + 'Requirements:'.length).trim().replace(/\.$/, '')
  return req === '' ? null : req
}

/** The first words of the text, for an AA the table does not know. */
export function aaFallbackLabel(row: AaTableRow): string {
  const body = aaEffectBody(row.text)
    .replace(/^This (passive|toggleable)? ?ability(, when activated,)?\s*/i, '')
    .replace(/^[A-Z][\w' ]+ I, (which )?when activated,\s*/, '')
  const first = body.split(/[.;,]/)[0].trim()
  if (first === '') return row.text === '' ? 'No description yet' : row.name
  const label = first.charAt(0).toUpperCase() + first.slice(1)
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…` : label
}

/** What a row does: its group, its label, and a value a rank where it has numbers. */
export function aaEffect(row: AaTableRow): AaEffect {
  const def = AA_EFFECT_DEFS[row.name]
  const values = def?.[2] !== undefined ? valuesFromDef(def, row.ranks) : row.section === 'special' ? specialValues(row) : valuesFromText(row)
  return { group: def?.[0] ?? 'utility', label: def?.[1] ?? aaFallbackLabel(row), values }
}

/** The value at a rank (1-based), or null for rank 0, a rank past the list, or an AA with no numbers. */
export function aaEffectValue(effect: AaEffect, rank: number): string | null {
  if (effect.values === null || rank < 1) return null
  return effect.values[rank - 1] ?? null
}

/** The `which`-th number in a shown value ("+2 HP Gen +5 AC", 1 is 5); null when it has none. */
export function aaEffectNumber(value: string | null, which = 0): number | null {
  if (value === null) return null
  const nums = value.match(/[-+]?\d+(?:\.\d+)?/g)
  const n = nums?.[which]
  return n === undefined ? null : Number(n)
}

export interface AaEffectLine {
  label: string
  /** The value held; null at rank 0 or with no numbers. */
  now: string | null
  /** At rank 0, what rank 1 gives (never "none"). */
  first: string | null
  /** What the next rank gives, below the top rank. */
  next: string | null
}

/** The short effect a row shows at a rank, with rank 1's value for an AA not started. */
export function aaEffectLine(effect: AaEffect, rank: number, max: number): AaEffectLine {
  return {
    label: effect.label,
    now: aaEffectValue(effect, rank),
    first: rank === 0 ? aaEffectValue(effect, 1) : null,
    next: rank < max ? aaEffectValue(effect, rank + 1) : null
  }
}
