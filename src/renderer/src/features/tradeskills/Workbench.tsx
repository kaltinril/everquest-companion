// tradeskills/Workbench.tsx — one tradeskill: the level the log last stated, on a bar against the
// skill's top with the wiki's "caps at 200" note when it applies (SkillBar.tsx), and four tabs
// under it (MapsTabs' arrangement: one at a time, so the screen never becomes a scroll of panels).
//
//   Recipes       the picked recipe in full (the one to make next until the player picks another)
//                 over the recipe book, with what the player's log says of each recipe
//   Your route    a goal (cheapest, fastest, explore, the community route), the route it gives
//                 from the player's level, and the shopping list for the route's next step
//   Your history  the tradeskill's combines, pace and the item rows behind them
//   From the guides  the leveling guide's route with the player's level placed on it
//
// The recipes tab's switches: Hide trivial here, "Can make now" and "Missing on the wiki" in
// RecipeFilters.tsx.
//
// The ladder is shared/tradeskillBook.ts, the goal routes shared/tradeskillRoute.ts, the history
// shared/tradeskillHistory.ts, the guide's route shared/tradeskillGuide.ts; this file holds the
// controls and passes their values in.

import { type JSX, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import { Box, Button, FormControlLabel, Stack, Switch, Tab, Tabs, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { SKILLS_MODULE } from '@shared/skills'
import {
  LEVEL_UNSEEN_TEXT,
  benchRecipe,
  ladderEmptyText,
  lineOfRecipe,
  recipeLadder,
  skillRecipes,
  tradeskillLevel,
  unlistedText,
  type BookIndex,
  type Ladder,
  type LadderAsk,
  type LadderState
} from '@shared/tradeskillBook'
import { madeByYouText, madeRecipes, skillHistory, totalsLine } from '@shared/tradeskillHistory'
import { levelBar, type LevelBar } from '@shared/tradeskillLevelBar'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import OutputKindLine from '../../components/OutputKindLine'
import { SearchField } from '../../lib/SearchField'
import type { BenchFacts } from './benchFacts'
import { GuidePanel } from './GuidePanel'
import { HistoryPanel } from './HistoryPanel'
import { RecipeFilterSwitches, useRecipeFilters, type RecipeFilterState } from './RecipeFilters'
import { RecipePanel } from './RecipePanel'
import { RecipeTable, type RowLog } from './RecipeTable'
import { AaPanel } from './AaPanel'
import { useMasteryRank } from './useMasteryRank'
import { RoutePanel } from './RoutePanel'
import { BarOf, CapNote, SkillBar } from './SkillBar'
import { SkillGearPanel } from './SkillGearPanel'
import { useCrafting, useGuides, useHeld, useSkillLevels, type SkillLevels } from './tradeskillData'
import { useBenchMemory, useHideTrivial, type BenchMemory, type BenchTab } from './tradeskillMemory'

/** What Back restores (lib/navReturn): the workbench that was open and where its table stood. */
export interface BenchReturn {
  tradeskill: Tradeskill
  scrollTop: number
}

/** How wide the head's level bar is drawn. */
const HEAD_BAR_WIDTH = 180

/**
 * The level with "of 300" beside it, the bar, and the wiki's "caps at 200" note when it applies.
 * A skill the log never showed keeps its own words, beside an empty bar.
 */
function LevelLine({ bar }: { bar: LevelBar }): JSX.Element {
  return (
    <>
      {bar.level !== null ? (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
          <Typography variant="h6" color="primary" data-testid="tradeskill-level">
            {bar.level}
          </Typography>
          <BarOf bar={bar} />
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-level-unseen">
          {LEVEL_UNSEEN_TEXT}
        </Typography>
      )}
      <Box sx={{ width: HEAD_BAR_WIDTH, flexShrink: 0 }} data-testid="tradeskill-level-bar">
        <SkillBar bar={bar} />
      </Box>
      <CapNote bar={bar} />
    </>
  )
}

interface HeadProps {
  tradeskill: Tradeskill
  levels: SkillLevels
  onHome: () => void
  /** The log's combines of the tradeskill in one line; '' when it shows none. */
  totals: string
}

function BenchHead({ tradeskill, levels, onHome, totals }: HeadProps): JSX.Element {
  const rank = useMasteryRank()
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={onHome} data-testid="tradeskill-home">
        All tradeskills
      </Button>
      <Typography variant="h6" data-testid="tradeskill-name">
        {tradeskill}
      </Typography>
      {/* Until the engine serves the skills module the level is unknown, not unseen: say what the app waits on. */}
      {levels.served ? <LevelLine bar={levelBar(levels.rows, tradeskill, rank)} /> : <LogReadInline module={SKILLS_MODULE} served={false} />}
      <Box sx={{ flexGrow: 1 }} />
      {totals !== '' && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-totals">
          {totals}
        </Typography>
      )}
    </Stack>
  )
}

