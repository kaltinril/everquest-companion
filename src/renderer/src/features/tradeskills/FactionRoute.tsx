// tradeskills/FactionRoute.tsx - the Faction goal of "Your route" (owner, 2026-11-20: "faction
// based (you're doing it because of the factions you can get from specific turn ins)").
//
// Above the two panes: the factions a turn-in of the open tradeskill raises, as a list to pick
// from (remembered per tradeskill, routeMemory.ts), each entry with how many recipes feed it and,
// when a faction dump is loaded, the player's standing in the Factions tab's own words. Without a
// dump the list still works and the quiet dump line names the command.
//
// The left pane: the picked faction's turn-ins as rows. A row is the made item (the section's
// standard item link), its trivial against the level, the quest (the app's standard wiki link:
// no tab holds a quest page), its giver and zones (the standard mob and Maps links), every
// faction change the quest page states (a loss as plainly as a raise; each name opens the
// Factions tab), and the step facts every route states. The right pane is the shopping list
// (ShoppingPanel.tsx) for the first row, or for the row the reader asks it for.
//
// Which factions, which rows, their order, the marks and every word are
// shared/tradeskillRouteFaction.ts; this file maps over what it returns. The standings are the
// Factions tab's own rows (`useFactionData`: the dump corrected by the log), so a number here is
// the number there.

import { type JSX, type MouseEvent, useMemo, useState } from 'react'
import { Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { inEraQuests } from '@shared/questEra'
import { buildQuestFactionIndex, questFactionKey, type QuestFactionIndex } from '@shared/questFactions'
import type { BookIndex } from '@shared/tradeskillBook'
import { canMakeLabel, canMakeTip } from '@shared/tradeskillHeld'
import { ROUTE_STEP_TIP } from '@shared/tradeskillRoute'
import {
  FACTION_LINK_TEXT,
  QUEST_LINK_TIP,
  SHARED_CHIP_LABEL,
  SHOP_FOR_ROW_LABEL,
  SHOP_FOR_ROW_TIP,
  SHOPPING_ROW_LABEL,
  bookFactionItems,
  buildFactionRoute,
  choiceFacts,
  type FactionChange,
  type FactionChoice,
  type FactionRoute as FactionRouteModel,
  type FactionStep,
  type StandingWords,
  type TurnIn
} from '@shared/tradeskillRouteFaction'
import type { RouteFacts } from '@shared/tradeskillRouteStep'
import type { Tradeskill } from '@shared/tradeskills'
import type { QuestData } from '@shared/types'
import { wikiPageUrl } from '@shared/wiki'
import OutputKindLine from '../../components/OutputKindLine'
import questsJson from '../../data/eqlegends/quests.json'
import { FactionLink } from '../../lib/factionLink'
import { Tooltip } from '../../lib/Tooltip'
import { useFactionData } from '../factions/useFactionRows'
import { EraChip } from '../planner/PlannerChips'
import { useFactionPick } from './routeMemory'
import { ShoppingPanel } from './ShoppingPanel'
import { ItemLabel, MerchantLink, ZoneList } from './tradeskillLinks'

const QUESTS = (questsJson as QuestData).quests

const CHIP_SX = { height: 18, fontSize: 10 } as const

/** The stated raise, then the item and what the data says of the turn-in. */
const ROW_SX = {
  display: 'grid',
  gridTemplateColumns: '72px minmax(0, 1fr)',
  columnGap: 1.5,
  py: 0.75,
  px: 0.5,
  borderBottom: 1,
  borderColor: 'divider',
  cursor: 'pointer',
  '&:hover': { bgcolor: 'action.hover' }
} as const

/** The two panes side by side on a wide window, stacked on a narrow one (RoutePanel's arrangement). */
const PANES_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
  gap: 1.5,
  flexGrow: 1,
  minHeight: 0,
  overflow: { xs: 'auto', lg: 'hidden' }
} as const

const PANE_SX = { p: 1.5, minHeight: 0, overflow: { xs: 'visible', lg: 'auto' }, overscrollBehavior: 'contain' } as const

