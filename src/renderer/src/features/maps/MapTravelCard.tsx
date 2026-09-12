// maps/MapTravelCard — "what is this zone for, and how do I get here".
//
// Two owner asks in one strip (kaltinril 2026-09-11): the nearest druid / wizard / boat / item
// port, and the zone's level range. `useZoneTravel` gathers the three witnesses; this only draws.
//
// IT NEVER SAYS "BOAT". Legends replaced the boats with translocator NPCs at the docks (owner,
// 2026-09-11) and the map files still print the old word; `zoneTravel.ts` translates it once, and
// the copy here says dock and translocator because that is what the player walks up to.
//
// ── IT LEADS WITH THE PORT THAT LANDS HERE, THEN THE NEAREST ─────────────────────────────────
//
// A port INTO the zone beats one a hop away, always, and the walk is spelled out rather than
// implied - "lands in West Commonlands, then on foot to Befallen" is a thing a player can do;
// "Ring of Commons" beside a Befallen map is a puzzle. Beyond one hop the walk names the zones
// passed through, because that IS the route and the reader is about to take it.
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
import { Box, Chip, Link, Paper, Stack, Typography } from '@mui/material'
import type { ZonePort } from '@shared/zoneTravel'
import type { ZoneLevelBand } from '@shared/zoneLevels'
import { MAX_HOPS, type PortRoute } from '@shared/zoneTravel'
import type { ZoneTravel } from './useZoneTravel'
// The two hover-and-drill seams the rest of the app already uses for these nouns. Wrapping the
// names here is the whole of "link them": `SpellTooltip` carries its own click-through to the
// spell page (lib/spellLink.tsx publishes the opener app-wide), and `KnownItemTooltip` is the
// same card every other item name in the app opens.
import { SpellTooltip } from '../../lib/SpellCard'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'

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

/** The walk as one string, for the row's hover - `Walk` below draws it with the zones as links. */
function walkText(route: PortRoute): string {
  const { path } = route
  if (path.length === 0) return 'lands here'
  const kinds = new Set(path.map((p) => p.kind))
  const how = kinds.size === 1 && kinds.has('walk') ? 'on foot' : 'on foot and by translocator'
  const via = path.slice(0, -1).map((p) => p.name)
  const end = path[path.length - 1].name
  return via.length === 0
    ? `lands in ${route.port.zoneName}, then ${how} to ${end}`
    : `lands in ${route.port.zoneName}, then ${how} via ${via.join(', ')} to ${end}`
}

/**
 * A zone name that opens that zone's map (owner, 2026-09-12: *"i should be able to click on the
 * name of the 'lands in' portal to jump to the map for that"*). Inert text when the card was
 * mounted without an opener, the `onOpenLoot` rule: no control rather than a dead one.
 */
function ZoneLink({ zone, name, onPick }: { zone: string; name: string; onPick?: (zone: string) => void }): JSX.Element {
  if (onPick === undefined) return <>{name}</>
  return (
    <Link
      component="button"
      variant="caption"
      underline="hover"
      data-testid="map-travel-zone"
      onClick={() => {
        onPick(zone)
      }}
      sx={{ verticalAlign: 'baseline', color: 'text.secondary' }}
    >
      {name}
    </Link>
  )
}

/** The walk after landing, with every zone named a link to its map. */
function Walk({ route, onPick }: { route: PortRoute; onPick?: (zone: string) => void }): JSX.Element {
  const { port, path } = route
  if (path.length === 0) return <>lands here</>
  const kinds = new Set(path.map((p) => p.kind))
  const how = kinds.size === 1 && kinds.has('walk') ? 'on foot' : 'on foot and by translocator'
  const via = path.slice(0, -1)
  const end = path[path.length - 1]
  return (
    <>
      {'lands in '}
      <ZoneLink zone={port.zone} name={port.zoneName} onPick={onPick} />
      {`, then ${how} `}
      {via.length > 0 && (
        <>
          {'via '}
          {via.map((step, i) => (
            <span key={step.zone}>
              {i > 0 && ', '}
              <ZoneLink zone={step.zone} name={step.name} onPick={onPick} />
            </span>
          ))}
          {' '}
        </>
      )}
      {'to '}
      <ZoneLink zone={end.zone} name={end.name} onPick={onPick} />
    </>
  )
}

/** One way in: the spell, who casts it, and the walk after landing. */
function OptionRow({ route, onPick }: { route: PortRoute; onPick?: (zone: string) => void }): JSX.Element {
  const { port } = route
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" data-testid="map-travel-option" data-hops={route.path.length}>
      <Chip size="small" variant="outlined" label={VIA_LABEL[port.via]} sx={TINY} />
      <SpellTooltip name={port.spell}>
        <Typography variant="caption" component="span" sx={{ color: 'text.primary' }}>
          {port.spell}
          {port.level !== undefined && ` (${String(port.level)})`}
        </Typography>
      </SpellTooltip>
      <Typography variant="caption" component="span" color="text.secondary" noWrap sx={{ minWidth: 0 }} title={walkText(route)}>
        <Walk route={route} onPick={onPick} />
      </Typography>
      {port.item !== undefined && (
        <KnownItemTooltip name={port.item} clickThrough>
          <Typography variant="caption" component="span" color="text.disabled" noWrap sx={{ minWidth: 0 }}>
            {port.item}
          </Typography>
        </KnownItemTooltip>
      )}
    </Stack>
  )
}

/**
 * How many ways in to draw before the card starts costing the map its space (owner, 2026-09-12:
 * *"do you see how the map is now so small"*). Three: the cheapest cast, the next, and one more;
 * the count line says how many were held back.
 */
const SHOWN = 3

export default function MapTravelCard({
  travel,
  onPick
}: {
  travel: ZoneTravel
  /** open a zone's map by stem - the view's own `pick`; absent, the zone names are plain text */
  onPick?: (zone: string) => void
}): JSX.Element | null {
  const { band, exits, rides, routes, ready } = travel
  // Until the port table has crossed from main, drawing "no ports" would be a claim about the
  // corpus rather than about the wait (law 1). A card with only a level line is still worth having.
  const shown = ready ? routes.slice(0, SHOWN) : []
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
        {shown.map((route, i) => (
          <OptionRow key={`${route.port.spell}-${route.port.item ?? ''}-${String(i)}`} route={route} onPick={onPick} />
        ))}
        {ready && routes.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            {`No port lands within ${String(MAX_HOPS)} zones of here, by the seams the maps label.`}
          </Typography>
        )}
        {routes.length > SHOWN && (
          <Typography variant="caption" color="text.disabled">
            {`and ${String(routes.length - SHOWN)} more`}
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}