function BenchTabs({ tab, onTab }: { tab: BenchTab; onTab: (tab: BenchTab) => void }): JSX.Element {
  return (
    <Tabs
      value={tab}
      onChange={(_e, next: BenchTab) => {
        onTab(next)
      }}
      sx={{ minHeight: 32, flexShrink: 0, '& .MuiTab-root': { minHeight: 32, py: 0.5 } }}
    >
      <Tab value="recipes" label="Recipes" data-testid="tradeskill-tab-recipes" />
      <Tab value="route" label="Your route" data-testid="tradeskill-tab-route" />
      <Tab value="history" label="Your history" data-testid="tradeskill-tab-history" />
      <Tab value="guides" label="From the guides" data-testid="tradeskill-tab-guides" />
    </Tabs>
  )
}

interface BarProps {
  query: string
  onQuery: (q: string) => void
  hideTrivial: boolean
  onHideTrivial: (on: boolean) => void
  ladder: Ladder
  /** How many of the tradeskill's listed recipes the log shows made. */
  made: number
  /** "Can make now" and "Missing on the wiki". */
  filters: RecipeFilterState
}

function BenchBar({ query, onQuery, hideTrivial, onHideTrivial, ladder, made, filters }: BarProps): JSX.Element {
  const count = ladder.shown === ladder.total ? `${String(ladder.total)} wiki recipes` : `${String(ladder.shown)} of ${String(ladder.total)} wiki recipes`
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      <SearchField
        query={query}
        onChange={onQuery}
        placeholder="Search items and materials"
        testid="tradeskill-search"
        clearTestid="tradeskill-search-clear"
        ariaLabel="Search recipes by item or material"
        clearLabel="Clear the search"
        sx={{ width: 280 }}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={hideTrivial}
            onChange={(_e, on) => {
              onHideTrivial(on)
            }}
            data-testid="tradeskill-hide-trivial"
          />
        }
        label="Hide trivial"
      />
      <RecipeFilterSwitches state={filters} />
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-count">
        {count}
        {madeByYouText(made)}
      </Typography>
    </Stack>
  )
}

/** The mark of the recipe the panel shows, or null when the table no longer lists it. */
function stateOfPicked(ladder: Ladder, id: string | null): LadderState | null {
  const at = lineOfRecipe(ladder.lines, id)
  const line = at < 0 ? undefined : ladder.lines[at]
  return line?.kind === 'recipe' ? line.state : null
}

interface RecipesProps {
  tradeskill: Tradeskill
  level: number | null
  /** False while the level is not known yet: the table waits to place itself. */
  ready: boolean
  facts: BenchFacts
  memory: BenchMemory
  setMemory: (next: BenchMemory) => void
  restoreTop: number | null
  parkOnLeave: () => boolean
}

