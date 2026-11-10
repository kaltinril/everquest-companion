// shared/gapQuestGivers.ts — a known NPC's page that lacks a quest the NPC gives (owner, 2026-11-09:
// "why isn't the app showing that this page needs updates like missing quests?", Lord Ollix Everling,
// whose page lists none of The Tragic Tale of House Everling). The engine files a Mobs row for the
// known name once the log meets it, with `questGaps` (gaps_quest_givers.rs): the page and the quest
// pages missing from its `|related_quests`. Here: the row's chip and the lines Copy gives, which are
// exactly the bullets to add under that field. Apart from gaps.ts, which sits at its size bar.

import type { GapAction, GapRow } from './gaps'
import { wikiEditUrl } from './gapUrls'

/** What the engine serves on such a row (gaps_quest_givers.rs `QuestGaps`). */
export interface QuestGaps {
  /** The NPC's wiki page. */
  page: string
  /** The quest pages the catalog says this NPC gives and the page does not link. */
  quests: string[]
}

/** The quests, named: `The Tragic Tale of House Everling` or `A and B`. */
function questList(quests: readonly string[]): string {
  if (quests.length <= 1) return quests[0] ?? ''
  return `${quests.slice(0, -1).join(', ')} and ${quests[quests.length - 1] ?? ''}`
}

/** The chip: edit the NPC page, the quests it gives added under related_quests. */
export function questGiverAction(row: GapRow): GapAction {
  const gaps = row.questGaps ?? { page: row.name, quests: [] }
  const what = gaps.quests.length === 1 ? 'the quest it gives' : `the ${String(gaps.quests.length)} quests it gives`
  return {
    kind: 'checkWiki',
    label: 'Add quests to mob page',
    why: `The wiki page for ${gaps.page} does not list ${what}: ${questList(gaps.quests)}.`,
    href: wikiEditUrl(gaps.page)
  }
}

/** Copy's text: the related_quests bullets to add, one a line, as the NPC layout writes them. */
export function questGiverAddText(gaps: QuestGaps): string {
  return gaps.quests.map((q) => `* [[${q}]]`).join('\n') + '\n'
}
