// tradeskills/ShoppingPanel.tsx — "Shopping list for the next step" beside a workbench's route:
// for a number of combines (remembered), each material with how many the combines take, how many
// are held, how many are still to get, and where it comes from; then the total at the player's
// own prices when the log has every price, and a button that copies the list as plain text.
//
// The list is shared/tradeskillShopping.ts (the roll-up through made and enchanted materials is
// shared/tradeskillMaterials.ts); this file draws its lines. A merchant, a zone and a mob are the
// section's standard links (tradeskillLinks.tsx); a guide's line is the recipe panel's own.

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { NO_NEXT_STEP_TEXT, NO_STEP_RECIPE_TEXT } from '@shared/tradeskillRoute'
import type { RouteFacts, RouteStep } from '@shared/tradeskillRouteStep'
import {
  COMBINES_MAX,
  GUIDE_LIST_TEXT,
  HAVE_UNKNOWN_TEXT,
  NO_LIST_TEXT,
  asCombines,
  haveFromText,
  intoText,
  shoppingCopyText,
  shoppingList,
  toGetText,
  totalText,
  whereText,
  type ShoppingFacts,
  type ShoppingLine,
  type ShoppingList,
  type ShoppingWhere
} from '@shared/tradeskillShopping'
import { logCountsInUse } from '@shared/tradeskillHistory'
import { copyText } from '../../lib/clipboard'
import { formatDate } from '../../lib/formatDate'
import { mergeItemSources, sourcesFor } from '../../lib/itemSources'
import { useMetVersion } from '../../lib/useMetInLog'
import { useFacts } from './benchFacts'
import { GuideSourceLine, PaidLine } from './MaterialWhere'
import { useCombines } from './routeMemory'
import { ItemLabel, MobLink, ZoneList } from './tradeskillLinks'
import { WikiGapLine } from './WikiGap'

/** Material, Need, Have, To buy, Where. */
const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(150px, 2fr) 48px 48px 76px minmax(0, 3fr)',
  columnGap: 1.5,
  alignItems: 'start',
  py: 0.375
} as const

const COPIED_MS = 3000

type CopyState = 'idle' | 'copied' | 'refused'

const COPY_NOTE: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied. Paste it anywhere.',
  refused: 'Could not reach the clipboard: nothing was copied.'
}

/** Where a material drops and is foraged, with the standard mob and zone links. */
function FoundLine({ where }: { where: Extract<ShoppingWhere, { kind: 'found' }> }): JSX.Element {
  const { drops, forage, forageNote } = where
  return (
    <>
      {drops.shown.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-shopping-drops">
          Drops:{' '}
          {drops.shown.map((source, i) => (
            <Box key={`${source.mobPage ?? ''}:${source.mob}`} component="span">
              {i > 0 && '; '}
              <MobLink source={source} />
              {source.zones.length > 0 && (
                <>
                  {' ('}
                  <ZoneList zones={source.zones} />
                  {')'}
                </>
              )}
            </Box>
          ))}
          {drops.more > 0 && ` and ${String(drops.more)} more`}
        </Typography>
      )}
      {(forage.length > 0 || forageNote !== undefined) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-shopping-forage">
          Forage: <ZoneList zones={forage} />
          {forage.length > 0 && forageNote !== undefined && ', '}
          {forageNote}
        </Typography>
      )}
    </>
  )
}

/** Where one material comes from: the strongest fact the list found for it. */
function WhereCell({ line }: { line: ShoppingLine }): JSX.Element {
  const { where } = line
  if (where.kind === 'paid') return <PaidLine ingredient={{ name: line.name, key: line.key }} />
  if (where.kind === 'guide') return <GuideSourceLine source={where.source} />
  if (where.kind === 'found') return <FoundLine where={where} />
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-shopping-where">
      {whereText(where)}
    </Typography>
  )
}

function LineRow({ line }: { line: ShoppingLine }): JSX.Element {
  const into = intoText(line)
  return (
    <Box sx={GRID_SX} data-testid="tradeskill-shopping-line" data-action={line.action}>
      <Box sx={{ minWidth: 0, pl: line.into.length > 0 ? 2 : 0 }}>
        {line.linked ? <ItemLabel name={line.name} /> : <Typography variant="body2">{line.name}</Typography>}
        {into !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {into}
          </Typography>
        )}
      </Box>
      <Typography variant="body2" align="right" data-testid="tradeskill-shopping-need">
        {line.need}
      </Typography>
      <Typography variant="body2" align="right" color={line.short === 0 ? 'success.main' : 'text.secondary'} data-testid="tradeskill-shopping-have">
        {line.have ?? ''}
      </Typography>
      <Typography variant="body2" align="right" sx={{ fontWeight: line.short > 0 ? 700 : 400 }} data-testid="tradeskill-shopping-buy">
        {toGetText(line)}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <WhereCell line={line} />
      </Box>
    </Box>
  )
}

function ColumnHeads(): JSX.Element {
  return (
    <Box sx={{ ...GRID_SX, color: 'text.secondary', borderBottom: 1, borderColor: 'divider', mb: 0.5 }}>
      <Typography variant="caption">Material</Typography>
      <Typography variant="caption" align="right">
        Need
      </Typography>
      <Typography variant="caption" align="right">
        Have
      </Typography>
      <Typography variant="caption" align="right">
        To buy
      </Typography>
      <Typography variant="caption">Where</Typography>
    </Box>
  )
}

