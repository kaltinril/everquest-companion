// factions/FactionWorkPanel.tsx — the FACTION WORK an expanded row reveals: the quests that raise
// this faction (the point of the whole tab — "save your Bone Chips, Kaladim wants them"), and the
// ones that cost it, so a player farming one side knows what the other side charges.
//
// EVERY NAME THAT HAS A DESTINATION IS A LINK, the app's standing idiom: item names (turn-ins AND
// rewards) open that item's Loot drill-down through `onOpenLoot` — the same `DonorName` the
// Exaltations and Wish list tabs use, so the styling and the Back contract come for free — and
// the quest giver opens the Mobs tab through `onOpenMob`, the Raid Targets contract. The START
// ZONE stays TEXT: the app has no zone deep link yet (factionQuests.ts's header), and a fake link
// would be worse than a plain word.
//
// LONG LISTS ARE CAPPED IN PLACE, the hover carrying the rest (the JOS-106 idiom — the long form
// lives in the hover, never in the row): a Kaladim newbie quest lists eighteen reward items, and
// eighteen chips would bury the one fact this panel exists to say.

import { type JSX } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { DonorName } from '../planner/PlannerChips'
import type { FactionQuestRef, FactionWork } from './factionQuests'

/** How many linked names a list shows before folding the rest into a "+N more" hover. */
const LIST_CAP = 4

/** A linked, capped item-name list: `label: A, B, C, D +3 more`. Nothing when the list is empty. */
function ItemLinks({
  label,
  names,
  onOpenLoot,
  testId
}: {
  label: string
  names: readonly string[]
  onOpenLoot?: (item?: string) => void
  testId?: string
}): JSX.Element | null {
  if (names.length === 0) return null
  const shown = names.slice(0, LIST_CAP)
  const rest = names.slice(LIST_CAP)
  return (
    <Typography variant="caption" color="text.secondary" data-testid={testId} sx={{ display: 'block' }}>
      {label}{' '}
      {shown.map((n, i) => (
        <Box component="span" key={n}>
          {i > 0 && ', '}
          <DonorName name={n} onOpen={onOpenLoot} />
        </Box>
      ))}
      {rest.length > 0 && (
        <Box component="span" title={rest.join(', ')} sx={{ cursor: 'help' }}>
          {' '}
          +{rest.length} more
        </Box>
      )}
    </Typography>
  )
}

/** The giver's name as a Mobs-tab link — the con-card / Raid Targets contract. */
function GiverLink({
  giver,
  onOpenMob
}: {
  giver: string
  onOpenMob?: (t: { mob: string }) => void
}): JSX.Element {
  return (
    <Box
      component="span"
      onClick={onOpenMob === undefined ? undefined : () => onOpenMob({ mob: giver })}
      sx={{
        textDecoration: 'underline dotted',
        textUnderlineOffset: 2,
        cursor: onOpenMob === undefined ? 'default' : 'pointer'
      }}
    >
      {giver}
    </Box>
  )
}

/** The signed payout badge: an exact number when the page stated one, a bare arrow otherwise. */
function payoutLabel(ref: FactionQuestRef, up: boolean): string {
  if (ref.amount === undefined) return up ? '+' : '−'
  return ref.amount > 0 ? `+${String(ref.amount)}` : String(ref.amount)
}

/** One quest's line: payout, name, who and where, then the save-these and rewards lists. */
function QuestLine({
  quest,
  up,
  onOpenLoot,
  onOpenMob
}: {
  quest: FactionQuestRef
  up: boolean
  onOpenLoot?: (item?: string) => void
  onOpenMob?: (t: { mob: string }) => void
}): JSX.Element {
  return (
    <Box sx={{ py: 0.5 }} data-testid="factions-quest">
      <Typography variant="body2" component="div">
        <Box
          component="span"
          sx={{
            color: up ? 'success.main' : 'error.main',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            mr: 0.75
          }}
        >
          {payoutLabel(quest, up)}
        </Box>
        {quest.name}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {quest.giver !== undefined && <GiverLink giver={quest.giver} onOpenMob={onOpenMob} />}
          {quest.startZone !== undefined && ` · ${quest.startZone}`}
          {quest.minLevel !== undefined && ` · lvl ${String(quest.minLevel)}+`}
        </Typography>
      </Typography>
      <Box sx={{ pl: 3 }}>
        <ItemLinks label="turn in:" names={quest.items} onOpenLoot={onOpenLoot} testId="factions-quest-items" />
        <ItemLinks label="rewards:" names={quest.rewards} onOpenLoot={onOpenLoot} testId="factions-quest-rewards" />
      </Box>
    </Box>
  )
}

/**
 * The expanded panel: every quest on record that raises this faction, then the ones that lower
 * it. `work` is null when no quest page names the faction at all — the panel says so instead of
 * rendering an empty region, because "no work on record" is the answer, not an absence.
 */
export default function FactionWorkPanel({
  work,
  onOpenLoot,
  onOpenMob
}: {
  work: FactionWork | null
  onOpenLoot?: (item?: string) => void
  onOpenMob?: (t: { mob: string }) => void
}): JSX.Element {
  if (work === null) {
    return (
      <Typography variant="caption" color="text.secondary" data-testid="factions-no-work" sx={{ py: 1, display: 'block' }}>
        No quest on record names this faction. The catalog knows what the wiki's quest pages state;
        kills and unlisted turn-ins still move it in game.
      </Typography>
    )
  }
  return (
    <Stack spacing={0.5} sx={{ py: 1 }} data-testid="factions-work">
      {work.raise.map((q) => (
        <QuestLine key={q.name} quest={q} up onOpenLoot={onOpenLoot} onOpenMob={onOpenMob} />
      ))}
      {work.lower.length > 0 && (
        <Box sx={{ pt: work.raise.length > 0 ? 1 : 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Costs this faction:
          </Typography>
          {work.lower.map((q) => (
            <QuestLine key={q.name} quest={q} up={false} onOpenLoot={onOpenLoot} onOpenMob={onOpenMob} />
          ))}
        </Box>
      )}
    </Stack>
  )
}
