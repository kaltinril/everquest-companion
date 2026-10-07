// THE BAZAAR TAB — what players asked and offered for items in trade chat (owner ask, 2026-10-06).
//
// On top, the picked item: its asking and offered prices now, how far asking has moved, its range,
// and a chart of both by day. Below, every item and tier with a 30-day trend, newest first or in
// the picked order; clicking one picks it. Every number is a median with outliers left out
// (shared/bazaar.ts). What the parser reads is stated in engine/crates/fold/src/modules/bazaar_parse.rs.

import { type JSX, useMemo, useState } from 'react'
import {
  Box,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import {
  BAZAAR_MODULE_ID,
  formatMove,
  formatPlat,
  sparkline,
  summarizeBazaar,
  type BazaarDir,
  type BazaarItem,
  type BazaarSnap,
  type BazaarSort
} from '@shared/bazaar'
import { useModule } from '../../lib/useModule'
import { ASK_COLOR, BazaarChart, BazaarSparkline, OFFER_COLOR } from './BazaarChart'

const SPARK_DAYS = 30
const SORTS: { value: BazaarSort; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'offers', label: 'Most offers' },
  { value: 'price', label: 'Highest price' },
  { value: 'move', label: 'Biggest move' }
]

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

function ItemRow({ item, endDay, picked, onPick }: { item: BazaarItem; endDay: string; picked: boolean; onPick: () => void }): JSX.Element {
  const spark = sparkline(item.points, endDay, SPARK_DAYS)
  return (
    <TableRow hover selected={picked} onClick={onPick} sx={{ cursor: 'pointer' }} data-testid={`bazaar-row-${item.key}`}>
      <TableCell sx={{ fontWeight: picked ? 700 : 400 }}>{nameOf(item)}</TableCell>
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
      <TableCell align="right" sx={{ color: 'text.secondary' }}>
        {item.lastDay}
      </TableCell>
    </TableRow>
  )
}

function Controls(props: {
  text: string
  setText: (v: string) => void
  dir: BazaarDir | 'all'
  setDir: (v: BazaarDir | 'all') => void
  sort: BazaarSort
  setSort: (v: BazaarSort) => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      <TextField
        size="small"
        placeholder="Search items"
        value={props.text}
        onChange={(ev) => props.setText(ev.target.value)}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-search' } }}
      />
      <ToggleButtonGroup size="small" exclusive value={props.dir} onChange={(_e, v: BazaarDir | 'all' | null) => v !== null && props.setDir(v)}>
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="sell">Selling</ToggleButton>
        <ToggleButton value="buy">Buying</ToggleButton>
        <ToggleButton value="trade">Trading</ToggleButton>
      </ToggleButtonGroup>
      <TextField select size="small" label="Sort" value={props.sort} onChange={(ev) => props.setSort(ev.target.value as BazaarSort)} sx={{ minWidth: 160 }}>
        {SORTS.map((s) => (
          <MenuItem key={s.value} value={s.value}>
            {s.label}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  )
}

export default function BazaarView(): JSX.Element {
  const snap = useModule<BazaarSnap>(BAZAAR_MODULE_ID)
  const [text, setText] = useState('')
  const [dir, setDir] = useState<BazaarDir | 'all'>('all')
  const [sort, setSort] = useState<BazaarSort>('recent')
  const [pick, setPick] = useState<string | null>(null)
  const sum = useMemo(() => summarizeBazaar(snap, { text, dir, sort }), [snap, text, dir, sort])
  const picked = sum.items.find((i) => i.key === pick) ?? sum.items.at(0) ?? null

  return (
    <Stack spacing={2} sx={{ p: 2 }} data-testid="bazaar-view">
      <Typography variant="body2" color="text.secondary">
        What players asked (WTS) and offered (WTB) in trade chat, read from your log
        {sum.days > 0 ? `: ${sum.offers} offers over ${sum.days} days` : ''}. Prices are daily medians; a
        seller repeating an offer in a day counts once.
      </Typography>
      <Controls text={text} setText={setText} dir={dir} setDir={setDir} sort={sort} setSort={setSort} />
      {snap === null ? (
        <Typography variant="body2">Reading your log…</Typography>
      ) : picked === null || sum.lastDay === null ? (
        <Typography variant="body2">No trade offers {text === '' && dir === 'all' ? 'in your log yet' : 'match'}.</Typography>
      ) : (
        <>
          <Detail item={picked} endDay={sum.lastDay} />
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell>Last {SPARK_DAYS} days</TableCell>
                  <TableCell align="right">Asking</TableCell>
                  <TableCell align="right">Avg 7 days</TableCell>
                  <TableCell align="right">Predicted</TableCell>
                  <TableCell align="right">Change</TableCell>
                  <TableCell align="right">Offered</TableCell>
                  <TableCell align="right">Offers</TableCell>
                  <TableCell align="right">Last seen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sum.items.map((i) => (
                  <ItemRow key={i.key} item={i} endDay={sum.lastDay ?? i.lastDay} picked={i.key === picked.key} onPick={() => setPick(i.key)} />
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Stack>
  )
}
