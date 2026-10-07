// THE BAZAAR TAB — what players asked and offered for items in trade chat (owner ask, 2026-10-06).
//
// On top, the picked item: its asking and offered prices now, how far asking has moved, its range,
// and a chart of both by day. Below, every item and tier with a 30-day trend, newest first or in
// the picked order; clicking one picks it. Every number is a median with outliers left out
// (shared/bazaar.ts). What the parser reads is stated in engine/crates/fold/src/modules/bazaar_parse.rs.

import { type JSX, useMemo, useState } from 'react'
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material'
import { itemTierKey } from '@shared/itemStats'
import { findWatch, type BazaarWatch, type BazaarWatchlist } from '@shared/bazaarWatch'
import {
  BAZAAR_MODULE_ID,
  formatMove,
  formatPlat,
  sparkline,
  summarizeBazaar,
  type BazaarItem,
  type BazaarSnap,
  type BazaarSort,
  type BazaarSortKey
} from '@shared/bazaar'
import { useModule } from '../../lib/useModule'
import { itemIconUrl } from '../../lib/ItemWindow'
import { useWishlist } from '../wishlist/useWishlist'
import { ASK_COLOR, BazaarChart, BazaarSparkline, OFFER_COLOR } from './BazaarChart'
import BazaarControls, { type BazaarControlState, type BazaarShow } from './BazaarControls'
import BazaarWatchPanel from './BazaarWatchPanel'
import { useHeardAlerts } from './BazaarWatcher'
import { useBazaarWatch } from './useBazaarWatch'
import { useItemIcons } from './useItemIcons'

const SPARK_DAYS = 30
/** The list's columns, each sortable; numbers sort biggest first on the first click. */
const COLUMNS: { key: BazaarSortKey; label: string; right: boolean }[] = [
  { key: 'item', label: 'Item', right: false },
  { key: 'trend', label: `Last ${SPARK_DAYS} days`, right: false },
  { key: 'asking', label: 'Asking', right: true },
  { key: 'askingAvg', label: 'Avg 7 days', right: true },
  { key: 'askingPredicted', label: 'Predicted', right: true },
  { key: 'move', label: 'Change', right: true },
  { key: 'offered', label: 'Offered', right: true },
  { key: 'offers', label: 'Offers', right: true },
  { key: 'volume', label: 'Traded 30d', right: true },
  { key: 'lastDay', label: 'Last seen', right: true }
]

function SortHead({ sort, onSort }: { sort: BazaarSort; onSort: (s: BazaarSort) => void }): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        {COLUMNS.map((c) => {
          const on = sort.key === c.key
          return (
            <TableCell key={c.key} align={c.right ? 'right' : 'left'} sortDirection={on ? (sort.desc ? 'desc' : 'asc') : false}>
              <TableSortLabel
                active={on}
                direction={on && !sort.desc ? 'asc' : 'desc'}
                onClick={() => onSort({ key: c.key, desc: on ? !sort.desc : c.key !== 'item' })}
                data-testid={`bazaar-sort-${c.key}`}
              >
                {c.label}
              </TableSortLabel>
            </TableCell>
          )
        })}
      </TableRow>
    </TableHead>
  )
}

const nameOf = (i: BazaarItem): string => `${i.item}${i.tier > 0 ? ` +${i.tier}` : ''}`

/** A move up or down, in the status words rather than color alone. */
function Move({ f }: { f: number | null }): JSX.Element | null {
  if (f === null || Math.round(f * 100) === 0) return null
  const up = f > 0
  return (
    <Typography component="span" variant="body2" sx={{ color: up ? 'success.main' : 'warning.main' }}>
      {up ? '▲' : '▼'} {formatMove(f)}
    </Typography>
  )
}

function Tile({ label, value, color, children }: { label: string; value: string; color?: string; children?: JSX.Element | null }): JSX.Element {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        {color !== undefined && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
        {children}
      </Stack>
    </Box>
  )
}

const PRICE_HEADS = ['Now (median)', '7-day average', 'Predicted today']

interface PriceLine {
  label: string
  color: string
  now: number | null
  avg: number | null
  pred: number | null
  move?: number | null
}

