// tradeskills/TradeskillsHome.tsx — Home, top to bottom:
//
//   Pick up where you left off   the tradeskill last combined in, its next recipe, the last run
//                                (HomePickUp.tsx)
//   Make an item                 the door to the planner (Planner.tsx's panel, handed in)
//   Working towards              the wished items a recipe makes (HomeWished.tsx)
//   one tile per tradeskill      the level the log last stated (or that it has not shown the skill
//                                go up) on a bar against the skill's top, how many wiki recipes
//                                it has, and the recipe to make next. A tile opens that
//                                tradeskill's workbench.
//   Sources                      the wiki data's date and the two guides, as words
//
// The tiles and their order are shared/tradeskillBook.ts `tradeskillTiles`; the bar and the
// "caps at 200" note are shared/tradeskillLevelBar.ts; the sources line is
// shared/tradeskillHome.ts `sourceParts`. No guide is linked anywhere in the app: the line is text.

import { type JSX, type ReactNode, useMemo } from 'react'
import { Box, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { SKILLS_MODULE, type SkillRow } from '@shared/skills'
import { tradeskillTiles, type BookIndex, type TradeskillTile } from '@shared/tradeskillBook'
import type { GuideIndex } from '@shared/tradeskillGuide'
import { SOURCES_LABEL, sourceParts } from '@shared/tradeskillHome'
import { levelBar, type LevelBar } from '@shared/tradeskillLevelBar'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import { Tooltip } from '../../lib/Tooltip'
import { HomePickUp, type HomeFacts } from './HomePickUp'
import { HomeWished, type OpenPlan } from './HomeWished'
import { BarOf, CapNote, SkillBar } from './SkillBar'
import { useBookScrapedAt, useCrafting, useGuides, useHeld, useSkillLevels } from './tradeskillData'
import { ItemLink } from './tradeskillLinks'

const UNSEEN_TIP = 'Your log has not shown this skill go up yet.'

/** The level with "of 300" beside it, or that the log has not shown the skill. */
function TileLevel({ bar }: { bar: LevelBar }): JSX.Element {
  if (bar.level !== null) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ flexShrink: 0 }}>
        <Typography variant="h6" color="primary" data-testid="tradeskill-tile-level">
          {bar.level}
        </Typography>
        <BarOf bar={bar} />
      </Stack>
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

function Tile({ tile, rows, onOpen }: { tile: TradeskillTile; rows: readonly SkillRow[]; onOpen: (t: Tradeskill) => void }): JSX.Element {
  const bar = levelBar(rows, tile.tradeskill)
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
          <TileLevel bar={bar} />
        </Stack>
        <Box sx={{ my: 0.5 }}>
          <SkillBar bar={bar} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {tile.recipes} wiki recipes
        </Typography>
        <CapNote bar={bar} />
      </CardActionArea>
      <Box sx={{ px: 1.5, pb: 1.25, minHeight: 28 }}>
        <TileNext tile={tile} />
      </Box>
    </Card>
  )
}

/** What the section draws on, as words: the wiki data's date, each guide with its author and version, the log. */
function SourcesLine({ guides }: { guides: GuideIndex }): JSX.Element {
  const scrapedAt = useBookScrapedAt()
  const parts = sourceParts(scrapedAt, guides.payload.stamps ?? [])
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }} data-testid="tradeskills-sources">
      {SOURCES_LABEL} {parts.join(' · ')}
    </Typography>
  )
}

export interface TradeskillsHomeProps {
  index: BookIndex
  onOpen: (t: Tradeskill) => void
  /** Opens Make an item on a wished item's recipe. */
  onPlan: OpenPlan
  /** The "Make an item" panel, drawn above the tiles. */
  planner?: ReactNode
}

export function TradeskillsHome({ index, onOpen, onPlan, planner }: TradeskillsHomeProps): JSX.Element {
  const levels = useSkillLevels()
  const held = useHeld()
  const guides = useGuides()
  const { craft } = useCrafting(index)
  const facts = useMemo((): HomeFacts => ({ index, guides, levels, craft, held }), [index, guides, levels, craft, held])
  const tiles = useMemo(() => tradeskillTiles(index, levels.rows), [index, levels.rows])
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }} data-testid="tradeskills-home">
      <HomePickUp facts={facts} onOpen={onOpen} />
      {planner}
      <HomeWished facts={facts} onPlan={onPlan} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick a tradeskill to open its workbench.
      </Typography>
      {/* Until the engine serves the skills module no level is known: the line says what the app waits on. */}
      {!levels.served && <LogReadInline module={SKILLS_MODULE} served={false} sx={{ mb: 1 }} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
        {tiles.map((tile) => (
          <Tile key={tile.tradeskill} tile={tile} rows={levels.rows} onOpen={onOpen} />
        ))}
      </Box>
      <SourcesLine guides={guides} />
    </Box>
  )
}
