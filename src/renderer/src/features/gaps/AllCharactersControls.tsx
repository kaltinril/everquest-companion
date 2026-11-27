// The Gaps tab's All characters controls (owner, 2026-10-19): the box (off by default, with its
// warning), the day window beside it (every view since 2026-10-21: "days back should be for any
// character yes"), and one line naming whose data is in the list, how old each saved part is, and
// which are older than two months.

import type { JSX } from 'react'
import { Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { MAX_GAP_DAYS, type CharacterGaps } from '@shared/gapsAllCharacters'
import { charactersLineEnd, savedWords } from '@shared/gapsOthersLine'
import { Tooltip } from '../../lib/Tooltip'

// Screen text is one short sentence (owner, 2026-10-21: "we just hit them with so much text to read").
const WARNING = "Joins every character's saved Gaps across accounts and servers: can be a lot of data."

/** While main reads every character's saves or the tab joins them: a spinner and what it is doing. */
function Working(): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }} data-testid="gaps-all-working">
      <CircularProgress size={14} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Reading every character…
      </Typography>
    </Stack>
  )
}

/** The box, the day window, and a spinner while the join is being made. */
export function AllCharactersBox({
  on,
  onChange,
  days,
  onDays,
  working = false
}: {
  on: boolean
  onChange: (on: boolean) => void
  days: number
  onDays: (days: number) => void
  working?: boolean
}): JSX.Element {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Tooltip title={WARNING}>
        <FormControlLabel
          sx={{ mr: 0 }}
          control={<Checkbox size="small" checked={on} onChange={(e) => onChange(e.target.checked)} sx={{ p: 0.5 }} data-testid="gaps-all-characters" />}
          label={<Typography variant="caption">All characters</Typography>}
        />
      </Tooltip>
      <Tooltip title="Only rows seen in this many days; a release can change older sightings.">
        <TextField
          size="small"
          type="number"
          label="Days back"
          value={days}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n >= 1) onDays(n)
          }}
          sx={{ width: 96 }}
          slotProps={{ htmlInput: { min: 1, max: MAX_GAP_DAYS, 'data-testid': 'gaps-days' } }}
        />
      </Tooltip>
      {on && working && <Working />}
    </Stack>
  )
}

/**
 * Whose data the list holds: the attached character live, then each other one with its saved date.
 * The words are shared/gapsOthersLine.ts's; a read that failed says so, in the warning colour.
 */
export function CharactersLine({ live, others, failed = false }: { live: string; others: readonly CharacterGaps[] | undefined; failed?: boolean }): JSX.Element {
  if (others === undefined) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="gaps-characters">
        Reading every character&apos;s Gaps…
      </Typography>
    )
  }
  const now = new Date()
  const end = charactersLineEnd(others.length, failed)
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="gaps-characters">
      Characters: {live} (live)
      {others.map((c) => {
        const w = savedWords(c, now)
        return (
          <span key={c.character}>
            {', '}
            <Tooltip title={w.tip}>
              <Typography component="span" variant="caption" color={w.stale ? 'warning.main' : 'text.secondary'}>
                {w.text}
              </Typography>
            </Tooltip>
          </span>
        )
      })}
      {end.warn ? (
        <Typography component="span" variant="caption" sx={{ color: 'warning.main' }} data-testid="gaps-characters-failed">
          {end.text}
        </Typography>
      ) : (
        end.text
      )}
    </Typography>
  )
}
