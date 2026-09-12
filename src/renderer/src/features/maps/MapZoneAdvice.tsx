// maps/MapZoneAdvice — "where should I be", for one level and one reason.
//
// Owner asks (kaltinril 2026-09-11, -12): *"somewhere it shows recommendation for where to level,
// where to get motes"* and then *"why not expand this new tab inside maps to give different level
// ranges for different stuff - D4 mote farming, or best EXP or best gear, or most wishlist items in
// a single zone"*. `shared/zoneAdvice.ts` carries the three rankings, the measurements behind them,
// and why "best gear" is not one of them yet; this draws whichever is picked and lets you open a
// zone.
//
// ── THE LEVEL IS TYPED, NOT DETECTED, AND THAT IS THE POINT ──────────────────────────────────
//
// The app can often infer a level, and this control deliberately does not use it. Half the reason
// anybody opens this list is to plan for someone ELSE - the level you will be next week, the
// friend you are about to group with, the alt. A field that answers for any level answers for all
// of those; one that locks to the logged-in character answers for one.
//
// ── THE RIGHT-HAND COLUMN IS THE GOAL'S, AND SOMETIMES THERE ISN'T ONE ───────────────────────
//
// The first version printed the mote rate on every row, and the owner's screenshot showed why
// that was noise: at one level, every listed zone cons the same and every row said 8.5. So the
// column is now the goal's own driver - the rate for experience (where green's 3.1 against 8.5 is
// the whole point), the wished-item count for the wish list - and for the mote goal there is NO
// extra number, because its driver is the fit chip and the band already on the row. A constant
// column is a column that should not be there.
//
// WHAT IS SHOWN IS A RATE, NEVER A TOTAL. "8.5 per 100 kills" is honest; "300 motes an hour" would
// need a kill speed nothing here measures.

import { useMemo, useState, type JSX } from 'react'
import { Box, Chip, List, ListItemButton, Paper, Stack, TextField, Typography } from '@mui/material'
import { rankZones, moteGradeCap, type ZoneAdvice, type ZoneGoal } from '@shared/zoneAdvice'
import type { ZoneFit } from '@shared/zoneLevels'
import { zoneShortNameFromCatalog } from '@shared/zones'
import { useWishlist } from '../wishlist/useWishlist'
import { wishedByZone, zoneBands } from './zoneBands'

const TINY = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

/** How the fit reads, and how loudly. `deadly` only ever appears on the wish-list goal. */
const FIT: Readonly<Record<ZoneFit, { label: string; color: 'success' | 'warning' | 'error' | 'default' }>> = {
  even: { label: 'on level', color: 'success' },
  hard: { label: 'a reach', color: 'warning' },
  green: { label: 'easy', color: 'default' },
  deadly: { label: 'deadly', color: 'error' }
}

/** The goal's own right-hand column, or none — see the header. */
interface GoalColumn {
  head: string
  title: string
  value: (row: ZoneAdvice) => number
}

interface GoalSpec {
  label: string
  /** the one sentence the chip's hover states about what this ranking is for */
  hint: string
  column: GoalColumn | null
}

const GOALS: Readonly<Record<ZoneGoal, GoalSpec>> = {
  exp: {
    label: 'Experience',
    hint: 'Zones that con even or a little above you first, then the easy ones. Con drives experience and mote drops alike.',
    column: {
      head: 'motes / 100 kills',
      title: 'Motes per 100 kills at this con, measured from this app`s own logged fights. A rate, not a total: it says nothing about how fast you clear a zone.',
      value: (row) => row.motesPer100
    }
  },
  motes: {
    label: 'Mote grade',
    hint: 'Harder zones first: the grade floor rises with difficulty, and Superior-and-better come from harder content rather than luckier kills. Easy zones are left off. Which zones offer which instance tier (D0 to D4) is stated in no data this app holds, so this ranks by the band alone.',
    column: null
  },
  wish: {
    label: 'Wish list',
    hint: 'Zones by how many different items on your wish list can drop there. The one list that keeps a deadly zone, because the item is where it is.',
    column: {
      head: 'wished',
      title: 'How many different items on your wish list the bestiary says can drop in this zone.',
      value: (row) => row.wished
    }
  }
}

const GOAL_ORDER: readonly ZoneGoal[] = ['exp', 'motes', 'wish']

/** How many rows before the list stops being a glance. */
const SHOWN = 12

/**
 * Zones the catalog knows through fewer than this many mobs are held back.
 *
 * Not a quality judgement about the zone — a judgement about OUR EVIDENCE. A band drawn from three
 * documented mobs will happily rank first and be wrong, and there is no way for the reader to tell
 * from the row. Eight is the point where the percentile band stops swinging on one entry.
 */
const MIN_EVIDENCE = 8

