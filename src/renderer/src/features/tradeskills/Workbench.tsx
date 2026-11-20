// tradeskills/Workbench.tsx — one tradeskill: the level the log last stated, the picked recipe in
// full (the one to make next until the player picks another), and the recipe book under it.
//
// The ladder is shared/tradeskillBook.ts; this file holds the controls and passes their values in.

import { type JSX, useCallback, useDeferredValue, useMemo } from 'react'
import { Box, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { SKILLS_MODULE } from '@shared/skills'
import {
  LEVEL_UNSEEN_TEXT,
  ladderEmptyText,
  lineOfRecipe,
  pickedRecipe,
  recipeLadder,
  skillRecipes,
  tradeskillLevel,
  type BookIndex,
  type Ladder,
  type LadderAsk,
  type LadderState
} from '@shared/tradeskillBook'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import OutputKindLine from '../../components/OutputKindLine'
import { SearchField } from '../../lib/SearchField'
import { RecipePanel, type BenchFacts } from './RecipePanel'
import { RecipeTable } from './RecipeTable'
import { useHeld, useSkillLevels, type SkillLevels } from './tradeskillData'
import { useBenchMemory, useHideTrivial } from './tradeskillMemory'

/** What Back restores (lib/navReturn): the workbench that was open and where its table stood. */
export interface BenchReturn {
  tradeskill: Tradeskill
  scrollTop: number
}

function LevelLine({ level }: { level: number | null }): JSX.Element {
  if (level !== null) {
    return (
      <Typography variant="h6" color="primary" data-testid="tradeskill-level">
        {level}
      </Typography>
    )
  }
  return (
    <Typography variant="body2" color="text.secondary" data-testid="tradeskill-level-unseen">
      {LEVEL_UNSEEN_TEXT}
    </Typography>
  )
}

function BenchHead({ tradeskill, level, levels, onHome }: { tradeskill: Tradeskill; level: number | null; levels: SkillLevels; onHome: () => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={onHome} data-testid="tradeskill-home">
        All tradeskills
      </Button>
      <Typography variant="h6" data-testid="tradeskill-name">
        {tradeskill}
      </Typography>
      {/* Until the engine serves the skills module the level is unknown, not unseen: say what the app waits on. */}
      {levels.served ? <LevelLine level={level} /> : <LogReadInline module={SKILLS_MODULE} served={false} />}
    </Stack>
  )
}

interface BarProps {
  query: string
  onQuery: (q: string) => void
  hideTrivial: boolean
  onHideTrivial: (on: boolean) => void
  ladder: Ladder
}

function BenchBar({ query, onQuery, hideTrivial, onHideTrivial, ladder }: BarProps): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
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
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary" data-testid="tradeskill-count">
        {ladder.shown === ladder.total ? `${String(ladder.total)} wiki recipes` : `${String(ladder.shown)} of ${String(ladder.total)} wiki recipes`}
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
  const [hideTrivial, setHideTrivial] = useHideTrivial()
  const [memory, setMemory] = useBenchMemory(tradeskill)
  // The search text is deferred, the Bazaar's way, so typing never waits on the list.
  const query = useDeferredValue(memory.query)
  const level = tradeskillLevel(levels.rows, tradeskill)
  const ask = useMemo((): LadderAsk => ({ level, query, hideTrivial }), [level, query, hideTrivial])
  const ladder = useMemo(() => recipeLadder(skillRecipes(index, tradeskill), ask), [index, tradeskill, ask])
  const picked = pickedRecipe(ladder, memory.pick)
  const pickedLine = lineOfRecipe(ladder.lines, picked?.id ?? null)
  const facts = useMemo((): BenchFacts => ({ index, held, eraOnly }), [index, held, eraOnly])
  const onPick = useCallback(
    (id: string) => {
      setMemory({ query: memory.query, pick: id })
    },
    [memory.query, setMemory]
  )
  const parkAs = useCallback((scrollTop: number): BenchReturn => ({ tradeskill, scrollTop }), [tradeskill])
  const empty = ladderEmptyText(ladder, ask, eraOnly)
  return (
    <Stack spacing={1} sx={{ flexGrow: 1, minHeight: 0 }} data-testid="tradeskill-workbench">
      <BenchHead tradeskill={tradeskill} level={level} levels={levels} onHome={onHome} />
      <BenchBar
        query={memory.query}
        onQuery={(q) => {
          setMemory({ query: q, pick: memory.pick })
        }}
        hideTrivial={hideTrivial}
        onHideTrivial={setHideTrivial}
        ladder={ladder}
      />
      {picked !== null && <RecipePanel recipe={picked} state={stateOfPicked(ladder, picked.id)} facts={facts} />}
      <OutputKindLine kind="inventory" quiet loadedAt={held.readAt} testId="tradeskills-dump-line" />
      {empty !== null ? (
        <Typography variant="body2" color="text.secondary" data-testid="tradeskill-empty" sx={{ py: 4, textAlign: 'center' }}>
          {empty}
        </Typography>
      ) : (
        <RecipeTable
          lines={ladder.lines}
          pickedId={picked?.id ?? null}
          onPick={onPick}
          anchorLine={pickedLine >= 0 ? pickedLine : ladder.openLine}
          resetKey={`${query}|${String(hideTrivial)}|${String(eraOnly)}`}
          ready={levels.served}
          restoreTop={restoreTop}
          parkAs={parkAs}
        />
      )}
    </Stack>
  )
}
