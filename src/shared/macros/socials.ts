// macros/socials.ts — the game's `[Socials]` section, read and written as text, and which names
// in the game folder are character files. Pure: the caller does the disk work. The format is in
// docs/community/plans/2026-11-20-macro-editor.md, "What the game stores".

import type { CharacterFile, GameMacro, MacroBody } from './types'

/** A `LineN` past this is not a macro line; it guards the array a stray number would make. */
const MAX_LINE_NUMBER = 20

const SECTION = /^\[(.*)\]\s*$/
const SOCIAL_KEY = /^Page(\d+)Button(\d+)(Name|Color|Line(\d+))=(.*)$/i

export function slotKey(page: number, button: number): string {
  return `${String(page)}:${String(button)}`
}

/** The page and button of a slot key, or null when it is not one. */
export function parseSlotKey(key: string): { page: number; button: number } | null {
  const m = /^(\d+):(\d+)$/.exec(key)
  return m ? { page: Number(m[1]), button: Number(m[2]) } : null
}

export function bySlot(a: { page: number; button: number }, b: { page: number; button: number }): number {
  return a.page - b.page || a.button - b.button
}

/** Lines with the trailing blank ones cut: a missing line key and an empty line are the same. */
export function trimLines(lines: readonly string[]): string[] {
  let end = lines.length
  while (end > 0 && lines[end - 1] === '') end--
  return lines.slice(0, end)
}

/** A slot with neither a name nor a line is an empty slot. */
export function isBlank(m: MacroBody): boolean {
  return m.name === '' && trimLines(m.lines).length === 0
}

/** One `Name` / `Color` / `LineN` value put on a macro being read. */
export function applyField(target: MacroBody, field: string, value: string): void {
  const lower = field.toLowerCase()
  if (lower === 'name') {
    target.name = value
    return
  }
  if (lower === 'color') {
    const n = Number.parseInt(value, 10)
    target.color = Number.isFinite(n) ? n : 0
    return
  }
  const line = Number(lower.slice('line'.length))
  if (!Number.isInteger(line) || line < 1 || line > MAX_LINE_NUMBER) return
  while (target.lines.length < line) target.lines.push('')
  target.lines[line - 1] = value
}

/**
 * Every macro of the text's `[Socials]` section, sorted by slot. Keys may come in any order, CRLF
 * or LF; other sections are skipped; no section gives an empty list.
 */
export function parseSocials(iniText: string): GameMacro[] {
  const slots = new Map<string, GameMacro>()
  let inSocials = false
  for (const raw of iniText.split(/\r?\n/)) {
    const line = raw.trimStart()
    const section = SECTION.exec(line)
    if (section) {
      inSocials = section[1].trim().toLowerCase() === 'socials'
      continue
    }
    if (!inSocials) continue
    const m = SOCIAL_KEY.exec(line)
    if (!m) continue
    const page = Number(m[1])
    const button = Number(m[2])
    const key = slotKey(page, button)
    const slot = slots.get(key) ?? { page, button, name: '', color: 0, lines: [] }
    slots.set(key, slot)
    applyField(slot, m[3], m[5])
  }
  return [...slots.values()]
    .map((s) => ({ ...s, lines: trimLines(s.lines) }))
    .filter((s) => !isBlank(s))
    .sort(bySlot)
}

/** A value on one ini line: a line break inside it would start a new key. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

/** A macro's keys in the game's order (name, colour, the lines that have text), under a key prefix. */
export function bodyLines(prefix: string, m: MacroBody): string[] {
  const out = [`${prefix}Name=${oneLine(m.name)}`, `${prefix}Color=${String(m.color)}`]
  m.lines.forEach((text, i) => {
    if (text !== '') out.push(`${prefix}Line${String(i + 1)}=${oneLine(text)}`)
  })
  return out
}

/** The `[Socials]` section as the game writes it: CRLF, sorted by slot, empty lines left out. */
export function renderSocials(slots: readonly GameMacro[]): string {
  const out = ['[Socials]']
  for (const m of [...slots].sort(bySlot)) {
    if (isBlank(m)) continue
    out.push(...bodyLines(`Page${String(m.page)}Button${String(m.button)}`, m))
  }
  return out.join('\r\n') + '\r\n'
}

const CHARACTER_FILE = /^([^_]+)_([^_]+)_LO(\d+)\.ini$/i

/**
 * The character files among a folder's names: `<Character>_<server>_LO<n>.ini`, case folded. The
 * `UI_` files (window positions) and backups (`..._LO1_Backup_1.ini`, `....ini.before-copy-...`)
 * are not character files. Sorted by character, server, loadout.
 */
export function pickCharacterFiles(names: readonly string[]): CharacterFile[] {
  const out: CharacterFile[] = []
  for (const file of names) {
    if (file.toLowerCase().startsWith('ui_')) continue
    const m = CHARACTER_FILE.exec(file)
    if (!m) continue
    out.push({ file, character: m[1], server: m[2], loadout: Number(m[3]) })
  }
  const fold = (f: CharacterFile): string => `${f.character}_${f.server}`.toLowerCase()
  return out.sort((a, b) => fold(a).localeCompare(fold(b)) || a.loadout - b.loadout)
}

/** The key a character file's chosen set is remembered under. */
export function characterFileKey(f: Pick<CharacterFile, 'character' | 'server' | 'loadout'>): string {
  return `${f.character}_${f.server}_lo${String(f.loadout)}`.toLowerCase()
}