/** The column heads, mirroring `AdviceRow`'s Stack so the words sit over their numbers. */
function AdviceHead({ column }: { column: GoalColumn | null }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1, pb: 0.25, width: '100%', minWidth: 0 }}>
      <Box sx={{ width: 62, flexShrink: 0 }} />
      <Typography variant="caption" color="text.disabled">
        Zone
      </Typography>
      <Typography variant="caption" color="text.disabled">
        levels
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      {column !== null && (
        <Typography variant="caption" color="text.disabled" title={column.title} sx={{ flexShrink: 0 }}>
          {column.head}
        </Typography>
      )}
      <Typography
        variant="caption"
        color="text.disabled"
        title="How many catalog mobs the level band rests on. A band drawn from a handful is a weaker claim than one drawn from a hundred."
        sx={{ flexShrink: 0 }}
      >
        mobs
      </Typography>
    </Stack>
  )
}

function AdviceRow({
  row,
  column,
  onPick
}: {
  row: ZoneAdvice
  column: GoalColumn | null
  onPick?: (zone: string) => void
}): JSX.Element {
  const fit = FIT[row.fit]
  const [low, high] = row.band.typical
  // A zone whose map we cannot name is still worth READING; it just cannot be opened.
  const stem = zoneShortNameFromCatalog(row.zone)
  return (
    <ListItemButton
      dense
      disabled={stem === null || onPick === undefined}
      data-testid="zone-advice-row"
      data-fit={row.fit}
      onClick={() => {
        if (stem !== null) onPick?.(stem)
      }}
      sx={{ py: 0.25, px: 1, borderRadius: 1 }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
        <Chip size="small" variant="outlined" color={fit.color} label={fit.label} sx={TINY} />
        <Typography variant="caption" noWrap sx={{ color: 'text.primary', minWidth: 0, flexShrink: 1 }}>
          {row.zone}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {low === high ? low : `${String(low)}-${String(high)}`}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {column !== null && (
          <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {column.value(row)}
          </Typography>
        )}
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
          title={`${String(row.n)} catalog mobs carry a level in this zone`}
        >
          {row.n}
        </Typography>
      </Stack>
    </ListItemButton>
  )
}

/** The three goals as the app's one-lit-chip idiom (the Exaltations bar's `ToggleChip`). */
function GoalChips({ goal, onGoal }: { goal: ZoneGoal; onGoal: (g: ZoneGoal) => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.5}>
      {GOAL_ORDER.map((g) => (
        <Chip
          key={g}
          size="small"
          label={GOALS[g].label}
          title={GOALS[g].hint}
          data-testid={`zone-advice-goal-${g}`}
          color={g === goal ? 'primary' : 'default'}
          variant={g === goal ? 'filled' : 'outlined'}
          onClick={() => {
            onGoal(g)
          }}
        />
      ))}
    </Stack>
  )
}

/** What an empty list means depends on which list it is. */
function emptyText(goal: ZoneGoal, level: number, haveWishes: boolean): string {
  if (!Number.isFinite(level) || level <= 0) return 'Type a level to see the zones the bestiary can describe for it.'
  if (goal === 'wish') {
    return haveWishes
      ? 'Nothing on your wish list drops in a zone the bestiary documents.'
      : 'Your wish list is empty - add items on the Gear tab and this will rank the zones that drop them.'
  }
  return 'The bestiary documents no zone that fits this level for this goal.'
}

export default function MapZoneAdvice({ onPick }: { onPick?: (zone: string) => void }): JSX.Element {
  const [text, setText] = useState('20')
  const [goal, setGoal] = useState<ZoneGoal>('exp')
  const level = Number.parseInt(text, 10)
  // The wish list is the one input that is the PLAYER's rather than the catalog's; the per-zone
  // count is one walk of the bestiary, redone only when the list itself changes.
  const wishlist = useWishlist().list
  const wished = useMemo(
    () => wishedByZone(new Set(wishlist.entries.map((e) => e.itemKey))),
    [wishlist.entries]
  )
  const rows = useMemo(
    () =>
      Number.isFinite(level) && level > 0
        ? rankZones(zoneBands(), level, { goal, min: MIN_EVIDENCE, wished })
        : [],
    [level, goal, wished]
  )
  const column = GOALS[goal].column
  return (
    <Paper variant="outlined" data-testid="zone-advice" sx={{ p: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          Worth your time at level
        </Typography>
        <TextField
          size="small"
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(/\D/g, '').slice(0, 2))
          }}
          slotProps={{ htmlInput: { 'data-testid': 'zone-advice-level', inputMode: 'numeric' } }}
          sx={{ width: 64 }}
        />
        <GoalChips goal={goal} onGoal={setGoal} />
        {rows.length > 0 && goal !== 'wish' && (
          <Typography variant="caption" color="text.disabled">
            {`motes cap at grade ${String(moteGradeCap(level))}`}
          </Typography>
        )}
      </Stack>
      {rows.length === 0 ? (
        <Typography variant="caption" color="text.disabled" data-testid="zone-advice-empty">
          {emptyText(goal, level, wishlist.entries.length > 0)}
        </Typography>
      ) : (
        <>
          <AdviceHead column={column} />
          <List dense disablePadding>
            {rows.slice(0, SHOWN).map((row) => (
              <AdviceRow key={row.zone} row={row} column={column} onPick={onPick} />
            ))}
          </List>
          {rows.length > SHOWN && (
            <Typography variant="caption" color="text.disabled" sx={{ px: 1 }}>
              {`and ${String(rows.length - SHOWN)} more`}
            </Typography>
          )}
        </>
      )}
    </Paper>
  )
}