/** The number of combines: typed freely, kept once it reads as a whole number in range. */
function CombinesField({ combines, onCombines }: { combines: number; onCombines: (next: number) => void }): JSX.Element {
  const [text, setText] = useState(String(combines))
  return (
    <TextField
      size="small"
      type="number"
      label="Combines"
      value={text}
      onChange={(ev) => {
        setText(ev.target.value)
        if (/^\d+$/.test(ev.target.value.trim())) onCombines(asCombines(ev.target.value))
      }}
      onBlur={() => {
        setText(String(combines))
      }}
      sx={{ width: 110 }}
      slotProps={{ htmlInput: { min: 1, max: COMBINES_MAX, step: 1, 'data-testid': 'tradeskill-shopping-combines', 'aria-label': 'Number of combines' } }}
    />
  )
}

/** Copies the list as plain text through main's clipboard, and says whether it got there. */
function CopyList({ list }: { list: ShoppingList }): JSX.Element {
  const [state, setState] = useState<CopyState>('idle')
  useEffect(() => {
    if (state === 'idle') return undefined
    const timer = setTimeout(() => {
      setState('idle')
    }, COPIED_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [state])
  const copy = useCallback(() => {
    // `copyText` answers false when the clipboard refused; it never throws.
    void copyText(shoppingCopyText(list)).then((ok) => {
      setState(ok ? 'copied' : 'refused')
    })
  }, [list])
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy} data-testid="tradeskill-shopping-copy">
        Copy list
      </Button>
      {state !== 'idle' && (
        <Typography variant="caption" color={state === 'copied' ? 'success.main' : 'warning.main'} role="status" data-testid="tradeskill-shopping-copied" data-state={state}>
          {COPY_NOTE[state]}
        </Typography>
      )}
    </Stack>
  )
}

/** Where the Have column comes from: the dump and its date, and the log's newer depot counts. */
function HaveFrom(): JSX.Element | null {
  const { held, craft } = useFacts()
  const dump = held.index === null ? null : { at: held.dumpedAt }
  const text = haveFromText(held.dumpedAt === null ? null : formatDate(held.dumpedAt), logCountsInUse(craft, dump))
  if (text === '') return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-shopping-have-from">
      {text}
    </Typography>
  )
}

/** The lines, the total, and the notes that say what the list could not know. */
function ListBody({ list }: { list: ShoppingList }): JSX.Element {
  if (list.lines.length === 0) {
    return (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ pt: 2, pb: 0.5 }} data-testid="tradeskill-shopping-empty">
          {NO_LIST_TEXT}
        </Typography>
        <WikiGapLine recipe={list.recipe} />
      </>
    )
  }
  return (
    <>
      {list.fromGuide && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-shopping-guide-list">
          {GUIDE_LIST_TEXT}
        </Typography>
      )}
      {list.fromGuide && <WikiGapLine recipe={list.recipe} />}
      <ColumnHeads />
      {list.lines.map((line) => (
        <LineRow key={line.key} line={line} />
      ))}
      {list.recipe.container !== undefined && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }} data-testid="tradeskill-shopping-container">
          Combined in: {list.recipe.container}
        </Typography>
      )}
      <HaveFrom />
      {!list.haveKnown && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-shopping-have-unknown">
          {HAVE_UNKNOWN_TEXT}
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 600 }} data-testid="tradeskill-shopping-total">
        {totalText(list)}
      </Typography>
    </>
  )
}

export interface ShoppingPanelProps {
  /** The route's next step, or null when the route has none. */
  step: RouteStep | null
  facts: RouteFacts
  /** The Current era setting: out-of-era mobs are left out of a material's drops. */
  eraOnly: boolean
}

/** Why there is no list for the step, or null when it has a recipe to list. */
function noListText(step: RouteStep | null): string | null {
  if (step === null) return NO_NEXT_STEP_TEXT
  return step.recipe === null ? NO_STEP_RECIPE_TEXT : null
}

export function ShoppingPanel({ step, facts, eraOnly }: ShoppingPanelProps): JSX.Element {
  const [combines, setCombines] = useCombines()
  // An out-of-era mob the player's log has met is shown again (lib/useMetInLog).
  const met = useMetVersion()
  const shopping = useMemo((): ShoppingFacts => {
    void met
    return { ...facts, eraOnly, drops: (key) => mergeItemSources(sourcesFor(key), facts.index.materials.get(key)?.dropsFrom) }
  }, [facts, eraOnly, met])
  const recipe = step?.recipe ?? null
  const list = useMemo(() => (recipe === null ? null : shoppingList(shopping, recipe, combines)), [shopping, recipe, combines])
  const none = noListText(step)
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minHeight: 0, overflow: { xs: 'visible', lg: 'auto' }, overscrollBehavior: 'contain' }} data-testid="tradeskill-shopping">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75, mb: 0.75 }}>
        <Typography variant="subtitle2">Shopping list for the next step</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {list !== null && list.lines.length > 0 && <CombinesField combines={combines} onCombines={setCombines} />}
        {list !== null && list.lines.length > 0 && <CopyList list={list} />}
      </Stack>
      {step !== null && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, mb: 0.5 }} data-testid="tradeskill-shopping-for">
          {step.linked ? <ItemLabel name={step.name} bold /> : <Typography variant="body2">{step.name}</Typography>}
          <Typography variant="caption" color="text.secondary">
            {step.range}
          </Typography>
        </Stack>
      )}
      {none !== null && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="tradeskill-shopping-none">
          {none}
        </Typography>
      )}
      {list !== null && <ListBody list={list} />}
    </Paper>
  )
}