/** The recipes tab: the search and the switch, the picked recipe in full, and the recipe book under it. */
function RecipesTab({ tradeskill, level, ready, facts, memory, setMemory, restoreTop, parkOnLeave }: RecipesProps): JSX.Element {
  const { index, held, eraOnly, craft, money } = facts
  const [hideTrivial, setHideTrivial] = useHideTrivial()
  // The search text is deferred, the Bazaar's way, so typing never waits on the list.
  const query = useDeferredValue(memory.query)
  const recipes = skillRecipes(index, tradeskill)
  const filters = useRecipeFilters(facts, recipes)
  const ask = useMemo((): LadderAsk => ({ level, query, hideTrivial, only: filters.only }), [level, query, hideTrivial, filters.only])
  const ladder = useMemo(() => recipeLadder(recipes, ask), [recipes, ask])
  const made = useMemo(() => madeRecipes(craft, recipes), [craft, recipes])
  const log = useMemo((): RowLog => ({ craft, money }), [craft, money])
  // A recipe a link from another tab opened stays in the panel even when the table hides it.
  const picked = benchRecipe(index, ladder, { id: memory.pick, linked: memory.linked })
  const pickedLine = lineOfRecipe(ladder.lines, picked?.id ?? null)
  const onPick = useCallback(
    (id: string) => {
      setMemory({ query: memory.query, pick: id, linked: false, tab: 'recipes' })
    },
    [memory.query, setMemory]
  )
  const parkAs = useCallback((scrollTop: number): BenchReturn => ({ tradeskill, scrollTop }), [tradeskill])
  const empty = ladderEmptyText(ladder, ask, eraOnly)
  return (
    <>
      <BenchBar
        query={memory.query}
        onQuery={(q) => {
          setMemory({ query: q, pick: memory.pick, linked: false, tab: 'recipes' })
        }}
        hideTrivial={hideTrivial}
        onHideTrivial={setHideTrivial}
        ladder={ladder}
        made={made}
        filters={filters}
      />
      {picked !== null && (
        <RecipePanel recipe={picked} state={stateOfPicked(ladder, picked.id)} facts={facts} unlisted={unlistedText(ladder, picked)} />
      )}
      <OutputKindLine kind="inventory" quiet loadedAt={held.readAt} testId="tradeskills-dump-line" />
      {empty !== null ? (
        <Typography variant="body2" data-testid="tradeskill-empty" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
          {empty}
        </Typography>
      ) : (
        <RecipeTable
          lines={ladder.lines}
          pickedId={picked?.id ?? null}
          onPick={onPick}
          anchorLine={pickedLine >= 0 ? pickedLine : ladder.openLine}
          resetKey={`${query}|${String(hideTrivial)}|${String(eraOnly)}|${filters.key}`}
          ready={ready}
          restoreTop={restoreTop}
          parkAs={parkAs}
          parkOnLeave={parkOnLeave}
          log={log}
          makeable={filters.makeable}
        />
      )}
    </>
  )
}

export interface WorkbenchProps {
  tradeskill: Tradeskill
  index: BookIndex
  eraOnly: boolean
  onHome: () => void
  /** Where the table stood when a link left the tab, after Back; null on every other arrival. */
  restoreTop: number | null
}

export function Workbench({ tradeskill, index, eraOnly, onHome, restoreTop }: WorkbenchProps): JSX.Element {
  const levels = useSkillLevels()
  const held = useHeld()
  const guides = useGuides()
  const { craft, money } = useCrafting(index)
  const [memory, setMemory] = useBenchMemory(tradeskill)
  const level = tradeskillLevel(levels.rows, tradeskill)
  const facts = useMemo((): BenchFacts => ({ index, held, eraOnly, craft, money, guides }), [index, held, eraOnly, craft, money, guides])
  const history = useMemo(() => skillHistory(craft, index, tradeskill), [craft, index, tradeskill])
  // Back's scroll position belongs to the table as the reader left it: a change of tab drops it,
  // and the table's unmount then parks nothing over what another tab left in the one Back slot.
  const [restore, setRestore] = useState(restoreTop)
  const awayFromRecipes = useRef(false)
  const parkOnLeave = useCallback(() => !awayFromRecipes.current, [])
  const show = (next: BenchMemory): void => {
    awayFromRecipes.current = next.tab !== 'recipes'
    setRestore(null)
    setMemory(next)
  }
  // A history row and a route step both open their recipe on the recipes tab, as a link in does.
  const openRecipe = (id: string): void => {
    show({ query: '', pick: id, linked: true, tab: 'recipes' })
  }
  return (
    <Stack spacing={1} sx={{ flexGrow: 1, minHeight: 0 }} data-testid="tradeskill-workbench">
      <BenchHead tradeskill={tradeskill} levels={levels} onHome={onHome} totals={totalsLine(history.totals)} />
      <SkillGearPanel tradeskill={tradeskill} held={held} eraOnly={eraOnly} />
      {/* The AAs that bear on this tradeskill, from the wiki's AA table (AaPanel.tsx). */}
      <AaPanel tradeskill={tradeskill} />
      <BenchTabs
        tab={memory.tab}
        onTab={(tab) => {
          show({ ...memory, tab })
        }}
      />
      {memory.tab === 'recipes' && (
        <RecipesTab
          tradeskill={tradeskill}
          level={level}
          ready={levels.served}
          facts={facts}
          memory={memory}
          setMemory={setMemory}
          restoreTop={restore}
          parkOnLeave={parkOnLeave}
        />
      )}
      {memory.tab === 'route' && <RoutePanel tradeskill={tradeskill} level={level} ready={levels.served} facts={facts} onOpenRecipe={openRecipe} />}
      {memory.tab === 'history' && <HistoryPanel tradeskill={tradeskill} facts={facts} history={history} onOpenRecipe={openRecipe} />}
      {memory.tab === 'guides' && <GuidePanel tradeskill={tradeskill} level={level} facts={facts} onOpenRecipe={openRecipe} />}
    </Stack>
  )
}
