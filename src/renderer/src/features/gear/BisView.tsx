// gear/BisView.tsx — THE BEST IN SLOT TAB (Malkil and the owner, 2026-11-24; plans/2026-11-24-bis-sheet.md,
// mockup v2 at https://claude.ai/artifact/AbgMQrf34tMdfGBqHpAu9k is the reference).
//
// IT OWNS THE LAYOUT AND THE CHOICES. The scoring is shared/planner/tierWeights.ts, the defaults
// tierDefaults.ts, the sheet bisSheet.ts; what is worn is the Gear tab's own join (`useGearCompare`,
// read at base), the classes are the area's shared pick (`useGearClasses`, with the Gear tab's
// "detected" chip), and the board is stored at `eq.gear.tiers`, where the Gear tab's BEST column
// reads it too. Named boards are `eq.gear.tierLists` (BisSavedLists.tsx).

import { useCallback, useMemo, type JSX } from 'react'
import { Box, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { CLASS_ABBRS, type ClassAbbr } from '@shared/classCombo'
import { ITEM_UPGRADE_BASE } from '@shared/itemUpgrade'
import { alignPairsToWorn, buildBisSheet, usableBy } from '@shared/planner/bisSheet'
import type { GearRow } from '@shared/planner/gear'
import { activeChips, type TierChip, type TierSetup } from '@shared/planner/tierChips'
import { GUIDE_CREDIT, PRESET_LABEL, TIER_PRESETS, type TierPreset } from '@shared/planner/tierDefaults'
import type { TierModel } from '@shared/planner/tierWeights'
import type { PlanSlotId } from '@shared/planner/types'
import { classDisplayName } from '@shared/spellLevels'
import type { View } from '../../appViews'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import OutputKindLine from '../../components/OutputKindLine'
import { useWishlist } from '../wishlist/useWishlist'
import { wishFromGear } from '../wishlist/wishSearch'
import BisCells, { BisTotals, type BisWishes, type WornCell } from './BisCells'
import BisSavedLists from './BisSavedLists'
import { activeSetup, clampLevel, withCleared, withLoadedBoard, withPasted, withSplit, type BisPrefs } from './bisPrefs'
import { loadoutTotals, ownedCopies, totalsRows } from './bisText'
import { useEraHidden, useGearClasses, useGearCompare, useGearIndex, useGearOwnership, type GearClasses, type GearCompareData } from './gearData'
import TierBoard from './TierBoard'
import { useBisPrefs, useTierModel } from './useBisData'

export interface BisViewProps {
  onOpenLoot?: (item: string) => void
}

/** What is worn in each cell (the dump's join), with the item data's row when it knows the item. */
function useWorn(compare: GearCompareData): { cells: Map<PlanSlotId, WornCell>; rows: GearRow[] } {
  return useMemo(() => {
    const cells = new Map<PlanSlotId, WornCell>()
    const rows: GearRow[] = []
    for (const [cell, host] of compare.equipped) {
      const row = compare.byKey.get(host.key)
      if (row !== undefined) rows.push(row)
      cells.set(cell, { name: host.name, tier: host.tier, row })
    }
    return { cells, rows }
  }, [compare])
}

/** The chips some item the player could wear states: the rest are drawn faded. */
function useStated(rows: readonly GearRow[], model: TierModel, classes: readonly ClassAbbr[], admit: (r: GearRow) => boolean): Set<TierChip> {
  return useMemo(() => {
    const out = new Set<TierChip>()
    for (const row of rows) {
      if (!usableBy(row, classes) || !admit(row)) continue
      for (const [chip, v] of Object.entries(model.valuesOf(row))) if (v !== 0) out.add(chip as TierChip)
    }
    return out
  }, [rows, model, classes, admit])
}

/** The wish list's door, the Gear table's way (`useGearWishes` in GearView.tsx). */
function useBisWishes(): BisWishes {
  const wishlist = useWishlist()
  const entries = wishlist.list.entries
  const wished = useMemo(() => new Set(entries.map((e) => e.itemKey)), [entries])
  const { add, remove } = wishlist
  const onToggle = useCallback((row: GearRow, wasWished: boolean) => (wasWished ? remove(row.key) : add(wishFromGear(row, Date.now()))), [add, remove])
  return { wished, onToggle: wishlist.ready ? onToggle : undefined }
}

function Controls({ prefs, setPrefs, classes }: { prefs: BisPrefs; setPrefs: (p: BisPrefs) => void; classes: GearClasses }): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="bis-controls">
        <ChipMultiSelect options={CLASS_ABBRS} value={classes.classes} onChange={classes.set} label="Classes" placeholder="every class" optionLabel={classDisplayName} minWidth={190} testId="bis-classes" />
        {classes.offer !== null && (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`detected: ${classes.offer.map(classDisplayName).join(', ')}`}
            data-testid="bis-class-offer"
            title="What the app currently infers you are running. Click to rank for it."
            onClick={classes.adopt}
          />
        )}
        <TextField select size="small" label="Start from" value={prefs.preset} onChange={(e) => setPrefs({ ...prefs, preset: e.target.value as TierPreset, board: null, caps: {} })} sx={{ minWidth: 200 }} slotProps={{ htmlInput: { 'data-testid': 'bis-preset' } }}>
          {TIER_PRESETS.map((p) => <MenuItem key={p} value={p}>{PRESET_LABEL[p]}</MenuItem>)}
        </TextField>
        <Chip size="small" variant="outlined" label="Reset board" data-testid="bis-reset" onClick={() => setPrefs({ ...prefs, board: null, caps: {} })} />
        {prefs.board !== null && <Chip size="small" color="warning" variant="outlined" label="edited" data-testid="bis-edited" />}
        <TextField size="small" type="number" label="Level" value={prefs.level} onChange={(e) => setPrefs({ ...prefs, level: clampLevel(Number(e.target.value)) })} sx={{ width: 90 }} slotProps={{ htmlInput: { min: 1, max: 70, 'data-testid': 'bis-level' } }} />
        <Chip size="small" label="Current era" data-testid="bis-era" color={prefs.era ? 'primary' : 'default'} variant={prefs.era ? 'filled' : 'outlined'} onClick={() => setPrefs({ ...prefs, era: !prefs.era })} />
        <Chip size="small" label="Owned only" data-testid="bis-owned" color={prefs.owned ? 'primary' : 'default'} variant={prefs.owned ? 'filled' : 'outlined'} onClick={() => setPrefs({ ...prefs, owned: !prefs.owned })} />
      </Stack>
      {prefs.preset === 'classes' && (
        <Typography variant="caption" color="text.secondary" data-testid="bis-credit">
          {GUIDE_CREDIT}
        </Typography>
      )}
    </Stack>
  )
}