/** Asking and offered, each now, averaged over the week and predicted, in one small grid. */
function PriceGrid({ item }: { item: BazaarItem }): JSX.Element {
  const line = (l: PriceLine): JSX.Element => (
    <>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: l.color }} />
        <Typography variant="body2" color="text.secondary">
          {l.label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h6">{formatPlat(l.now)}</Typography>
        {l.move !== undefined && <Move f={l.move} />}
      </Stack>
      <Typography variant="h6">{formatPlat(l.avg)}</Typography>
      <Typography variant="h6">{formatPlat(l.pred)}</Typography>
    </>
  )
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto repeat(3, minmax(110px, auto))', columnGap: 4, rowGap: 0.5, alignItems: 'center' }} data-testid="bazaar-prices">
      <Box />
      {PRICE_HEADS.map((h) => (
        <Typography key={h} variant="caption" color="text.secondary">
          {h}
        </Typography>
      ))}
      {line({ label: 'Asking (selling)', color: ASK_COLOR, now: item.asking, avg: item.askingAvg, pred: item.askingPredicted, move: item.askingMove })}
      {line({ label: 'Offered (buying)', color: OFFER_COLOR, now: item.offered, avg: item.offeredAvg, pred: item.offeredPredicted })}
    </Box>
  )
}

function Detail({ item, endDay }: { item: BazaarItem; endDay: string }): JSX.Element {
  const lows = item.points.map((p) => p.sell.low ?? Infinity)
  const highs = item.points.map((p) => p.sell.high ?? -Infinity)
  const low = Math.min(...lows)
  const high = Math.max(...highs)
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="bazaar-detail">
      <Stack spacing={2}>
        <Stack direction="row" alignItems="baseline" spacing={1.5} flexWrap="wrap">
          <Typography variant="h6">{nameOf(item)}</Typography>
          <Typography variant="body2" color="text.secondary">
            last seen {item.lastDay}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
          <PriceGrid item={item} />
          <Tile label="Asking range" value={Number.isFinite(low) ? `${formatPlat(low)} to ${formatPlat(high)}` : '-'} />
          <Tile label="Offers seen" value={String(item.sellOffers + item.buyOffers + item.trades)}>
            <Typography component="span" variant="caption" color="text.secondary">
              {item.sellOffers} selling · {item.buyOffers} buying{item.trades > 0 ? ` · ${item.trades} trade` : ''}
            </Typography>
          </Tile>
        </Stack>
        <BazaarWatchPanel item={item} />
        <BazaarChart item={item} endDay={endDay} />
        <Typography variant="caption" color="text.disabled">
          Predicted: a trend through the last ten priced days, newer and busier days counting more,
          read on the log&apos;s newest day ({endDay}) and kept within half to double the recent median.
        </Typography>
        {item.outliers > 0 && (
          <Typography variant="caption" color="text.disabled">
            {item.outliers} price(s) more than four times away from this item&apos;s usual price are left out.
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}

/** The item's icon, the Gear tab's way: hidden when the image fails or the page names none. */
function ItemIcon({ iconId }: { iconId: number | undefined }): JSX.Element {
  if (iconId === undefined) return <Box sx={{ width: 22, flexShrink: 0 }} />
  return (
    <Box
      component="img"
      src={itemIconUrl(iconId)}
      alt=""
      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none'
      }}
      sx={{ width: 22, height: 22, imageRendering: 'pixelated', flexShrink: 0 }}
    />
  )
}

const WATCH_CHIP: Record<BazaarWatch['status'], { label: string; color: 'success' | 'info' | 'default' }> = {
  buy: { label: 'Buy', color: 'success' },
  sell: { label: 'Sell', color: 'info' },
  watch: { label: 'Watch', color: 'default' }
}

interface RowMarks {
  iconId: number | undefined
  wished: boolean
  watch: BazaarWatch | null
}

