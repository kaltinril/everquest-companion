// tradeskills/TradeskillsView.tsx — the Tradeskills section (fork #6; owner, 2026-11-20: "a
// dedicated tradeskill section"). One view, three screens: Home (a tile per tradeskill), a
// workbench (one tradeskill's recipe book) and Make an item (Planner.tsx: one item's plan). Which
// one is up is the tab's own remembered state, so coming back reopens the screen the player left.
//
// Recipes are the committed wiki data, served once by main (`tradeskillBook`); levels are the
// engine's `skills` module; counts held are the inventory dump. Every fold is
// shared/tradeskillBook.ts. Links out go through the app router, so Back comes home here.
//
// Links IN (appRouting `openTradeskills`, from the Loot page, the Bazaar, the Skills tab, the wish
// list, the Gear table and the item card) arrive as a focus: the tradeskill's workbench is opened
// on the recipe the link's item names, and the header shows a Back to the tab the link was on.

import { type JSX, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { recipeForItem, type BookIndex } from '@shared/tradeskillBook'
import { HOME_SUBTITLE } from '@shared/tradeskillHome'
import { withItem, type PlanMemory } from '@shared/tradeskillPlanMemory'
import type { Tradeskill } from '@shared/tradeskills'
import { useBackTarget } from '../../appBack'
import type { AppRouting, NavBack } from '../../appRouting'
import type { View } from '../../appViews'
import { noteBack, takeReturn } from '../../lib/navReturn'
import { Tooltip } from '../../lib/Tooltip'
import type { TradeskillFocus } from '../../lib/tradeskillLink'
import { CURRENT_ERA_LABEL, useEraOnly } from '../planner/plannerData'
import { Planner, PlannerHomePanel, isPlanReturn, type PlanReturn } from './Planner'
import { usePlanMemory, usePlannerOpen } from './plannerMemory'
import { TradeskillsHome } from './TradeskillsHome'
import { Workbench, type BenchReturn } from './Workbench'
import { useBookIndex } from './tradeskillData'
import { DoorsProvider, type TradeskillDoors } from './tradeskillLinks'
import { rememberLinkedPick, useOpenTradeskill } from './tradeskillMemory'

/** The doors the app's router hands the section; the section adds its own (the planner's). */
export type RouterDoors = Omit<TradeskillDoors, 'onPlanRecipe'>

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

/** Which screen is up, and the moves between the three. */
interface Screens {
  /** The open workbench's tradeskill, or null for Home. Kept while the planner is over it. */
  open: Tradeskill | null
  planOpen: boolean
  plan: PlanMemory
  setPlan: (next: PlanMemory) => void
  /** What a Back from a link out restores; null on every other arrival and after any move. */
  returned: BenchReturn | PlanReturn | null
  /** Home (null) or a workbench; closes the planner. */
  show: (next: Tradeskill | null) => void
  /** The planner: on a recipe's item, on an item, or on the plan it remembers. */
  openPlan: (item?: string, recipe?: string) => void
  /** Back from the planner to what it was opened over. */
  closePlan: () => void
}

/**
 * The section's remembered screen state. The Back note is taken in the state initializer,
 * MobsView's way: a Back from a link out restores where the recipe table (or the plan) stood.
 */
function useScreens(): Screens {
  const [open, setOpen] = useOpenTradeskill()
  const [planOpen, setPlanOpen] = usePlannerOpen()
  const [plan, setPlan] = usePlanMemory()
  const [returned, setReturned] = useState<BenchReturn | PlanReturn | null>(() => takeReturn('tradeskills') as BenchReturn | PlanReturn | null)
  const show = useCallback(
    (next: Tradeskill | null): void => {
      setReturned(null)
      setPlanOpen(false)
      setOpen(next)
    },
    [setOpen, setPlanOpen]
  )
  const openPlan = useCallback(
    (item?: string, recipe?: string): void => {
      setReturned(null)
      if (item !== undefined) setPlan(withItem(plan, item, recipe ?? null))
      setPlanOpen(true)
    },
    [plan, setPlan, setPlanOpen]
  )
  const closePlan = useCallback((): void => {
    setReturned(null)
    setPlanOpen(false)
  }, [setPlanOpen])
  return { open, planOpen, plan, setPlan, returned, show, openPlan, closePlan }
}

/** The screen that is up: the planner over everything, else the open workbench, else Home. */
function Screen({ screens, index, eraOnly }: { screens: Screens; index: BookIndex; eraOnly: boolean }): JSX.Element {
  const { open, planOpen, plan, setPlan, returned, show, openPlan, closePlan } = screens
  if (planOpen) {
    const back = { label: open === null ? 'All tradeskills' : `Back to ${open}`, go: closePlan }
    return <Planner index={index} eraOnly={eraOnly} plan={plan} setPlan={setPlan} back={back} onOpenBench={show} restoreTop={isPlanReturn(returned) ? returned.scrollTop : null} />
  }
  if (open === null) {
    const planner: ReactNode = <PlannerHomePanel index={index} eraOnly={eraOnly} plan={plan} onPlan={openPlan} />
    return <TradeskillsHome index={index} onOpen={show} onPlan={openPlan} planner={planner} />
  }
  return (
    <Workbench
      key={open}
      tradeskill={open}
      index={index}
      eraOnly={eraOnly}
      onHome={() => {
        show(null)
      }}
      restoreTop={returned !== null && !isPlanReturn(returned) && returned.tradeskill === open ? returned.scrollTop : null}
    />
  )
}

function TradeskillsView({ doors, nav, arrival }: { doors: RouterDoors; nav: NavBack; arrival: TradeskillArrival }): JSX.Element {
  const [eraOnly, setEraOnly] = useEraOnly()
  const index = useBookIndex(eraOnly)
  const screens = useScreens()
  const { open, planOpen, show, openPlan } = screens
  useArrival(arrival, index, show)
  // "Plan this item" on a workbench's recipe is the section's own door, added to the router's.
  const allDoors = useMemo(
    (): TradeskillDoors => ({
      ...doors,
      onPlanRecipe: (recipe) => {
        openPlan(recipe.key, recipe.id)
      }
    }),
    [doors, openPlan]
  )
  // While a link in waits to be applied no screen is drawn: not the workbench it is about to replace.
  const ready = index !== null && arrival.focus === null
  return (
    <DoorsProvider value={allDoors}>
      <Box data-testid="tradeskills-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <BackToOrigin nav={nav} />
          <Typography variant="h6">Tradeskills</Typography>
          {/* On Home only: what the section draws on, in one line that gives way before the title does. */}
          {ready && open === null && !planOpen && (
            <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }} data-testid="tradeskills-subtitle">
              {HOME_SUBTITLE}
            </Typography>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {/* The planner searches every tradeskill, so it counts what the setting hides across all of them, as Home does. */}
          <EraBar eraOnly={eraOnly} setEraOnly={setEraOnly} hidden={hiddenCount(index, planOpen ? null : open)} />
        </Stack>
        {!ready && <CircularProgress size={20} data-testid="tradeskills-loading" />}
        {ready && <Screen screens={screens} index={index} eraOnly={eraOnly} />}
      </Box>
    </DoorsProvider>
  )
}

/** The Tradeskills tab: nothing on any other view. The check lives here for App.tsx's SpellDrill reason. */
export function TradeskillsTab({ view, viewKey, routing }: { view: View; viewKey: string; routing: AppRouting }): JSX.Element | null {
  const { openLoot, openMob, openMapZone, openMapAt, openGearSearch, tradeskillFocus, clearTradeskillFocus } = routing
  const doors = useMemo(
    (): RouterDoors => ({ onOpenLoot: openLoot, onOpenMob: openMob, onOpenMapZone: openMapZone, onOpenMapAt: openMapAt, onOpenGearSearch: openGearSearch }),
    [openLoot, openMob, openMapZone, openMapAt, openGearSearch]
  )
  const arrival = useMemo((): TradeskillArrival => ({ focus: tradeskillFocus, onConsumed: clearTradeskillFocus }), [tradeskillFocus, clearTradeskillFocus])
  return view === 'tradeskills' ? <TradeskillsView key={viewKey} doors={doors} nav={routing.nav} arrival={arrival} /> : null
}
