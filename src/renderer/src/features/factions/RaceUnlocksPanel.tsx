// factions/RaceUnlocksPanel.tsx — RACE OPENING, as the server itself defines it: each
// `Race Unlock - <Race>` achievement's requirement rows read `Get maximum faction with <X>`, so
// a race unlock IS a faction checklist and it lives on the Factions tab (the achievements dump
// supplies the checklist, shared/outputs/achievements.ts raceUnlockClaims; the standings rows
// supply how far each faction has to go).
//
// TWO WEIGHTS: open races are one line of chips (done is done); each still-closed race gets a
// row with its required factions, every chip carrying the LIVE standing over the cap — green
// when the server already marked that requirement complete. Renders nothing without an
// achievements dump: the tab's freshness line teaches `/outputfile faction`, and this panel's
// absence is the honest state for a player who never exported achievements.

import { type JSX, useState } from 'react'
import { Box, Chip, Collapse, Stack, Typography } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import type { RaceUnlockClaim } from '@shared/outputs/achievements'
import type { FactionRowVm } from './useFactionRows'

/** One required faction as a chip: live standing over cap, green once the server calls it done.
 *  A click REVEALS that faction's row in the table below (the caller clears its hide-toggles). */
function FactionChip({
  name,
  complete,
  row,
  onFind
}: {
  name: string
  complete: boolean
  row: FactionRowVm | undefined
  onFind?: (name: string) => void
}): JSX.Element {
  const label =
    row === undefined ? name : `${name} ${String(row.standing)}/${String(row.cap)}`
  return (
    <Chip
      size="small"
      label={label}
      variant="outlined"
      color={complete ? 'success' : undefined}
      onClick={onFind === undefined ? undefined : () => onFind(name)}
      sx={{ height: 20, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }}
    />
  )
}

/** One still-closed race: its name and the factions it still wants at maximum. */
function ClosedRace({
  claim,
  byName,
  onFind
}: {
  claim: RaceUnlockClaim
  byName: Map<string, FactionRowVm>
  onFind?: (name: string) => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap data-testid="factions-race-closed">
      <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 118 }}>
        {claim.race}
      </Typography>
      {claim.factions.map((f) => (
        <FactionChip
          key={f.name}
          name={f.name}
          complete={f.complete}
          row={byName.get(f.name.toLowerCase())}
          onFind={onFind}
        />
      ))}
      {claim.factions.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          no faction requirements listed
        </Typography>
      )}
    </Stack>
  )
}

/** The panel. `races` undefined ⇒ no achievements dump on record ⇒ nothing at all. */
export default function RaceUnlocksPanel({
  races,
  rows,
  onFind
}: {
  races?: RaceUnlockClaim[]
  rows: readonly FactionRowVm[]
  /** reveal a required faction's row in the table below */
  onFind?: (name: string) => void
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (races === undefined || races.length === 0) return null
  const byName = new Map<string, FactionRowVm>()
  for (const r of rows) byName.set(r.name.toLowerCase(), r)
  const done: RaceUnlockClaim[] = []
  const todo: RaceUnlockClaim[] = []
  for (const c of races) (c.complete ? done : todo).push(c)
  return (
    <Box sx={{ mb: 1 }} data-testid="factions-races">
      <Typography
        variant="caption"
        onClick={() => {
          setOpen((v) => !v)
        }}
        data-testid="factions-races-toggle"
        sx={{ cursor: 'pointer', color: 'text.secondary', userSelect: 'none', display: 'inline-flex', alignItems: 'center' }}
      >
        {open ? (
          <KeyboardArrowUpIcon sx={{ fontSize: 16, mr: 0.25 }} />
        ) : (
          <KeyboardArrowDownIcon sx={{ fontSize: 16, mr: 0.25 }} />
        )}
        Race unlocks - {done.length} open, {todo.length} to earn
      </Typography>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.5} sx={{ pl: 2.5, pt: 0.5 }}>
          {done.length > 0 && (
            <Typography variant="caption" color="text.secondary" data-testid="factions-races-open">
              Open: {done.map((c) => c.race).join(', ')}
            </Typography>
          )}
          {todo.map((c) => (
            <ClosedRace key={c.race} claim={c} byName={byName} onFind={onFind} />
          ))}
        </Stack>
      </Collapse>
    </Box>
  )
}
