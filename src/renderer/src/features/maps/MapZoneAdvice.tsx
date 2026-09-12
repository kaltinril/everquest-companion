// maps/MapZoneAdvice — "where should I be, and where do motes come from", for one level.
//
// Owner ask (kaltinril 2026-09-11): *"somewhere it shows recommendation for where to level, where
// to get motes (should be equal or higher level but not crazy higher)"*. `shared/zoneAdvice.ts`
// carries the ranking and the measurement behind it; this draws it and lets you open one.
//
// ── THE LEVEL IS TYPED, NOT DETECTED, AND THAT IS THE POINT ──────────────────────────────────
//
// The app can often infer a level, and this control deliberately does not use it. Half the reason
// anybody opens this list is to plan for someone ELSE - the level you will be next week, the
// friend you are about to group with, the alt. A field that answers for any level answers for all
// of those; one that locks to the logged-in character answers for one. It is remembered, so it
// costs a typing once.
//
// ── ONE LIST, BECAUSE THE MEASUREMENT SAYS SO ────────────────────────────────────────────────
//
// The ask names two things and gets one list, which is a claim worth defending: mote drops follow
// CON, and so does experience. White/yellow/red run 7-10 motes per 100 kills against 3.1 for
// green. So the zones worth levelling in ARE the zones worth farming, and a second list would be
// the same list with a different heading.
//
// WHAT IS SHOWN IS A RATE, NEVER A TOTAL. "8.5 per 100 kills" is honest; "300 motes an hour" would
// need a kill speed nothing here measures.

import { useMemo, useState, type JSX } from 'react'
import { Box, Chip, List, ListItemButton, Paper, Stack, TextField, Typography } from '@mui/material'
import { rankZones, moteGradeCap, type ZoneAdvice } from '@shared/zoneAdvice'
import type { ZoneFit } from '@shared/zoneLevels'
import { zoneShortNameFromCatalog } from '@shared/zones'
import { zoneBands } from './zoneBands'

const TINY = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

/** How the fit reads, and how loudly. `deadly` never appears — `rankZones` drops it. */
const FIT: Readonly<Record<ZoneFit, { label: string; color: 'success' | 'warning' | 'default' }>> = {
  even: { label: 'on level', color: 'success' },
  hard: { label: 'a reach', color: 'warning' },
  green: { label: 'easy', color: 'default' },
  deadly: { label: 'deadly', color: 'default' }
}

/** How many rows before the list stops being a glance. */
const SHOWN = 8

/**
 * Zones the catalog knows through fewer than this many mobs are held back.
 *
 * Not a quality judgement about the zone — a judgement about OUR EVIDENCE. A band drawn from three
 * documented mobs will happily rank first and be wrong, and there is no way for the reader to tell
 * from the row. Eight is the point where the percentile band stops swinging on one entry.
 */
const MIN_EVIDENCE = 8

function AdviceRow({ row, onPick }: { row: ZoneAdvice; onPick?: (zone: string) => void }): JSX.Element {
  const fit = FIT[row.fit]
  const [low, high] = row.band.typical
  // A zone whose map we cannot name is still worth READING; it just cannot be opened.
  const stem = zoneShortNameFromCatalog(row.zone)
  return (
    <ListItemButton
      dense
      disabled={stem === null || onPick === undefined}
      data-testid="zone-advice-row"
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
        <Typography
          variant="caption"
          color="text.disabled"
          title={`About ${String(row.motesPer100)} motes per 100 kills at this con, measured from this app's own logged fights. A rate, not a total - it says nothing about how fast you clear.`}
          sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {`${String(row.motesPer100)}/100`}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }} title={`${String(row.n)} catalog mobs`}>
          {`n${String(row.n)}`}
        </Typography>
      </Stack>
    </ListItemButton>
  )
}

export default function MapZoneAdvice({ onPick }: { onPick?: (zone: string) => void }): JSX.Element {
  const [text, setText] = useState('20')
  const level = Number.parseInt(text, 10)
  const rows = useMemo(
    () => (Number.isFinite(level) && level > 0 ? rankZones(zoneBands(), level, MIN_EVIDENCE) : []),
    [level]
  )
  return (
    <Paper variant="outlined" data-testid="zone-advice" sx={{ p: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
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
        {rows.length > 0 && (
          <Typography variant="caption" color="text.disabled">
            {`motes cap at grade ${String(moteGradeCap(level))}`}
          </Typography>
        )}
      </Stack>
      {rows.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          Type a level to see the zones the bestiary can describe for it.
        </Typography>
      ) : (
        <List dense disablePadding>
          {rows.slice(0, SHOWN).map((row) => (
            <AdviceRow key={row.zone} row={row} onPick={onPick} />
          ))}
        </List>
      )}
    </Paper>
  )
}