export default function BisView({ onOpenLoot }: BisViewProps = {}): JSX.Element {
  const { rows, ready, refused } = useGearIndex()
  const classes = useGearClasses()
  const [prefs, setPrefs] = useBisPrefs()
  const { eraHidden } = useEraHidden()
  const ownership = useGearOwnership()
  const compare = useGearCompare(rows, ITEM_UPGRADE_BASE)
  const model = useTierModel(rows, classes.classes, prefs.level)
  const wishes = useBisWishes()
  const setup = useMemo(() => activeSetup(prefs, classes.classes), [prefs, classes.classes])
  const owned = useMemo(() => ownedCopies(ownership.map), [ownership.map])
  const admit = useMemo(() => (prefs.era ? (r: GearRow) => !eraHidden(r) : () => true), [prefs.era, eraHidden])
  const worn = useWorn(compare)
  const built = useMemo(
    () => buildBisSheet({ rows, setup, model, classes: classes.classes, admit, owned: prefs.owned ? owned : undefined }),
    [rows, setup, model, classes.classes, admit, owned, prefs.owned]
  )
  const sheet = useMemo(() => alignPairsToWorn(built, (cell) => worn.cells.get(cell)?.row?.key), [built, worn])
  const stated = useStated(rows, model, classes.classes, admit)
  const totals = useMemo(() => totalsRows(sheet.totals, loadoutTotals(worn.rows, model, setup.split), setup), [sheet, worn, model, setup])
  const lane = (chip: TierChip, tier: TierSetup['board'][TierChip]): void => setPrefs({ ...prefs, board: { ...setup.board, [chip]: tier } })
  const cap = (chip: TierChip, value: number | undefined): void => {
    const caps: Partial<Record<TierChip, number>> = Object.fromEntries(Object.entries(prefs.caps).filter(([k]) => k !== chip))
    if (value !== undefined) caps[chip] = value
    setPrefs({ ...prefs, caps, board: setup.board })
  }

  if (!ready || refused) {
    return <Typography color="text.secondary" sx={{ p: 2 }} data-testid="bis-empty">{refused ? 'The item data could not be read, so nothing can be ranked.' : 'Reading the item database…'}</Typography>
  }
  return (
    <Box data-testid="bis-view" sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minHeight: 0, overflow: 'auto', pr: 0.5 }}>
      <OutputKindLine kind="inventory" quiet testId="bis-dump-line" />
      <Controls prefs={prefs} setPrefs={setPrefs} classes={classes} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 440px) minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Stack spacing={1.5}>
          <TierBoard
            setup={setup}
            model={model}
            level={prefs.level}
            stated={stated}
            onLane={lane}
            onCap={cap}
            onStep={(step) => setPrefs({ ...prefs, step })}
            onSplit={() => setPrefs(withSplit(prefs))}
            onClear={() => setPrefs(withCleared(prefs))}
            onLoad={(text) => {
              const next = withPasted(prefs, classes.classes, text)
              if (next !== undefined) setPrefs(next)
              return next !== undefined
            }}
          />
          <BisSavedLists setup={setup} onLoad={(saved) => setPrefs(withLoadedBoard(prefs, saved))} />
        </Stack>
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" data-testid="bis-summary">
            {`${String(sheet.filled)} of ${String(sheet.cells.length)} slots filled · board total ${sheet.total.toFixed(1)} · ${String(activeChips(setup.split).filter((c) => setup.board[c] !== 'Off').length)} stats count`}
          </Typography>
          <BisCells sheet={sheet} worn={worn.cells} model={model} setup={setup} classes={classes.classes} owned={owned} wishes={wishes} onOpenLoot={onOpenLoot} />
          <Typography variant="caption" color="text.secondary">
            Hover a slot to compare its best item with what you wear and see where it drops; click it for the next five. An amber border means the best item is not what you wear. Haste does not stack: a slot is credited only for haste above what your other slots give. Weapon ratios count only in Primary, Secondary and Range, never in an Any slot. A Lore item is placed once; any other item may fill both rings, both ears, both wrists.
          </Typography>
        </Stack>
      </Box>
      <BisTotals rows={totals} />
    </Box>
  )
}

/** The view check lives here, as the Skills tab's does, so App.tsx pays one line for it. */
export function BisTab({ view, viewKey, onOpenLoot }: { view: View; viewKey: string; onOpenLoot?: (item: string) => void }): JSX.Element | null {
  return view === 'bis' ? <BisView key={viewKey} onOpenLoot={onOpenLoot} /> : null
}
