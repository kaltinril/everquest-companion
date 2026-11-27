// tradeskills/ForagingTile.tsx — Foraging on the section's Home (fork #6: "Fishing and Foraging
// also come to mind"). Forage is a skill with no recipe, so it has no workbench: this tile is the
// whole of it.
//
// The tile is a tile of Home's grid, the size and shape of a tradeskill's: the Forage level the
// log last stated (the `skills` module; the client spells the skill `Forage`), then found, failed
// and the found rate on one line (the `crafting` module's `forage`, joined across archived logs).
// A click opens the rest in place, across the grid's whole width under the tile's row, and closes
// it again (closed until asked for, remembered): this session's numbers when the session has any,
// the most-found items with each one's part (the top five, "Show all" for the rest; item names are
// the section's standard item links), and the wiki's Foraging AA with what the log shows bought.
// The page ran past one screen with all of that always drawn (owner's question, 2026-11-20).
//
// No props and self-contained: it reads its modules itself. It must be mounted inside a CSS grid
// (TradeskillsHome.tsx's tiles): the opened detail spans the grid's columns. Every figure and word
// is shared/tradeskillGather.ts and shared/tradeskillAa.ts. When the log shows no forage line and
// no Forage level it draws nothing.

import { type JSX, useMemo, useState } from 'react'
import { Box, Card, CardActionArea, Paper, Stack, Typography } from '@mui/material'
import { CRAFTING_MODULE, type CraftingSnap } from '@shared/crafting'
import {
  FORAGE_HIDE_TEXT,
  FORAGE_ITEMS_LABEL,
  FORAGE_LEVEL_UNSEEN,
  FORAGE_LEVEL_UNSEEN_TIP,
  FORAGE_NO_LINE_TEXT,
  FORAGE_SHOW_TEXT,
  FORAGE_TILE_TITLE,
  forageTile,
  type ForageTile,
  type GatherFigure
} from '@shared/tradeskillGather'
import { CellLink } from '../../lib/CellLink'
import { Tooltip } from '../../lib/Tooltip'
import { useModule } from '../../lib/useModule'
import { AaDetail, useAaFacts } from './AaPanel'
import { GatherItems } from './GatherPanel'
import { useForageOpen } from './tradeskillMemory'

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
      <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-forage-level-unseen">
        {FORAGE_LEVEL_UNSEEN}
      </Typography>
    </Tooltip>
  )
}

/** One labelled number of the tile's line; `data-value` holds the number alone. A figure that carries a tip explains itself on hover. */
function Figure({ figure }: { figure: GatherFigure }): JSX.Element {
  const line = (
    <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid={`tradeskill-forage-${figure.id}`} data-value={figure.value}>
      {figure.label}{' '}
      <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
        {figure.value}
      </Box>
    </Typography>
  )
  return figure.tip === undefined ? line : <Tooltip title={figure.tip}>{line}</Tooltip>
}

/** Found, failed and the rate on one line; one line in their place when the log has no forage line. */
function Counts({ tile }: { tile: ForageTile }): JSX.Element {
  if (tile.figures.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-forage-empty">
        {FORAGE_NO_LINE_TEXT}
      </Typography>
    )
  }
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 1.5 }} data-testid="tradeskill-forage-figures">
      {tile.figures.map((figure) => (
        <Figure key={figure.id} figure={figure} />
      ))}
    </Stack>
  )
}

/** The most-found items, and the switch between the top few and all of them. */
function Found({ tile, onToggle }: { tile: ForageTile; onToggle: () => void }): JSX.Element | null {
  if (tile.items.length === 0) return null
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
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

/** What a click on the tile opens: under the tile's row, across every column of the grid. */
function Detail({ tile, onToggle }: { tile: ForageTile; onToggle: () => void }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ gridColumn: '1 / -1', px: 1.5, py: 1 }} data-testid="tradeskill-forage-detail">
      <Stack spacing={0.75}>
        {tile.session !== '' && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-forage-session">
            {tile.session}
          </Typography>
        )}
        <Found tile={tile} onToggle={onToggle} />
        {tile.aas.length > 0 && (
          <Box data-testid="tradeskill-forage-aa">
            {tile.aas.map((line) => (
              <AaDetail key={line.aa.name} line={line} />
            ))}
          </Box>
        )}
      </Stack>
    </Paper>
  )
}

export function ForagingTile(): JSX.Element | null {
  const craft = useModule<CraftingSnap>(CRAFTING_MODULE)
  const { spends, skills } = useAaFacts()
  const [all, setAll] = useState(false)
  const [open, setOpen] = useForageOpen()
  // `undefined` is a served snapshot with no forage line; null is a module not served yet.
  const forage = craft === null ? null : craft.forage
  const tile = useMemo(() => forageTile({ forage, skills, spends }, all), [forage, skills, spends, all])
  if (tile === null) return null
  // A tile with nothing to open (a level alone, and no AA in the wiki's table) is not a button.
  const shown = open && tile.detail
  return (
    <>
      <Card variant="outlined" data-testid="tradeskill-forage-tile" data-open={shown}>
        <CardActionArea
          disabled={!tile.detail}
          aria-expanded={shown}
          onClick={() => {
            setOpen(!open)
          }}
          sx={{ px: 1.5, py: 1.25, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}
        >
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }} spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {FORAGE_TILE_TITLE}
            </Typography>
            <Level level={tile.level} />
          </Stack>
          <Box sx={{ my: 0.5 }}>
            <Counts tile={tile} />
          </Box>
          {tile.detail && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-forage-more">
              {shown ? FORAGE_HIDE_TEXT : FORAGE_SHOW_TEXT}
            </Typography>
          )}
        </CardActionArea>
      </Card>
      {shown && (
        <Detail
          tile={tile}
          onToggle={() => {
            setAll(!all)
          }}
        />
      )}
    </>
  )
}