/** A link or a button inside a row acts alone: the row's own click (open the recipe) does not follow. */
function keepRow(event: MouseEvent): void {
  event.stopPropagation()
}

/** The join for the open book under the era setting. Built once per book and setting: a walk of both catalogs. */
function useTurnIns(index: BookIndex, eraOnly: boolean): QuestFactionIndex {
  return useMemo(() => buildQuestFactionIndex(eraOnly ? inEraQuests(QUESTS) : QUESTS, bookFactionItems(index)), [index, eraOnly])
}

interface Standings {
  /** By the join's faction key; null when no faction dump is loaded. */
  standings: ReadonlyMap<string, StandingWords> | null
  /** When this window last read the dump, for the dump line. */
  readAt: number | null
}

/** The Factions tab's own rows, keyed for the join. */
function useStandings(): Standings {
  const { rows, readAt } = useFactionData()
  const standings = useMemo(
    () => (rows === null ? null : new Map(rows.map((row): [string, StandingWords] => [questFactionKey(row.name), { name: row.name, label: row.label, value: row.standing }]))),
    [rows]
  )
  return { standings, readAt }
}

/** One fact of a row on its own line; nothing when the data states none. */
function Line({ text, id, color }: { text: string; id: string; color?: string }): JSX.Element | null {
  if (text === '') return null
  return (
    <Typography variant="caption" color={color ?? 'text.secondary'} sx={{ display: 'block' }} data-testid={`tradeskill-faction-${id}`}>
      {text}
    </Typography>
  )
}

interface PickerProps {
  route: FactionRouteModel
  picked: FactionChoice
  dumpLoaded: boolean
  onPick: (key: string) => void
}

/** The factions to pick from. An entry: the name, how many recipes feed it, the standing when a dump is loaded. */
function FactionPicker({ route, picked, dumpLoaded, onPick }: PickerProps): JSX.Element {
  return (
    <TextField
      select
      size="small"
      label="Faction"
      value={picked.key}
      onChange={(event) => {
        onPick(event.target.value)
      }}
      sx={{ minWidth: 300 }}
      // The closed field shows the name alone; the open list shows each entry's facts under it.
      slotProps={{ select: { renderValue: () => picked.name } }}
      data-testid="tradeskill-faction-pick"
    >
      {route.choices.map((choice) => (
        <MenuItem key={choice.key} value={choice.key} data-testid="tradeskill-faction-option" data-faction={choice.key}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2">{choice.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {choiceFacts(choice, dumpLoaded)}
            </Typography>
          </Box>
        </MenuItem>
      ))}
    </TextField>
  )
}

interface HeadProps {
  route: FactionRouteModel
  dumpLoaded: boolean
  readAt: number | null
  onPick: (key: string) => void
}

/** The picker with the picked faction's own facts and its door to the Factions tab, then what the order ranks on and what the rows do not know. */
function Head({ route, dumpLoaded, readAt, onPick }: HeadProps): JSX.Element | null {
  const { picked } = route
  if (picked === null) return null
  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
        <FactionPicker route={route} picked={picked} dumpLoaded={dumpLoaded} onPick={onPick} />
        <Typography variant="body2" color="text.secondary" data-testid="tradeskill-faction-picked">
          {choiceFacts(picked, dumpLoaded)}
        </Typography>
        <Typography variant="body2" data-testid="tradeskill-faction-open">
          <FactionLink name={picked.name} openAs={picked.standing?.name ?? picked.name} text={FACTION_LINK_TEXT} />
        </Typography>
        {/* With no dump this is the quiet line that names the command; with one, when it was written and read. */}
        <OutputKindLine kind="faction" quiet loadedAt={readAt} testId="tradeskills-faction-dump-line" />
      </Stack>
      <Typography variant="body2" data-testid="tradeskill-faction-basis">
        {route.basis}
      </Typography>
      {route.caveats.map((caveat) => (
        <Typography key={caveat} variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-faction-caveat">
          {caveat}
        </Typography>
      ))}
    </Box>
  )
}

