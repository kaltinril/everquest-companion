// tradeskills/TradeskillsHome.tsx — Home, top to bottom:
//
//   Pick up where you left off   the tradeskill last combined in, its next recipe, the last run
//                                (HomePickUp.tsx)
//   Make an item                 the door to the planner (Planner.tsx's panel, handed in)
//   Working towards              the wished items a recipe makes (HomeWished.tsx)
//   one grid of tiles, in order:
//     a tradeskill with a level  that level on a bar against the skill's top, how many wiki recipes
//                                it has, and the recipe to make next; the highest level first
//     Foraging                   its own tile (ForagingTile.tsx)
//     a tradeskill not in the    by name: "Not in log" where the number goes (never 0: the level
//     log                        is not known), its top when one is measured, an empty bar, its
//                                wiki recipes, no next recipe, and a Hide button
//                                Every tradeskill's tile opens its workbench.
//   Hidden line                  the not-in-log tiles the player chose to hide (HiddenTilesLine.tsx)
//   Sources                      the wiki data's date and the two guides, as words
//
// The tradeskills the log had not shown were a row of small buttons until the owner read them as
// comments (2026-11-22). The tiles and their order are shared/tradeskillBook.ts `tradeskillTiles`;
// which have a level, and a not-in-log tile's words, are shared/tradeskillHome.ts `homeDoors` and
// `unseenFace`; the bar and the "caps at 200" note are shared/tradeskillLevelBar.ts; the sources
// line is `sourceParts`. No guide is linked anywhere in the app: the line is text.
//
// Every door keeps `data-testid="tradeskill-tile-<Tradeskill>"` on an element whose first `button`
// opens it, with `data-tile` saying whether the log has shown it (`seen`) or not (`unseen`).

import { type JSX, type ReactNode, useMemo } from 'react'
import { Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { SKILLS_MODULE, type SkillRow } from '@shared/skills'
import { tradeskillTiles, type BookIndex, type TradeskillTile } from '@shared/tradeskillBook'
import type { GuideIndex } from '@shared/tradeskillGuide'
import { HIDE_TILE_TEXT, SOURCES_LABEL, doorsLine, hideTileTip, homeDoors, sourceParts, splitHidden, tileRecipesText, unseenFace } from '@shared/tradeskillHome'
import { levelBar, type LevelBar } from '@shared/tradeskillLevelBar'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import { Tooltip } from '../../lib/Tooltip'
import { ForagingTile } from './ForagingTile'
import { HiddenTilesLine } from './HiddenTilesLine'
import { useMasteryRank } from './useMasteryRank'
import { HomePickUp, type HomeFacts, type OpenRecipe } from './HomePickUp'
import { HomeWished, type OpenPlan } from './HomeWished'
import { BarOf, CapNote, SkillBar } from './SkillBar'
import { useBookScrapedAt, useCrafting, useGuides, useHeld, useSkillLevels } from './tradeskillData'
import { ItemLink } from './tradeskillLinks'
import { useHiddenTiles } from './tradeskillMemory'

/** The level with "of 300" beside it. `Tile` is drawn only for a tradeskill the log has shown, so there is one. */
function TileLevel({ bar }: { bar: LevelBar }): JSX.Element | null {
  if (bar.level === null) return null
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
      <Typography variant="h6" color="primary" data-testid="tradeskill-tile-level">
        {bar.level}
      </Typography>
      <BarOf bar={bar} />
    </Stack>
  )
}

/** The recipe to make next, outside the tile's own button: its name opens the workbench on that recipe. */
function TileNext({ tile, onOpenRecipe }: { tile: TradeskillTile; onOpenRecipe: OpenRecipe }): JSX.Element | null {
  if (tile.recipes === 0) return null
  if (tile.next === null) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        No recipe above your level.
      </Typography>
    )
  }
  const next = tile.next
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', minWidth: 0 }} data-testid="tradeskill-tile-next">
      <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
        Next:
      </Typography>
      <Typography variant="body2" component="span" sx={{ minWidth: 0, display: 'flex' }}>
        <ItemLink
          name={next.item}
          act={() => {
            onOpenRecipe(tile.tradeskill, next.id)
          }}
        />
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
        trivial {next.trivial}
      </Typography>
    </Stack>
  )
}

interface TileProps {
  tile: TradeskillTile
  rows: readonly SkillRow[]
  /** The Crafting Mastery rank the log shows bought (useMasteryRank). */
  rank: number
  onOpen: (t: Tradeskill) => void
  onOpenRecipe: OpenRecipe
}

function Tile({ tile, rows, rank, onOpen, onOpenRecipe }: TileProps): JSX.Element {
  const bar = levelBar(rows, tile.tradeskill, rank)
  return (
    <Card variant="outlined" data-testid={`tradeskill-tile-${tile.tradeskill}`} data-tile="seen">
      <CardActionArea
        onClick={() => {
          onOpen(tile.tradeskill)
        }}
        sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}
      >
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }} spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {tile.tradeskill}
          </Typography>
          <TileLevel bar={bar} />
        </Stack>
        <Box sx={{ my: 0.5 }}>
          <SkillBar bar={bar} />
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {tileRecipesText(tile.recipes)}
        </Typography>
        <CapNote bar={bar} />
      </CardActionArea>
      <Box sx={{ px: 1.5, pb: 1.25, minHeight: 28 }}>
        <TileNext tile={tile} onOpenRecipe={onOpenRecipe} />
      </Box>
    </Card>
  )
}

