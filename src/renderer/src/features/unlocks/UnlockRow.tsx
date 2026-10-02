// unlocks/UnlockRow.tsx — ONE RACE, CLASS OR DEITY: open or not, how it opened, and each of its
// requirement lines drawn as what it joins to.
//
// A FACTION LINE is a chip with the live standing over the cap (the Factions tab's own number),
// green once the server calls it done, and it opens the Factions tab. A REWARD LINE is a chip
// with the item, green once the server credits it, and it opens the Sky quest that hands it out
// when the quest set knows one. A TASK LINE is its own words, and when the task is made of
// quests the catalog knows (unlockGraph.ts TASK_PARTS) each quest is a chip that opens its
// giver's page. A PLACEHOLDER LINE is the file saying the game has published nothing yet, and
// is drawn as that.
//
// WITHOUT A DUMP, OR WHEN THE DUMP LEFT THIS ONE OUT, the row is the rulebook's: the requirements
// stand, the status is not claimed (no tick, no circle, no figure), because "not done" is not
// something the app knows.

import { type JSX } from 'react'
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { factionNameKey } from '@shared/outputs/factions'
import { nameKey } from '@shared/unlocks/unlockGraph'
import { countedNeeds, howText, type Unlock, type UnlockNeed } from '@shared/unlocks/unlocks'
import { unlockRowId } from '../../lib/unlockLink'
import { rewardKey, type UnlocksController } from './useUnlocksController'

const CHIP_SX = { height: 20, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }

/** How many raising quests a faction chip's tooltip names before it counts the rest. */
const NAMED = 5

function FactionNeed({ need, c }: { need: UnlockNeed; c: UnlocksController }): JSX.Element {
  const fact = c.factions.get(factionNameKey(need.subject))
  const label =
    fact === undefined
      ? need.subject
      : `${need.subject} ${String(fact.standing)}/${String(fact.cap)}`
  const raises = fact?.raises ?? []
  const more = raises.length > NAMED ? ` and ${String(raises.length - NAMED)} more` : ''
  const title =
    fact === undefined
      ? 'No factions dump yet: type /outputfile faction in game'
      : `${fact.label}. ${raises.length === 0 ? 'No quest on record raises it.' : `Raised by ${raises.slice(0, NAMED).join(', ')}${more}.`}`
  return (
    <Tooltip title={title}>
      <Chip
        size="small"
        variant="outlined"
        label={label}
        color={need.done ? 'success' : undefined}
        data-testid="unlock-faction"
        onClick={c.onOpenFactions}
        sx={CHIP_SX}
      />
    </Tooltip>
  )
}

function RewardNeed({
  need,
  unlock,
  c
}: {
  need: UnlockNeed
  unlock: Unlock
  c: UnlocksController
}): JSX.Element {
  const fact = c.rewards.get(rewardKey(unlock.name, need.subject))
  const { onOpenQuest } = c
  const title =
    fact === undefined
      ? 'No Sky quest on record hands this out'
      : `${fact.questName}${fact.giver === undefined ? '' : ` - ${fact.giver}`}`
  return (
    <Tooltip title={title}>
      <Chip
        size="small"
        variant="outlined"
        label={need.subject}
        color={need.done ? 'success' : undefined}
        data-testid="unlock-reward"
        onClick={
          fact === undefined || onOpenQuest === undefined
            ? undefined
            : () => {
                onOpenQuest(fact.key)
              }
        }
        sx={CHIP_SX}
      />
    </Tooltip>
  )
}