/** The changes of one direction a quest page states, each faction a link to the Factions tab. */
function Changes({ label, changes, id }: { label: string; changes: readonly FactionChange[]; id: string }): JSX.Element | null {
  if (changes.length === 0) return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid={`tradeskill-faction-${id}`}>
      {label}{' '}
      {changes.map((change, i) => (
        <Box key={change.name} component="span" sx={{ fontWeight: change.picked ? 700 : 400 }} data-testid="tradeskill-faction-change" data-up={change.up}>
          {i > 0 && ', '}
          <FactionLink name={change.name} openAs={change.openAs} />{' '}
          <Box component="span" sx={{ color: change.up ? 'success.main' : 'error.main' }}>
            {change.text}
          </Box>
        </Box>
      ))}
    </Typography>
  )
}

/** The quest: its wiki page, who takes the turn-in, where, and from what level, as far as the page says. */
function QuestLine({ turnIn }: { turnIn: TurnIn }): JSX.Element {
  return (
    <Typography variant="caption" color="text.primary" sx={{ display: 'block' }} data-testid="tradeskill-faction-quest-line">
      Quest:{' '}
      <a href={wikiPageUrl(turnIn.page)} target="_blank" rel="noreferrer" title={QUEST_LINK_TIP} style={{ color: 'inherit' }} onClick={keepRow} data-testid="tradeskill-faction-quest">
        {turnIn.quest}
      </a>
      {turnIn.giver !== undefined && (
        <>
          {' · '}
          <span data-testid="tradeskill-faction-giver">
            <MerchantLink name={turnIn.giver} zone={turnIn.zones.at(0)} />
          </span>
        </>
      )}
      {turnIn.zones.length > 0 && (
        <>
          {' · '}
          <span data-testid="tradeskill-faction-zones">
            <ZoneList zones={turnIn.zones} />
          </span>
        </>
      )}
      {turnIn.minLevel !== undefined && ` · level ${String(turnIn.minLevel)} and up`}
    </Typography>
  )
}

interface RowProps {
  step: FactionStep
  /** The row the shopping list beside is for. */
  shopping: boolean
  onShop: (id: string) => void
  onOpenRecipe: (id: string) => void
}

/** The item with its marks, and the way to put the shopping list on this row. */
function RowHead({ step, shopping, onShop }: Omit<RowProps, 'onOpenRecipe'>): JSX.Element {
  const { turnIn, recipe } = step
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flexWrap: 'wrap', rowGap: 0.25 }}>
      {/* The name opens its Loot page; the click stops here so it does not also open the recipe. */}
      <Box component="span" sx={{ minWidth: 0 }} onClick={keepRow}>
        <ItemLabel name={step.name} bold />
      </Box>
      {recipe !== null && <EraChip subject={recipe} outOnly />}
      {step.canMake > 0 && (
        <Tooltip title={canMakeTip(step.canMake)}>
          <Chip size="small" color="success" variant="outlined" label={canMakeLabel(step.canMake)} sx={CHIP_SX} data-testid="tradeskill-faction-can-make" />
        </Tooltip>
      )}
      {turnIn.shared !== '' && (
        <Tooltip title={turnIn.shared}>
          <Chip size="small" color="warning" variant="outlined" label={SHARED_CHIP_LABEL} sx={CHIP_SX} data-testid="tradeskill-faction-shared-chip" />
        </Tooltip>
      )}
      {shopping && <Chip size="small" color="primary" label={SHOPPING_ROW_LABEL} sx={CHIP_SX} data-testid="tradeskill-faction-shopping" />}
      {!shopping && (
        <Tooltip title={SHOP_FOR_ROW_TIP}>
          <Button
            size="small"
            sx={{ minWidth: 0, py: 0, fontSize: 11 }}
            onClick={(event) => {
              keepRow(event)
              onShop(step.id)
            }}
            data-testid="tradeskill-faction-shop"
          >
            {SHOP_FOR_ROW_LABEL}
          </Button>
        </Tooltip>
      )}
    </Stack>
  )
}

