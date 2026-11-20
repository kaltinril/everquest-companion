// tradeskills/TradeskillsView.tsx — the Tradeskills section (fork #6; owner, 2026-11-20: "a
// dedicated tradeskill section"). One view, two screens: Home (a tile per tradeskill) and a
// workbench (one tradeskill's recipe book). Which one is up is the tab's own remembered state,
// so coming back reopens the workbench the player left.
//
// Recipes are the committed wiki data, served once by main (`tradeskillBook`); levels are the
// engine's `skills` module; counts held are the inventory dump. Every fold is
// shared/tradeskillBook.ts. Links out go through the app router, so Back comes home here.
//
// Links IN (appRouting `openTradeskills`, from the Loot page, the Bazaar, the Skills tab, the wish
// list, the Gear table and the item card) arrive as a focus: the tradeskill's workbench is opened
// on the recipe the link's item names, and the header shows a Back to the tab the link was on.

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { recipeForItem, type BookIndex } from '@shared/tradeskillBook'
import type { Tradeskill } from '@shared/tradeskills'
import { useBackTarget } from '../../appBack'
import type { AppRouting, NavBack } from '../../appRouting'
import type { View } from '../../appViews'
import { noteBack, takeReturn } from '../../lib/navReturn'
import { Tooltip } from '../../lib/Tooltip'
import type { TradeskillFocus } from '../../lib/tradeskillLink'
import { CURRENT_ERA_LABEL, useEraOnly } from '../planner/plannerData'
import { TradeskillsHome } from './TradeskillsHome'
import { Workbench, type BenchReturn } from './Workbench'
import { useBookIndex } from './tradeskillData'
import { DoorsProvider, type TradeskillDoors } from './tradeskillLinks'
import { rememberLinkedPick, useOpenTradeskill } from './tradeskillMemory'

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

/**
 * Back to the tab a link in came from, named (the mob page's button, JOS-43). One expression read
 * by the button and by the mouse's Back button (JOS-201); with no origin parked it draws nothing
 * and reports that it did nothing, so the press falls through. It says where it went
 * (lib/navReturn), so a mob page that sent the reader here comes back as that page.
 */
function BackToOrigin({ nav }: { nav: NavBack }): JSX.Element | null {
  const back = (): boolean => {
    const origin = nav.origin
    if (origin === null || !nav.back()) return false
    noteBack(origin.view)
    return true
  }
  useBackTarget(back)
  if (nav.origin === null) return null
  return (
    <Button size="small" startIcon={<ArrowBackIcon />} onClick={back} data-testid="tradeskills-back">
      Back to {nav.origin.label}
    </Button>
  )
}

/** A link in from another tab: what it asked for, and the router's way to retire it once applied. */
export interface TradeskillArrival {
  focus: TradeskillFocus | null
  onConsumed: () => void
}

/**
 * Applies a link in once the book is here: writes the recipe the link's item names as the
 * workbench's pick, opens that workbench, and retires the focus. The caller draws no screen while
 * a focus waits, so the workbench mounts after the pick is written and reads it like any other.
 * An item with no recipe on that tradeskill opens the workbench as the player left it.
 */
function useArrival(arrival: TradeskillArrival, index: BookIndex | null, show: (next: Tradeskill | null) => void): void {
  const { focus, onConsumed } = arrival
  useEffect(() => {
    if (focus === null || index === null) return
    const recipe = focus.item === undefined ? null : recipeForItem(index, focus.tradeskill, focus.item)
    if (recipe !== null) rememberLinkedPick(focus.tradeskill, recipe.id)
    show(focus.tradeskill)
    onConsumed()
  }, [focus, index, show, onConsumed])
}

function TradeskillsView({ doors, nav, arrival }: { doors: TradeskillDoors; nav: NavBack; arrival: TradeskillArrival }): JSX.Element {
  const [eraOnly, setEraOnly] = useEraOnly()
  const index = useBookIndex(eraOnly)
  const [open, setOpen] = useOpenTradeskill()
  // Taken in the state initializer, MobsView's way: a Back from a link out restores where the
  // recipe table stood. Every other arrival, and any move between screens, drops it.
  const [returned, setReturned] = useState<BenchReturn | null>(() => takeReturn('tradeskills') as BenchReturn | null)
  const show = useCallback(
    (next: Tradeskill | null): void => {
      setReturned(null)
      setOpen(next)
    },
    [setOpen]
  )
  useArrival(arrival, index, show)
  // While a link in waits to be applied no screen is drawn: not the workbench it is about to replace.
  const ready = index !== null && arrival.focus === null
  return (
    <DoorsProvider value={doors}>
      <Box data-testid="tradeskills-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <BackToOrigin nav={nav} />
          <Typography variant="h6">Tradeskills</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <EraBar eraOnly={eraOnly} setEraOnly={setEraOnly} hidden={hiddenCount(index, open)} />
        </Stack>
        {!ready && <CircularProgress size={20} data-testid="tradeskills-loading" />}
        {ready && open === null && <TradeskillsHome index={index} onOpen={show} />}
        {ready && open !== null && (
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
  const { openLoot, openMob, openMapZone, openGearSearch, tradeskillFocus, clearTradeskillFocus } = routing
  const doors = useMemo(
    (): TradeskillDoors => ({ onOpenLoot: openLoot, onOpenMob: openMob, onOpenMapZone: openMapZone, onOpenGearSearch: openGearSearch }),
    [openLoot, openMob, openMapZone, openGearSearch]
  )
  const arrival = useMemo((): TradeskillArrival => ({ focus: tradeskillFocus, onConsumed: clearTradeskillFocus }), [tradeskillFocus, clearTradeskillFocus])
  return view === 'tradeskills' ? <TradeskillsView key={viewKey} doors={doors} nav={routing.nav} arrival={arrival} /> : null
}