/** The quests a task is made of, each opening its giver's page. */
function TaskParts({ need, c }: { need: UnlockNeed; c: UnlocksController }): JSX.Element | null {
  const parts = c.taskParts.get(nameKey(need.subject))
  if (parts === undefined) return null
  const { onOpenMob } = c
  return (
    <>
      {parts.map((part) => (
        <Tooltip
          key={part.name}
          title={part.giver === undefined ? 'part of the task' : `part of the task - given by ${part.giver}`}
        >
          <Chip
            size="small"
            variant="outlined"
            label={part.name}
            data-testid="unlock-task-part"
            onClick={
              part.giver === undefined || onOpenMob === undefined
                ? undefined
                : () => {
                    onOpenMob({ mob: part.giver ?? '' })
                  }
            }
            sx={CHIP_SX}
          />
        </Tooltip>
      ))}
    </>
  )
}

function Need({ need, unlock, c }: { need: UnlockNeed; unlock: Unlock; c: UnlocksController }): JSX.Element {
  switch (need.kind) {
    case 'faction':
      return <FactionNeed need={need} c={c} />
    case 'reward':
      return <RewardNeed need={need} unlock={unlock} c={c} />
    case 'task':
      return (
        <>
          <Typography
            variant="caption"
            color={need.done ? 'success.main' : 'text.secondary'}
            data-testid="unlock-line"
          >
            {need.done ? '✓ ' : ''}
            {need.text}
          </Typography>
          <TaskParts need={need} c={c} />
        </>
      )
    case 'placeholder':
      return (
        <Typography variant="caption" color="text.disabled" data-testid="unlock-placeholder">
          no requirements published yet
        </Typography>
      )
    case 'other':
      return (
        <Typography
          variant="caption"
          color={need.done ? 'success.main' : 'text.secondary'}
          data-testid="unlock-line"
        >
          {need.done ? '✓ ' : ''}
          {need.text}
        </Typography>
      )
  }
}

/** What the row says on the right: how it opened, or how much of it is done. */
function Standing({ unlock, known }: { unlock: Unlock; known: boolean }): JSX.Element {
  if (!known) return <></>
  if (unlock.open) {
    return (
      <Chip size="small" color="success" variant="outlined" label={howText(unlock.how)} sx={CHIP_SX} />
    )
  }
  const counted = countedNeeds(unlock)
  if (counted === 0) return <></>
  return (
    <Typography variant="caption" color="text.secondary">
      {String(unlock.done)} of {String(counted)}
      {unlock.unstated > 0 ? `, ${String(unlock.unstated)} not in the dump` : ''}
    </Typography>
  )
}

function StatusIcon({ unlock, known }: { unlock: Unlock; known: boolean }): JSX.Element | null {
  if (!known) return null
  return unlock.open ? (
    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} titleAccess="Open" />
  ) : (
    <RadioButtonUncheckedIcon color="disabled" sx={{ fontSize: 16 }} titleAccess="Closed" />
  )
}

export default function UnlockRow({
  unlock,
  yours,
  focused,
  c
}: {
  unlock: Unlock
  /** the created-as race, the confirmed class, the confirmed deity */
  yours: boolean
  /** the row a chip elsewhere asked for */
  focused: boolean
  c: UnlocksController
}): JSX.Element {
  // The dump's own row: a rule the dump left out is drawn as the rulebook's, status unclaimed.
  const known = c.hasDump && unlock.known
  return (
    <Box
      id={unlockRowId(unlock)}
      data-testid="unlock-row"
      data-open={known ? (unlock.open ? 'true' : 'false') : 'unknown'}
      sx={{
        py: 0.5,
        px: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: focused ? 'action.selected' : undefined
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center">
        <StatusIcon unlock={unlock} known={known} />
        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 150 }} data-testid="unlock-name">
          {unlock.name}
        </Typography>
        {yours && <Chip size="small" label="yours" sx={CHIP_SX} data-testid="unlock-yours" />}
        <Box sx={{ flex: 1 }} />
        <Standing unlock={unlock} known={known} />
      </Stack>
      {unlock.needs.length > 0 && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ pl: 3, pt: 0.5 }}
        >
          {unlock.needs.map((need) => (
            <Need key={need.text} need={need} unlock={unlock} c={c} />
          ))}
        </Stack>
      )}
    </Box>
  )
}
