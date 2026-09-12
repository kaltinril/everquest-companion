// maps/MapTravelCard — "what is this zone for, and how do I get here".
//
// Two owner asks in one strip (kaltinril 2026-09-11): the nearest druid / wizard / boat / item
// port, and the zone's level range. `useZoneTravel` gathers the three witnesses; this only draws.
//
// IT NEVER SAYS "BOAT". Legends replaced the boats with translocator NPCs at the docks (owner,
// 2026-09-11) and the map files still print the old word; `zoneTravel.ts` translates it once, and
// the copy here says dock and translocator because that is what the player walks up to.
//
// ── IT LEADS WITH THE PORT THAT LANDS HERE ───────────────────────────────────────────────────
//
// A port INTO the zone beats a port one hop away, always, and the hop is spelled out rather than
// implied - "Ring of Commons, then west into Befallen" is a thing a player can do; "Ring of
// Commons" beside a Befallen map is a puzzle. The exit's own words come from the client's label.
//
// ── THE BAND IS THE HEADLINE AND THE EXTREMES ARE THE HOVER ──────────────────────────────────
//
// `zoneLevels.ts` carries the argument: Befallen's catalog rows run 4 to 61 and the band is 7-25.
// The caption states the band, the title states both plus the count it rests on, because `n` is
// what makes the band honest and a number nobody can weigh is worse than no number.
//
// NOTHING IS INVENTED WHEN NOTHING IS KNOWN. A zone whose map labels no seams and whose bestiary
// states no levels draws NO card at all rather than a row of blanks.

import type { JSX } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { ZonePort } from '@shared/zoneTravel'
import type { ZoneLevelBand } from '@shared/zoneLevels'
import type { TravelOption, ZoneTravel } from './useZoneTravel'

const TINY = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

/** Who takes you, in the one word the row needs. */
const VIA_LABEL: Record<ZonePort['via'], string> = {
  druid: 'DRU',
  wizard: 'WIZ',
  item: 'item'
}

/** The level band, or nothing. `n` rides the hover — see the header. */
function LevelLine({ band }: { band: ZoneLevelBand | null }): JSX.Element | null {
  if (band === null) return null
  const [low, high] = band.typical
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      data-testid="map-level-band"
      title={`${String(band.n)} catalog mobs, level ${String(band.min)} to ${String(band.max)} outright. The band is the tenth to ninetieth percentile - what the zone is for, rather than what can wander into it.`}
    >
      Levels{' '}
      <Box component="span" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        {low === high ? low : `${String(low)} to ${String(high)}`}
      </Box>
      {band.max > high && ` (up to ${String(band.max)})`}
    </Typography>
  )
}

/** One way in: the spell, who casts it, and the seam you walk after landing. */
function OptionRow({ option }: { option: TravelOption }): JSX.Element {
  const { port, then } = option
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" data-testid="map-travel-option">
      <Chip size="small" variant="outlined" label={VIA_LABEL[port.via]} sx={TINY} />
      <Typography variant="caption" sx={{ color: 'text.primary' }}>
        {port.spell}
        {port.level !== undefined && ` (${String(port.level)})`}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
        {then === null
          ? 'lands here'
          : /* The client's own label, so the reader can find the seam on the map. */
            `to ${then.name}, then ${then.kind === 'walk' ? 'on foot' : 'by translocator'}`}
      </Typography>
      {port.item !== undefined && (
        <Typography variant="caption" color="text.disabled" noWrap sx={{ minWidth: 0 }}>
          {port.item}
        </Typography>
      )}
    </Stack>
  )
}

/** How many ways in to draw before the list stops being a glance. */
const SHOWN = 4

export default function MapTravelCard({ travel }: { travel: ZoneTravel }): JSX.Element | null {
  const { band, exits, rides, options, ready } = travel
  // Until the port table has crossed from main, drawing "no ports" would be a claim about the
  // corpus rather than about the wait (law 1). A card with only a level line is still worth having.
  const shown = ready ? options.slice(0, SHOWN) : []
  if (band === null && exits.length === 0 && shown.length === 0) return null
  return (
    <Paper variant="outlined" data-testid="map-travel-card" sx={{ p: 1, mb: 1 }}>
      <Stack spacing={0.5}>
        <LevelLine band={band} />
        {/* The crossings somebody built, read as arrivals - what the ask called the "boat". */}
        {rides.map((ride) => (
          <Stack key={`${ride.kind}-${ride.zone}`} direction="row" spacing={0.75} alignItems="center" data-testid="map-travel-ride">
            <Chip size="small" variant="outlined" label={ride.kind === 'translocator' ? 'dock' : 'portal'} sx={TINY} />
            <Typography variant="caption" sx={{ color: 'text.primary' }}>
              {ride.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {ride.kind === 'translocator' ? 'translocator at the dock' : 'portal from here'}
            </Typography>
          </Stack>
        ))}
        {shown.map((option, i) => (
          <OptionRow key={`${option.port.spell}-${option.then?.zone ?? 'here'}-${String(i)}`} option={option} />
        ))}
        {ready && options.length === 0 && exits.length > 0 && (
          <Typography variant="caption" color="text.disabled">
            No port lands here or in the zones this map names.
          </Typography>
        )}
        {options.length > SHOWN && (
          <Typography variant="caption" color="text.disabled">
            {`and ${String(options.length - SHOWN)} more`}
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}
