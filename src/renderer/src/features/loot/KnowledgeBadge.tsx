// KnowledgeBadge — the LORE / quest / tradeskill chips on a loot row, read off the row's MARKS
// (`lib/itemMarks.ts`: one batched call per paint for every mounted row), not off a full
// knowledge record: until 2026-10-10 the chips rode the notable-pickups probe, which looks up
// only the 40 most recent pickups one at a time, so most rows never had one (owner report).
//
// A row with a Plane of Sky chip hides the quest chip (the PoSky chip says it). An item whose
// only use is as a TRADESKILL component (Gnome Meat → Gnome Kabobs) gets a `tradeskill` chip
// instead of `quest`, so the two kinds of "it is for something" stay apart. That chip is a link
// into the Tradeskills section where the app published the door (lib/tradeskillLink): the first
// tradeskill the item's recipes name, on the recipe that makes or first uses the item.

import type { JSX } from 'react'
import { Chip, Stack } from '@mui/material'
import type { ItemMarks } from '@shared/itemKnowledge'
import type { Tradeskill } from '@shared/tradeskills'
import { useItemMarks } from '../../lib/itemMarks'
import { useTradeskillLink } from '../../lib/tradeskillLink'

interface BadgeFlags {
  showQuest: boolean
  showTradeskill: boolean
}

function badgeFlags(m: ItemMarks, isPosky: boolean): BadgeFlags {
  const hasQuests = m.questUses > 0
  const tradeskillOnly = m.recipes > 0 && !hasQuests
  return {
    showQuest: (m.quest || hasQuests) && !isPosky && !tradeskillOnly,
    showTradeskill: tradeskillOnly && !isPosky
  }
}

const BADGE_SX = { height: 18, fontSize: 10 } as const

/**
 * The `tradeskill` chip. With a tradeskill to open and the door in hand it is clickable, and the
 * click stays off the row under it (the row's own click opens the item's page).
 */
function TradeskillChip({ name, tradeskill }: { name: string; tradeskill: Tradeskill | undefined }): JSX.Element {
  const open = useTradeskillLink()
  if (open === null || tradeskill === undefined) {
    return <Chip size="small" color="info" variant="outlined" label="tradeskill" sx={BADGE_SX} />
  }
  return (
    <Chip
      size="small"
      color="info"
      variant="outlined"
      label="tradeskill"
      clickable
      title={`Open in ${tradeskill}`}
      data-testid="loot-tradeskill-badge"
      onClick={(e) => {
        e.stopPropagation()
        open({ tradeskill, item: name })
      }}
      sx={BADGE_SX}
    />
  )
}

export function KnowledgeBadge({ name, isPosky }: { name: string; isPosky: boolean }): JSX.Element | null {
  const m = useItemMarks(name)
  if (!m) return null
  const flags = badgeFlags(m, isPosky)
  if (!m.lore && !flags.showQuest && !flags.showTradeskill) return null
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }} component="span">
      {m.lore && <Chip size="small" color="warning" variant="outlined" label="LORE" sx={{ height: 18, fontSize: 10 }} />}
      {flags.showQuest && (
        <Chip size="small" color="secondary" variant="outlined" label="quest" sx={{ height: 18, fontSize: 10 }} />
      )}
      {flags.showTradeskill && <TradeskillChip name={name} tradeskill={m.tradeskills[0]} />}
    </Stack>
  )
}
