// shared/gapDialogue.ts — an NPC's whole conversation on a new page (owner, 2026-11-21, of Malloy the
// Songbird: "We should be building up the full interaction chain with these guys"). The engine serves
// `dialogue` on the row (gaps_dialogue.rs): the hail's lines and each keyword said with its answer. Here:
// the order the keywords lead to each other, the page's transcript, and the join of two logs' readings.
//
// The layout is the wiki's own, measured on the cached mob pages (2026-11-21): `You say, '...'` unprefixed
// on 150 lines against 26 with a `:`, each line its own paragraph, `[keywords]` as the game prints them.

/** A keyword the player said, and the NPC's lines answering it. */
export interface DialogueTurn {
  said: string
  lines: string[]
}

export interface Dialogue {
  hail: string[]
  asked: DialogueTurn[]
}

/** The engine's `dialogue`; read here rather than typed on `GapRow`, which sits at its size bar. */
export const dialogueOf = (row: object): Dialogue | undefined => (row as { dialogue?: Dialogue }).dialogue

const fold = (s: string): string => s.trim().toLowerCase()

/** The `[keywords]` of some lines, in the order printed. */
const keywordsOf = (lines: readonly string[]): string[] => lines.flatMap((l) => [...l.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]))

/** The unused turn a keyword leads to: said as printed, else a say holding it (`What Dark Truth?`). */
function turnFor(keyword: string, left: readonly DialogueTurn[]): DialogueTurn | undefined {
  const k = fold(keyword)
  return left.find((t) => fold(t.said) === k) ?? left.find((t) => ` ${fold(t.said).replace(/[^a-z0-9' ]/g, ' ')} `.includes(` ${k} `))
}

/** The turns depth-first along the `[keywords]` from the hail; a turn nothing leads to starts its own run, in the log's order. */
export function orderedTurns(hail: readonly string[], asked: readonly DialogueTurn[]): DialogueTurn[] {
  const left = [...asked]
  const out: DialogueTurn[] = []
  const follow = (lines: readonly string[]): void => {
    for (const keyword of keywordsOf(lines)) {
      const next = turnFor(keyword, left)
      if (next === undefined) continue
      left.splice(left.indexOf(next), 1)
      out.push(next)
      follow(next.lines)
    }
  }
  follow(hail)
  for (let next = left.shift(); next !== undefined; next = left.shift()) {
    out.push(next)
    follow(next.lines)
  }
  return out
}

/** The page's transcript: each line its own paragraph, `mask` writing the player as the wiki does. */
export function dialogueText(name: string, d: Dialogue, greeting: string | undefined, mask: (said: string) => string): string {
  const hail = d.hail.length > 0 ? d.hail : greeting === undefined ? [] : [greeting]
  const says = (lines: readonly string[]): string[] => lines.map((l) => `${name} says, '${mask(l)}'`)
  const opening = hail.length === 0 ? [] : [`You say, 'Hail, ${name}'`, ...says(hail)]
  const turns = orderedTurns(hail, d.asked).flatMap((t) => [`You say, '${mask(t.said)}'`, ...says(t.lines)])
  return [...opening, ...turns].join('\n\n')
}

/** The longer reading of one exchange; the newer log's when they are as long. */
const longer = (older: readonly string[], newer: readonly string[]): string[] => [...(newer.length >= older.length ? newer : older)]

/** Two logs' readings of one NPC: every keyword either heard, each with its fullest answer. */
export function mergeDialogue(older: Dialogue | undefined, newer: Dialogue | undefined): Dialogue | undefined {
  if (older === undefined || newer === undefined) return newer ?? older
  const asked = older.asked.map((t) => {
    const n = newer.asked.find((x) => fold(x.said) === fold(t.said))
    return n === undefined ? t : { said: n.said, lines: longer(t.lines, n.lines) }
  })
  const added = newer.asked.filter((n) => !older.asked.some((t) => fold(t.said) === fold(n.said)))
  return { hail: longer(older.hail, newer.hail), asked: [...asked, ...added] }
}