function ItemRow({ item, endDay, picked, onPick, marks }: { item: BazaarItem; endDay: string; picked: boolean; onPick: () => void; marks: RowMarks }): JSX.Element {
  const spark = sparkline(item.points, endDay, SPARK_DAYS)
  const chip = marks.watch === null ? null : WATCH_CHIP[marks.watch.status]
  return (
    <TableRow hover selected={picked} onClick={onPick} sx={{ cursor: 'pointer' }} data-testid={`bazaar-row-${item.key}`}>
      <TableCell sx={{ fontWeight: picked ? 700 : 400 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
          <ItemIcon iconId={marks.iconId} />
          <span>{nameOf(item)}</span>
          {marks.wished && <Chip size="small" variant="outlined" color="secondary" label="♥ wish" sx={{ height: 18, fontSize: 10 }} data-testid="bazaar-wish-chip" />}
          {chip !== null && <Chip size="small" color={chip.color} label={chip.label} sx={{ height: 18, fontSize: 10 }} data-testid="bazaar-watch-chip" />}
        </Stack>
      </TableCell>
      <TableCell>
        <BazaarSparkline sell={spark.sell} buy={spark.buy} />
      </TableCell>
      <TableCell align="right">{formatPlat(item.asking)}</TableCell>
      <TableCell align="right">{formatPlat(item.askingAvg)}</TableCell>
      <TableCell align="right">{formatPlat(item.askingPredicted)}</TableCell>
      <TableCell align="right">
        <Move f={item.askingMove} />
      </TableCell>
      <TableCell align="right">{formatPlat(item.offered)}</TableCell>
      <TableCell align="right">{item.sellOffers + item.buyOffers + item.trades}</TableCell>
      <TableCell align="right">{formatPlat(item.volume)}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary' }}>
        {item.lastDay}
      </TableCell>
    </TableRow>
  )
}

/** The watch alerts raised this session, so one missed with the banner closed is still here. */
function HeardAlerts(): JSX.Element | null {
  const heard = useHeardAlerts()
  if (heard.length === 0) return null
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="bazaar-heard">
      <Typography variant="caption" color="text.secondary">
        Watch alerts this session
      </Typography>
      {heard.map((a) => (
        <Typography key={a.seq} variant="body2">
          <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
            {a.at.slice(11)}
          </Box>
          {a.text}
        </Typography>
      ))}
    </Paper>
  )
}

/** Which items the Show picker keeps; undefined keeps all. */
function keeperOf(show: BazaarShow, wished: ReadonlySet<string>, watch: BazaarWatchlist): ((item: string, tier: number) => boolean) | undefined {
  if (show === 'all') return undefined
  if (show === 'wish') return (item) => wished.has(itemTierKey(item))
  return (item, tier) => {
    const w = findWatch(watch, item, tier)
    return w !== null && (show === 'watched' || w.status === show)
  }
}

const START: BazaarControlState = { text: '', dir: 'all', show: 'all', popular: false, minPrice: 0 }

export default function BazaarView(): JSX.Element {
  const snap = useModule<BazaarSnap>(BAZAAR_MODULE_ID)
  const wishes = useWishlist()
  const { list: watch } = useBazaarWatch()
  const [ctl, setCtl] = useState<BazaarControlState>(START)
  const [sort, setSort] = useState<BazaarSort>({ key: 'lastDay', desc: true })
  const [pick, setPick] = useState<string | null>(null)
  const wished = useMemo(() => new Set(wishes.ready ? wishes.list.entries.map((e) => e.itemKey) : []), [wishes])
  const keep = useMemo(() => keeperOf(ctl.show, wished, watch), [ctl.show, wished, watch])
  const sum = useMemo(
    () => summarizeBazaar(snap, { text: ctl.text, dir: ctl.dir, sort, keep, minPrice: ctl.minPrice }),
    [snap, ctl.text, ctl.dir, ctl.minPrice, sort, keep]
  )
  const names = useMemo(() => [...new Set(sum.items.map((i) => i.item))], [sum.items])
  const iconOf = useItemIcons(names)
  const picked = sum.items.find((i) => i.key === pick) ?? sum.items.at(0) ?? null
  const set = (patch: Partial<BazaarControlState>): void => {
    const next = { ...ctl, ...patch }
    // Popular ranks by platinum traded, and leaves out what sells for under a platinum.
    if (patch.popular === true) {
      setSort({ key: 'volume', desc: true })
      if (next.minPrice === 0) next.minPrice = 1
    }
    setCtl(next)
  }
  const onSort = (next: BazaarSort): void => {
    setSort(next)
    if (ctl.popular && next.key !== 'volume') setCtl({ ...ctl, popular: false })
  }
  const filtered = ctl.text !== '' || ctl.dir !== 'all' || ctl.show !== 'all' || ctl.minPrice > 0

  return (
    <Stack spacing={2} sx={{ p: 2 }} data-testid="bazaar-view">
      <Typography variant="body2" color="text.secondary">
        What players asked (WTS) and offered (WTB) in trade chat, read from your log
        {sum.days > 0 ? `: ${sum.offers} offers over ${sum.days} days` : ''}. Prices are daily medians; a
        seller repeating an offer in a day counts once.
      </Typography>
      <BazaarControls state={ctl} set={set} />
      <HeardAlerts />
      {snap === null ? (
        <Typography variant="body2">Reading your log…</Typography>
      ) : picked === null || sum.lastDay === null ? (
        <Typography variant="body2">No trade offers {filtered ? 'match' : 'in your log yet'}.</Typography>
      ) : (
        <>
          <Detail item={picked} endDay={sum.lastDay} />
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" stickyHeader>
              <SortHead sort={sort} onSort={onSort} />
              <TableBody>
                {sum.items.map((i) => (
                  <ItemRow
                    key={i.key}
                    item={i}
                    endDay={sum.lastDay ?? i.lastDay}
                    picked={i.key === picked.key}
                    onPick={() => setPick(i.key)}
                    marks={{ iconId: iconOf(i.item), wished: wished.has(itemTierKey(i.item)), watch: findWatch(watch, i.item, i.tier) }}
                  />
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Stack>
  )
}
