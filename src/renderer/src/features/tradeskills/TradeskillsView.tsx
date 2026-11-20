// tradeskills/TradeskillsView.tsx — the Tradeskills section (fork #6; owner, 2026-11-20: "a
// dedicated tradeskill section"). One view, two screens: Home (a tile per tradeskill) and a
// workbench (one tradeskill's recipe book). Which one is up is the tab's own remembered state,
// so coming back reopens the workbench the player left.
//
// Recipes are the committed wiki data, served once by main (`tradeskillBook`); levels are the
// engine's `skills` module; counts held are the inventory dump. Every fold is
// shared/tradeskillBook.ts. Links out go through the app router, so Back comes home here.

import { type JSX, useMemo, useState } from 'react'
import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import type { BookIndex } from '@shared/tradeskillBook'
import type { Tradeskill } from '@shared/tradeskills'
import type { AppRouting } from '../../appRouting'
import type { View } from '../../appViews'
import { takeReturn } from '../../lib/navReturn'
import { Tooltip } from '../../lib/Tooltip'
import { CURRENT_ERA_LABEL, useEraOnly } from '../planner/plannerData'
import { TradeskillsHome } from './TradeskillsHome'
import { Workbench, type BenchReturn } from './Workbench'
import { useBookIndex } from './tradeskillData'
import { DoorsProvider, type TradeskillDoors } from './tradeskillLinks'
import { useOpenTradeskill } from './tradeskillMemory'

/** The shared Current era toggle (`eq.planner.era`), drawn the Wish list's way, and what it hides here. */
function EraBar({ eraOnly, setEraOnly, hidden }: { eraOnly: boolean; setEraOnly: (v: boolean) => void; hidden: number }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
      {hidden > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="tradeskills-era-hidden">
          {hidden} out of era, hidden
        </Typography>
      )}
      <Tooltip title={`Hide recipes the wiki places outside ${CURRENT_ERA_LABEL}.`}>
        <Chip
          size="small"
          label="Current era"
          data-testid="tradeskills-era-toggle"
          color={eraOnly ? 'primary' : 'default'}
          variant={eraOnly ? 'filled' : 'outlined'}
          onClick={() => {
            setEraOnly(!eraOnly)
          }}
        />
      </Tooltip>
    </Stack>
  )
}

/** How many recipes the era setting hides: the open tradeskill's, or every tradeskill's on Home. */
function hiddenCount(index: BookIndex | null, open: Tradeskill | null): number {
  if (index === null) return 0
  if (open !== null) return index.eraHidden.get(open) ?? 0
  let total = 0
  for (const n of index.eraHidden.values()) total += n
  return total
}

function TradeskillsView({ doors }: { doors: TradeskillDoors }): JSX.Element {
  const [eraOnly, setEraOnly] = useEraOnly()
  const index = useBookIndex(eraOnly)
  const [open, setOpen] = useOpenTradeskill()
  // Taken in the state initializer, MobsView's way: a Back from a link out restores where the
  // recipe table stood. Every other arrival, and any move between screens, drops it.
  const [returned, setReturned] = useState<BenchReturn | null>(() => takeReturn('tradeskills') as BenchReturn | null)
  const show = (next: Tradeskill | null): void => {
    setReturned(null)
    setOpen(next)
  }
  return (
    <DoorsProvider value={doors}>
      <Box data-testid="tradeskills-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6">Tradeskills</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <EraBar eraOnly={eraOnly} setEraOnly={setEraOnly} hidden={hiddenCount(index, open)} />
        </Stack>
        {index === null && <CircularProgress size={20} data-testid="tradeskills-loading" />}
        {index !== null && open === null && <TradeskillsHome index={index} onOpen={show} />}
        {index !== null && open !== null && (
          <Workbench
            key={open}
            tradeskill={open}
            index={index}
            eraOnly={eraOnly}
            onHome={() => {
              show(null)
            }}
            restoreTop={returned?.tradeskill === open ? returned.scrollTop : null}
          />
        )}
      </Box>
    </DoorsProvider>
  )
}

/** The Tradeskills tab: nothing on any other view. The check lives here for App.tsx's SpellDrill reason. */
export function TradeskillsTab({ view, viewKey, routing }: { view: View; viewKey: string; routing: AppRouting }): JSX.Element | null {
  const { openLoot, openMob, openMapZone } = routing
  const doors = useMemo(
    (): TradeskillDoors => ({ onOpenLoot: openLoot, onOpenMob: openMob, onOpenMapZone: openMapZone }),
    [openLoot, openMob, openMapZone]
  )
  return view === 'tradeskills' ? <TradeskillsView key={viewKey} doors={doors} /> : null
}