function TurnInRow({ step, shopping, onShop, onOpenRecipe }: RowProps): JSX.Element {
  const { turnIn, recipe } = step
  const open = recipe === null ? undefined : () => onOpenRecipe(recipe.id)
  return (
    <Box sx={ROW_SX} onClick={open} title={ROUTE_STEP_TIP} data-testid="tradeskill-faction-row" data-recipe={recipe?.id ?? ''} data-easy={step.easy} data-shared={turnIn.shared !== ''}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }} data-testid="tradeskill-faction-raise">
        {turnIn.raise.text}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <RowHead step={step} shopping={shopping} onShop={onShop} />
        <Line id="trivial" text={step.range} color="text.primary" />
        <QuestLine turnIn={turnIn} />
        <Line id="era" text={turnIn.eraNote} color="warning.main" />
        <Changes id="raises" label="Raises:" changes={turnIn.raises} />
        <Changes id="losses" label="Lowers:" changes={turnIn.losses} />
        <Line id="shared" text={turnIn.shared} color="warning.main" />
        <Line id="tie" text={turnIn.tie} />
        <Line id="money" text={step.money} />
        <Line id="hand" text={step.handText} />
        <Line id="record" text={step.record} />
      </Box>
    </Box>
  )
}

interface RowListProps {
  route: FactionRouteModel
  /** The row the shopping list is for; null when the route has none. */
  shop: FactionStep | null
  onShop: (id: string) => void
  onOpenRecipe: (id: string) => void
}

/** The picked faction's turn-ins, or why there is none. */
function RowList({ route, shop, onShop, onOpenRecipe }: RowListProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={PANE_SX} data-testid="tradeskill-faction-list">
      <Typography variant="subtitle2">Turn-ins{route.picked === null ? '' : ` that raise ${route.picked.name}`}</Typography>
      {route.empty !== '' && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="tradeskill-faction-empty">
          {route.empty}
        </Typography>
      )}
      {route.steps.map((step) => (
        <TurnInRow key={step.id} step={step} shopping={step === shop} onShop={onShop} onOpenRecipe={onOpenRecipe} />
      ))}
    </Paper>
  )
}

export interface FactionRouteProps {
  tradeskill: Tradeskill
  /** Null: the log has not shown the skill; no recipe then counts as trivial. */
  level: number | null
  facts: RouteFacts
  /** The Current era setting: out-of-era quest pages are left out of the join. */
  eraOnly: boolean
  /** "Only use materials I have": only recipes the held materials cover. */
  heldOnly: boolean
  /** Opens a recipe (by its `id`) on the recipes tab. */
  onOpenRecipe: (id: string) => void
}

export function FactionRoute({ tradeskill, level, facts, eraOnly, heldOnly, onOpenRecipe }: FactionRouteProps): JSX.Element {
  const turnIns = useTurnIns(facts.index, eraOnly)
  const { standings, readAt } = useStandings()
  const [asked, setAsked] = useFactionPick(tradeskill)
  // The row the shopping list is for: the first, until the reader asks for another of this list.
  const [shopId, setShopId] = useState<string | null>(null)
  const route = useMemo(
    () => buildFactionRoute({ ...facts, turnIns, standings }, { tradeskill, level, faction: asked, heldOnly, eraOnly }),
    [facts, turnIns, standings, tradeskill, level, asked, heldOnly, eraOnly]
  )
  const shop = route.steps.find((step) => step.id === shopId) ?? route.next
  return (
    <>
      <Head route={route} dumpLoaded={standings !== null} readAt={readAt} onPick={setAsked} />
      {route.picked === null && (
        // No turn-in of this tradeskill raises a faction: the goal says so, with the tradeskills that have some.
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="tradeskill-faction-none">
          {route.empty}
        </Typography>
      )}
      {route.picked !== null && (
        <Box sx={PANES_SX} data-testid="tradeskill-faction" data-faction={route.picked.key}>
          <RowList route={route} shop={shop} onShop={setShopId} onOpenRecipe={onOpenRecipe} />
          <ShoppingPanel step={shop} facts={facts} eraOnly={eraOnly} />
        </Box>
      )}
    </>
  )
}
