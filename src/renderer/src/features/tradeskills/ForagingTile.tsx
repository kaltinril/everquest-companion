// tradeskills/ForagingTile.tsx — Foraging on the section's Home (fork #6: "Fishing and Foraging
// also come to mind"). Forage is a skill with no recipe, so it has no workbench: this tile is the
// whole of it.
//
// What it draws: the Forage level the log last stated (the `skills` module; the client spells the
// skill `Forage`), found and failed with the rate (the `crafting` module's `forage`, joined across
// archived logs), this session's numbers when the session has any, the most-found items with each
// one's part (the top five, "Show all" for the rest; item names are the section's standard item
// links), and the wiki's Foraging AA with what the log shows bought.
//
// No props and self-contained: it reads its modules itself. Every figure and word is
// shared/tradeskillGather.ts and shared/tradeskillAa.ts. When the log shows no forage line and no
// Forage level it draws nothing.

import { type JSX, useMemo, useState } from 'react'
import { Box, Card, Stack, Typography } from '@mui/material'
import { CRAFTING_MODULE, type CraftingSnap } from '@shared/crafting'
import {
  FORAGE_ITEMS_LABEL,
  FORAGE_LEVEL_UNSEEN,
  FORAGE_LEVEL_UNSEEN_TIP,
  FORAGE_NO_LINE_TEXT,
  FORAGE_TILE_TITLE,
  forageTile,
  type ForageTile
} from '@shared/tradeskillGather'
import { CellLink } from '../../lib/CellLink'
import { Tooltip } from '../../lib/Tooltip'
import { useModule } from '../../lib/useModule'
import { AaDetail, useAaFacts } from './AaPanel'
import { GatherFigures, GatherItems } from './GatherPanel'

function Level({ level }: { level: number | null }): JSX.Element {
  if (level !== null) {
    return (
      <Typography variant="h6" color="primary" data-testid="tradeskill-forage-level">
        {level}
      </Typography>
    )
  }
  return (
    <Tooltip title={FORAGE_LEVEL_UNSEEN_TIP}>
      <Typography variant="caption" color="text.secondary" data-testid="tradeskill-forage-level-unseen">
        {FORAGE_LEVEL_UNSEEN}
      </Typography>
    </Tooltip>
  )
}

/** Found, failed and the rate; one line in their place when the log has no forage line. */
function Counts({ tile }: { tile: ForageTile }): JSX.Element {
  if (tile.figures.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="tradeskill-forage-empty">
        {FORAGE_NO_LINE_TEXT}
      </Typography>
    )
  }
  return <GatherFigures figures={tile.figures} prefix="tradeskill-forage" />
}

/** The most-found items, and the switch between the top few and all of them. */
function Found({ tile, onToggle }: { tile: ForageTile; onToggle: () => void }): JSX.Element | null {
  if (tile.items.length === 0) return null
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {FORAGE_ITEMS_LABEL}
      </Typography>
      <GatherItems items={tile.items} prefix="tradeskill-forage" />
      {tile.toggle !== '' && (
        <Box component="span" sx={{ typography: 'caption' }} data-testid="tradeskill-forage-toggle">
          <CellLink text={tile.toggle} onOpen={onToggle} />
        </Box>
      )}
    </Box>
  )
}

export function ForagingTile(): JSX.Element | null {
  const craft = useModule<CraftingSnap>(CRAFTING_MODULE)
  const { spends, skills } = useAaFacts()
  const [all, setAll] = useState(false)
  // `undefined` is a served snapshot with no forage line; null is a module not served yet.
  const forage = craft === null ? null : craft.forage
  const tile = useMemo(() => forageTile({ forage, skills, spends }, all), [forage, skills, spends, all])
  if (tile === null) return null
  return (
    <Card variant="outlined" sx={{ mt: 1.5, px: 1.5, py: 1.25 }} data-testid="tradeskill-forage-tile">
      <Stack spacing={0.75}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {FORAGE_TILE_TITLE}
          </Typography>
          <Level level={tile.level} />
        </Stack>
        <Counts tile={tile} />
        {tile.session !== '' && (
          <Typography variant="caption" color="text.secondary" data-testid="tradeskill-forage-session">
            {tile.session}
          </Typography>
        )}
        <Found
          tile={tile}
          onToggle={() => {
            setAll(!all)
          }}
        />
        {tile.aas.length > 0 && (
          <Box data-testid="tradeskill-forage-aa">
            {tile.aas.map((line) => (
              <AaDetail key={line.aa.name} line={line} />
            ))}
          </Box>
        )}
      </Stack>
    </Card>
  )
}
