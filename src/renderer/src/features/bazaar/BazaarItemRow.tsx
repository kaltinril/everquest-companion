// One row of the Bazaar list, memoized (owner ask, 2026-10-11: typing in the search froze the tab
// for half a second). Measured in the real renderer on 1,353 rows: a keystroke re-rendered every
// row twice, once for the urgent render that shows the character and once for the deferred one
// that filters, and the first alone blocked the main thread for 500 ms. With the row memoized on
// primitive props and the same `BazaarItem` object, a row that stays in the list costs nothing on
// either render, and the sparkline is computed once per item rather than per paint.

import { type JSX, memo, useMemo } from 'react'
import { Chip, Stack, TableCell, TableRow } from '@mui/material'
import { formatPlat, sparkline, type BazaarItem } from '@shared/bazaar'
import { BazaarSparkline } from './BazaarChart'
import { ItemIcon, ItemName, priceOf } from './BazaarItemCells'
import { Move } from './BazaarMove'

export const SPARK_DAYS = 30
/** Every row is this tall (measured in the real renderer on 1,353 rows: 53 px, every one), which is what lets the list be windowed. */
export const ROW_HEIGHT = 53
const COLUMNS = 10
/** The Item cell's content, in px: with the list's tight padding all ten columns fit the default window. */
const ITEM_CELL_MAX = 220

/** The spacer rows that reserve the full scroll height, so only a screenful of rows is mounted (lib/useWindowedRows). */
export function BazaarPadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

interface Props {
  item: BazaarItem
  endDay: string
  picked: boolean
  iconId: number | undefined
  wished: boolean
  /** What the watch chip says (`rowWatchChip`), or null with no watch. A string, so the memo holds. */
  chip: string | null
  /** Picks this row by its key; one callback for every row, so the memo holds. */
  onPick: (key: string) => void
  onOpenLoot: (item: string) => void
}

function ItemRow({ item, endDay, picked, iconId, wished, chip, onPick, onOpenLoot }: Props): JSX.Element {
  const spark = useMemo(() => sparkline(item.points, endDay, SPARK_DAYS), [item, endDay])
  const tiers = item.combined?.tiers.length ?? 1
  return (
    <TableRow hover selected={picked} onClick={() => onPick(item.key)} sx={{ cursor: 'pointer', height: ROW_HEIGHT }} data-testid={`bazaar-row-${item.key}`}>
      <TableCell sx={{ fontWeight: picked ? 700 : 400 }}>
        {/* A bounded box, so a long name or a two-sided watch chip cannot push the last columns off the list. */}
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'nowrap', minWidth: 0, maxWidth: ITEM_CELL_MAX }}>
          <ItemIcon iconId={iconId} />
          <ItemName item={item} onOpenLoot={onOpenLoot} />
          {item.combined !== undefined && (
            <Chip size="small" variant="outlined" label={item.combined.tiers.every((t) => t.tier === 0) ? 'not seen upgraded' : `${tiers} tiers at +${item.combined.at}`} sx={{ height: 18, fontSize: 10, flexShrink: 0 }} />
          )}
          {wished && <Chip size="small" variant="outlined" color="secondary" label="♥ wish" sx={{ height: 18, fontSize: 10, flexShrink: 0 }} data-testid="bazaar-wish-chip" />}
          {chip !== null && <Chip size="small" color="info" label={chip} title={chip} sx={{ height: 18, fontSize: 10, flexShrink: 0, maxWidth: 96 }} data-testid="bazaar-watch-chip" />}
        </Stack>
      </TableCell>
      <TableCell>
        <BazaarSparkline sell={spark.sell} buy={spark.buy} />
      </TableCell>
      <TableCell align="right">{priceOf(item, item.asking)}</TableCell>
      <TableCell align="right">{priceOf(item, item.askingAvg)}</TableCell>
      <TableCell align="right">{priceOf(item, item.askingPredicted)}</TableCell>
      <TableCell align="right">
        <Move f={item.askingMove} />
      </TableCell>
      <TableCell align="right">{priceOf(item, item.offered)}</TableCell>
      <TableCell align="right">{item.sellOffers + item.buyOffers + item.trades}</TableCell>
      <TableCell align="right">{formatPlat(item.volume)}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary' }}>
        {item.lastDay}
      </TableCell>
    </TableRow>
  )
}

export const BazaarItemRow = memo(ItemRow)
