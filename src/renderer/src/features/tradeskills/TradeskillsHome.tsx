// tradeskills/TradeskillsHome.tsx — Home: one tile per tradeskill with the level the log last
// stated (or that it has not shown the skill go up), how many wiki recipes it has, and the recipe
// to make next. A tile opens that tradeskill's workbench.
//
// The tiles and their order are shared/tradeskillBook.ts `tradeskillTiles`.

import { type JSX, useMemo } from 'react'
import { Box, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { SKILLS_MODULE } from '@shared/skills'
import { tradeskillTiles, type BookIndex, type TradeskillTile } from '@shared/tradeskillBook'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import { Tooltip } from '../../lib/Tooltip'
import { useSkillLevels } from './tradeskillData'
import { ItemLink } from './tradeskillLinks'

const UNSEEN_TIP = 'Your log has not shown this skill go up yet.'

function TileLevel({ level }: { level: number | null }): JSX.Element {
  if (level !== null) {
    return (
      <Typography variant="h6" color="primary" data-testid="tradeskill-tile-level">
        {level}
      </Typography>
    )
  }
  return (
    <Tooltip title={UNSEEN_TIP}>
      <Typography variant="caption" color="text.secondary" data-testid="tradeskill-tile-unseen">
        not in your log
      </Typography>
    </Tooltip>
  )
}

/** The recipe to make next: a link to the item, outside the tile's own button. */
function TileNext({ tile }: { tile: TradeskillTile }): JSX.Element | null {
  if (tile.recipes === 0) return null
  if (tile.next === null) {
    return (
      <Typography variant="caption" color="text.secondary">
        No recipe above your level.
      </Typography>
    )
  }
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }} data-testid="tradeskill-tile-next">
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        Next:
      </Typography>
      <Typography variant="body2" component="span" sx={{ minWidth: 0, display: 'flex' }}>
        <ItemLink name={tile.next.item} />
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        trivial {tile.next.trivial}
      </Typography>
    </Stack>
  )
}

function Tile({ tile, onOpen }: { tile: TradeskillTile; onOpen: (t: Tradeskill) => void }): JSX.Element {
  return (
    <Card variant="outlined" data-testid={`tradeskill-tile-${tile.tradeskill}`}>
      <CardActionArea
        onClick={() => {
          onOpen(tile.tradeskill)
        }}
        sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {tile.tradeskill}
          </Typography>
          <TileLevel level={tile.level} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {tile.recipes} wiki recipes
        </Typography>
      </CardActionArea>
      <Box sx={{ px: 1.5, pb: 1.25, minHeight: 28 }}>
        <TileNext tile={tile} />
      </Box>
    </Card>
  )
}

export function TradeskillsHome({ index, onOpen }: { index: BookIndex; onOpen: (t: Tradeskill) => void }): JSX.Element {
  const levels = useSkillLevels()
  const tiles = useMemo(() => tradeskillTiles(index, levels.rows), [index, levels.rows])
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }} data-testid="tradeskills-home">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick a tradeskill to open its workbench.
      </Typography>
      {/* Until the engine serves the skills module no level is known: the line says what the app waits on. */}
      {!levels.served && <LogReadInline module={SKILLS_MODULE} served={false} sx={{ mb: 1 }} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
        {tiles.map((tile) => (
          <Tile key={tile.tradeskill} tile={tile} onOpen={onOpen} />
        ))}
      </Box>
    </Box>
  )
}