interface UnseenTileProps {
  tile: TradeskillTile
  /** Whether the engine has read the skills: until then the tile says nothing of the log. */
  served: boolean
  onOpen: (t: Tradeskill) => void
  /** Folds the tile to the line at the bottom of Home. */
  onHide: (t: Tradeskill) => void
}

/**
 * A tradeskill the log has not shown: a whole tile that opens its workbench, with no level number
 * and no next recipe. Hide sits beside the tile's button and not inside it: a button cannot hold one.
 */
function UnseenTile({ tile, served, onOpen, onHide }: UnseenTileProps): JSX.Element {
  const face = unseenFace(tile.tradeskill, served)
  return (
    <Card variant="outlined" sx={{ position: 'relative' }} data-testid={`tradeskill-tile-${tile.tradeskill}`} data-tile="unseen">
      <Tooltip title={face.tip} describeChild>
        <CardActionArea
          onClick={() => {
            onOpen(tile.tradeskill)
          }}
          sx={{ px: 1.5, py: 1.25, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}
        >
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }} spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {tile.tradeskill}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline', flexShrink: 0 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-tile-not-in-log">
                {face.level}
              </Typography>
              {face.of !== '' && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-bar-of">
                  {face.of}
                </Typography>
              )}
            </Stack>
          </Stack>
          <Box sx={{ my: 0.5 }}>
            <SkillBar bar={levelBar([], tile.tradeskill)} label={face.label} />
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {tileRecipesText(tile.recipes)}
          </Typography>
        </CardActionArea>
      </Tooltip>
      <Tooltip title={hideTileTip(tile.tradeskill)} describeChild>
        <Button
          size="small"
          aria-label={`${HIDE_TILE_TEXT} ${tile.tradeskill}`}
          onClick={() => {
            onHide(tile.tradeskill)
          }}
          sx={{ position: 'absolute', right: 4, bottom: 4, minWidth: 0, px: 0.75, py: 0, textTransform: 'none', color: 'text.secondary' }}
          data-testid="tradeskill-tile-hide"
        >
          {HIDE_TILE_TEXT}
        </Button>
      </Tooltip>
    </Card>
  )
}

/** What the section draws on, as words: the wiki data's date, each guide with its author and version, the log. */
function SourcesLine({ guides }: { guides: GuideIndex }): JSX.Element {
  const scrapedAt = useBookScrapedAt()
  const parts = sourceParts(scrapedAt, guides.payload.stamps ?? [])
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }} data-testid="tradeskills-sources">
      {SOURCES_LABEL} {parts.join(' · ')}
    </Typography>
  )
}

export interface TradeskillsHomeProps {
  index: BookIndex
  onOpen: (t: Tradeskill) => void
  /** Opens a workbench on one recipe: what a "Next" name does. */
  onOpenRecipe: OpenRecipe
  /** Opens Make an item on a wished item's recipe. */
  onPlan: OpenPlan
  /** The "Make an item" panel, drawn above the tiles. */
  planner?: ReactNode
}

export function TradeskillsHome({ index, onOpen, onOpenRecipe, onPlan, planner }: TradeskillsHomeProps): JSX.Element {
  const levels = useSkillLevels()
  const held = useHeld()
  const guides = useGuides()
  const { craft } = useCrafting(index)
  const facts = useMemo((): HomeFacts => ({ index, guides, levels, craft, held }), [index, guides, levels, craft, held])
  const doors = useMemo(() => homeDoors(tradeskillTiles(index, levels.rows)), [index, levels.rows])
  const rank = useMasteryRank()
  const hiddenTiles = useHiddenTiles()
  const { shown, folded } = splitHidden(doors.unseen, hiddenTiles.hidden)
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }} data-testid="tradeskills-home">
      <HomePickUp facts={facts} onOpen={onOpen} onOpenRecipe={onOpenRecipe} />
      {planner}
      <HomeWished facts={facts} onPlan={onPlan} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }} data-testid="tradeskills-doors-line">
        {doorsLine(doors, levels.served)}
      </Typography>
      {/* Until the engine serves the skills module no level is known: the line says what the app waits on. */}
      {!levels.served && <LogReadInline module={SKILLS_MODULE} served={false} sx={{ mb: 1 }} />}
      {/* `dense`: Foraging's opened detail spans a whole row, and the tiles after it still fill the row Foraging is on. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gridAutoFlow: 'dense', gap: 1.5 }} data-testid="tradeskills-tiles">
        {doors.seen.map((tile) => (
          <Tile key={tile.tradeskill} tile={tile} rows={levels.rows} rank={rank} onOpen={onOpen} onOpenRecipe={onOpenRecipe} />
        ))}
        {/* Forage has no recipes and so no workbench: its tile is the whole of it, and what it found opens under its row (ForagingTile.tsx). */}
        <ForagingTile />
        {shown.map((tile) => (
          <UnseenTile key={tile.tradeskill} tile={tile} served={levels.served} onOpen={onOpen} onHide={hiddenTiles.hide} />
        ))}
      </Box>
      <HiddenTilesLine tiles={folded} onShow={hiddenTiles.show} onShowAll={hiddenTiles.showAll} />
      <SourcesLine guides={guides} />
    </Box>
  )
}
