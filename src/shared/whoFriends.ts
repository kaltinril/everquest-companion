// whoFriends.ts — friends online, from the last `/who` (competitor quick wins; owner, 2026-10-29).
// The game never says a friend logged in (alertGroupsRefused.ts `friendOnline`), but a `/who` (or
// the game's own `/friends`) prints one row per player it found. The player keeps a short list of
// names; this file reads the rows into one result and says which listed friends it saw, and when.
// A friend missing from a zone-only `/who` may still be online elsewhere, so the screen says "seen",
// never "offline".
//
// The lines come live from the engine through an app-owned raw alert (main/whoWatch.ts,
// dataServer/ownFires.ts). Pure: no Electron, no storage.

/** The player's friend list in the storage the windows share. */
export const FRIENDS_KEY = 'eq.friends'
/** The last `/who` result, kept so a restart still shows it. */
export const WHO_LAST_KEY = 'eq.who.last'

/** One `/who` or `/friends` listing: when it was printed and every name it showed. */
export interface WhoResult {
  at: number
  names: string[]
  source: 'who' | 'friends'
}

/**
 * The engine's raw trigger for a listing's lines: the header, a row, the count footer. Rust regex
 * syntax (the engine compiles it case-insensitive); `whoLine` below re-reads every line it passes.
 */
export const WHO_LINE_REGEX =
  '^\\[[^\\]]+\\]\\s+(?:Players (?:in|on) EverQuest|Friends currently on EverQuest|There (?:are|is) (?:\\d+|no) players?|(?:\\* RIP \\*\\s*)?(?:AFK\\s+)?(?:<LINKDEAD>\\s*)?\\[(?:ANONYMOUS|\\d+ [A-Z]{3}(?:/[A-Z]{3})*)\\] )'

const STAMP = /^\[[^\]]+\]\s+/
const HEADER = /^(?:Players (?:in|on) EverQuest|(Friends) currently on EverQuest)/
const FOOTER = /^There (?:are \d+ players|is 1 player|are no players)\b/
const ROW = /^(?:\* RIP \*\s*)?(?:AFK\s+)?(?:<LINKDEAD>\s*)?\[(?:ANONYMOUS|\d+ [A-Z]{3}(?:\/[A-Z]{3})*)\] ([^\s(<]+)/
const NAME = /^[A-Za-z]{3,15}$/

/** What one log line is to a listing. */
export type WhoLine = { kind: 'header'; source: WhoResult['source'] } | { kind: 'row'; name: string } | { kind: 'footer' }

/** A log line (timestamp included) read as a listing's header, row or footer; null for anything else. */
export function whoLine(raw: string): WhoLine | null {
  const stamp = STAMP.exec(raw)
  if (stamp === null) return null
  const text = raw.slice(stamp[0].length)
  const header = HEADER.exec(text)
  if (header !== null) return { kind: 'header', source: header[1] === undefined ? 'who' : 'friends' }
  if (FOOTER.test(text)) return { kind: 'footer' }
  const row = ROW.exec(text)
  // A corpse row names `<Name>'s corpse`.
  const name = row?.[1].replace(/['`’]s$/, '')
  return name !== undefined && NAME.test(name) ? { kind: 'row', name } : null
}

/** The listing being read. `closed` once its footer came by. */
export interface WhoFold {
  current: WhoResult | null
  closed: boolean
  lastAt: number
}

export const EMPTY_WHO_FOLD: WhoFold = { current: null, closed: false, lastAt: 0 }

/** A row this long after the last listing line, with no header between, starts a new listing. */
const SAME_LISTING_MS = 5000

/** Fold one line in. `changed` is true when the listing on show moved. */
export function foldWho(fold: WhoFold, raw: string, at: number): { fold: WhoFold; changed: boolean } {
  const line = whoLine(raw)
  if (line === null) return { fold, changed: false }
  const stale = fold.current === null || fold.closed || at - fold.lastAt > SAME_LISTING_MS
  if (line.kind === 'header') return { fold: { current: { at, names: [], source: line.source }, closed: false, lastAt: at }, changed: true }
  if (line.kind === 'footer') {
    // A footer with no header before it ("There are no players ... match") is an empty listing.
    const current = fold.current === null || at - fold.lastAt > SAME_LISTING_MS ? { at, names: [], source: 'who' as const } : fold.current
    return { fold: { current, closed: true, lastAt: at }, changed: current !== fold.current }
  }
  const base = stale || fold.current === null ? { at, names: [], source: 'who' as const } : fold.current
  if (base.names.includes(line.name)) return { fold: { ...fold, lastAt: at }, changed: false }
  return { fold: { current: { ...base, names: [...base.names, line.name] }, closed: false, lastAt: at }, changed: true }
}

/** A typed friend name as the game spells it (`grynn` → `Grynn`), or undefined when it cannot be a name. */
export function friendName(typed: string): string | undefined {
  const t = typed.trim()
  return NAME.test(t) ? t[0].toUpperCase() + t.slice(1).toLowerCase() : undefined
}

/** The stored friend list, validated; anything unreadable is an empty list. */
export function readFriends(stored: unknown): string[] {
  if (typeof stored !== 'string') return []
  try {
    const list: unknown = JSON.parse(stored)
    if (!Array.isArray(list)) return []
    return [...new Set(list.map((n) => (typeof n === 'string' ? friendName(n) : undefined)).filter((n): n is string => n !== undefined))]
  } catch {
    return []
  }
}

/** The stored last listing, validated; null when there is none. */
export function readWhoResult(stored: unknown): WhoResult | null {
  if (typeof stored !== 'string') return null
  try {
    const r = JSON.parse(stored) as Partial<WhoResult> | null
    if (r === null || typeof r.at !== 'number' || !Array.isArray(r.names)) return null
    return { at: r.at, names: r.names.filter((n): n is string => typeof n === 'string'), source: r.source === 'friends' ? 'friends' : 'who' }
  } catch {
    return null
  }
}

/** The list with one name added (kept in the order typed), or the same list when it is there or not a name. */
export function addFriend(friends: readonly string[], typed: string): string[] {
  const name = friendName(typed)
  return name === undefined || friends.includes(name) ? [...friends] : [...friends, name]
}

export function removeFriend(friends: readonly string[], name: string): string[] {
  return friends.filter((f) => f !== name)
}

/** Each friend and whether the last listing showed them: the seen ones first, in list order. */
export function friendsSeen(friends: readonly string[], last: WhoResult | null): { name: string; seen: boolean }[] {
  const shown = new Set((last?.names ?? []).map((n) => n.toLowerCase()))
  const rows = friends.map((name) => ({ name, seen: shown.has(name.toLowerCase()) }))
  return [...rows.filter((r) => r.seen), ...rows.filter((r) => !r.seen)]
}

/** The names of the friends the last listing showed, in list order. */
export function seenFriendNames(friends: readonly string[], last: WhoResult | null): string[] {
  return friendsSeen(friends, last)
    .filter((r) => r.seen)
    .map((r) => r.name)
}
