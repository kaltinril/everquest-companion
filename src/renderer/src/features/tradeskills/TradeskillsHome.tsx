// tradeskills/TradeskillsHome.tsx — Home, top to bottom:
//
//   Pick up where you left off   the tradeskill last combined in, its next recipe, the last run
//                                (HomePickUp.tsx)
//   Make an item                 the door to the planner (Planner.tsx's panel, handed in)
//   Working towards              the wished items a recipe makes (HomeWished.tsx)
//   a tile per tradeskill the    the level the log last stated on a bar against the skill's top,
//   log has shown                how many wiki recipes it has, and the recipe to make next. A
//                                tile opens that tradeskill's workbench. Foraging is a tile of the
//                                same grid, after them (ForagingTile.tsx).
//   Not in your log yet          the other tradeskills as one row of small buttons: the same door
//                                to the same workbench, with no bar and no next recipe, since no
//                                level is known to draw them from
//   Sources                      the wiki data's date and the two guides, as words
//
// The page was every tradeskill as a full tile, and ran past one screen on tiles the player had
// never touched (owner's question, 2026-11-20). The tiles and their order are
// shared/tradeskillBook.ts `tradeskillTiles`; which are full tiles and which are in the row is
// shared/tradeskillHome.ts `homeDoors`; the bar and the "caps at 200" note are
// shared/tradeskillLevelBar.ts; the sources line is `sourceParts`. No guide is linked anywhere in
// the app: the line is text.
//
// Every door keeps `data-testid="tradeskill-tile-<Tradeskill>"` on an element that holds a
// `button`, tile or small button alike, with `data-tile` saying which it is.

import { type JSX, type ReactNode, useMemo } from 'react'
import { Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { SKILLS_MODULE, type SkillRow } from '@shared/skills'
import { tradeskillTiles, type BookIndex, type TradeskillTile } from '@shared/tradeskillBook'
import type { GuideIndex } from '@shared/tradeskillGuide'
import { SOURCES_LABEL, UNSEEN_HEADING, doorsLine, homeDoors, sourceParts, unseenDoorText } from '@shared/tradeskillHome'
import { levelBar, type LevelBar } from '@shared/tradeskillLevelBar'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import { ForagingTile } from './ForagingTile'
import { useMasteryRank } from './useMasteryRank'
import { HomePickUp, type HomeFacts, type OpenRecipe } from './HomePickUp'
import { HomeWished, type OpenPlan } from './HomeWished'
import { BarOf, CapNote, SkillBar } from './SkillBar'
import { useBookScrapedAt, useCrafting, useGuides, useHeld, useSkillLevels } from './tradeskillData'
import { ItemLink } from './tradeskillLinks'

/** The level with "of 300" beside it. A full tile is drawn only for a tradeskill the log has shown, so there is one. */
function TileLevel({ bar }: { bar: LevelBar }): JSX.Element | null {
  if (bar.level === null) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ flexShrink: 0 }}>
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
      <Typography variant="caption" color="text.secondary">
        No recipe above your level.
      </Typography>
    )
  }
  const next = tile.next
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }} data-testid="tradeskill-tile-next">
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
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
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
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
        <TileNext tile={tile} onOpenRecipe={onOpenRecipe} />
      </Box>
    </Card>
  )
}

/** A tradeskill the log has not shown: a small button with its name and its wiki recipes, opening the workbench as a tile does. */
function UnseenDoor({ tile, onOpen }: { tile: TradeskillTile; onOpen: (t: Tradeskill) => void }): JSX.Element {
  return (
    <Box data-testid={`tradeskill-tile-${tile.tradeskill}`} data-tile="unseen">
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        onClick={() => {
          onOpen(tile.tradeskill)
        }}
        sx={{ textTransform: 'none', py: 0.25 }}
      >
        {unseenDoorText(tile)}
      </Button>
    </Box>
  )
}

/** "Not in your log yet": every tradeskill the log has not shown, on one row that wraps. Nothing when the log has shown them all. */
function UnseenRow({ tiles, onOpen }: { tiles: readonly TradeskillTile[]; onOpen: (t: Tradeskill) => void }): JSX.Element | null {
  if (tiles.length === 0) return null
  return (
    <Box sx={{ mt: 1.5 }} data-testid="tradeskills-unseen">
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }} data-testid="tradeskills-unseen-heading">
        {UNSEEN_HEADING}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {tiles.map((tile) => (
          <UnseenDoor key={tile.tradeskill} tile={tile} onOpen={onOpen} />
        ))}
      </Stack>
    </Box>
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
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }} data-testid="tradeskills-home">
      <HomePickUp facts={facts} onOpen={onOpen} onOpenRecipe={onOpenRecipe} />
      {planner}
      <HomeWished facts={facts} onPlan={onPlan} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="tradeskills-doors-line">
        {doorsLine(doors, levels.served)}
      </Typography>
      {/* Until the engine serves the skills module no level is known: the line says what the app waits on. */}
      {!levels.served && <LogReadInline module={SKILLS_MODULE} served={false} sx={{ mb: 1 }} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }} data-testid="tradeskills-tiles">
        {doors.seen.map((tile) => (
          <Tile key={tile.tradeskill} tile={tile} rows={levels.rows} rank={rank} onOpen={onOpen} onOpenRecipe={onOpenRecipe} />
        ))}
        {/* Forage has no recipes and so no workbench: its tile is the whole of it, and what it found opens under the tiles (ForagingTile.tsx). */}
        <ForagingTile />
      </Box>
      <UnseenRow tiles={doors.unseen} onOpen={onOpen} />
      <SourcesLine guides={guides} />
    </Box>
  )
}
