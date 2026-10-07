// THE BAZAAR TAB — what players asked and offered for items in trade chat (owner ask, 2026-10-06).
//
// One line per item, upgrade tier and direction (selling, buying, trading), most recently seen
// first, with the newest day's average and the low, average and high over every day the log holds.
// Opening a line shows it day by day. The numbers are the engine's `bazaar` module; what the parser
// reads and what it leaves out is stated in engine/crates/fold/src/modules/bazaar_parse.rs.

import { type JSX, useMemo, useState } from 'react'
import {
  Box,
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
  formatPlat,
  summarizeBazaar,
  type BazaarDir,
  type BazaarEntry,
  type BazaarSnap
} from '@shared/bazaar'
import { useModule } from '../../lib/useModule'

const DIR_LABEL: Record<BazaarDir, string> = { sell: 'Selling', buy: 'Buying', trade: 'Trading' }

function EntryRow({ e, open, onToggle }: { e: BazaarEntry; open: boolean; onToggle: () => void }): JSX.Element {
  return (
    <>
      <TableRow hover onClick={onToggle} sx={{ cursor: 'pointer' }} data-testid={`bazaar-row-${e.key}`}>
        <TableCell>
          {e.item}
          {e.tier > 0 ? ` +${e.tier}` : ''}
        </TableCell>
        <TableCell>{DIR_LABEL[e.dir]}</TableCell>
        <TableCell>{e.lastDay}</TableCell>
        <TableCell align="right">{formatPlat(e.lastAvg)}</TableCell>
        <TableCell align="right">{formatPlat(e.low)}</TableCell>
        <TableCell align="right">{formatPlat(e.avg)}</TableCell>
        <TableCell align="right">{formatPlat(e.high)}</TableCell>
        <TableCell align="right">{e.offers}</TableCell>
        <TableCell align="right">{e.unpriced}</TableCell>
      </TableRow>
      {open &&
        e.days.map((d) => (
          <TableRow key={d.day} sx={{ '& td': { color: 'text.secondary', borderBottom: 'none' } }}>
            <TableCell sx={{ pl: 4 }} colSpan={2} />
            <TableCell>{d.day}</TableCell>
            <TableCell />
            <TableCell align="right">{formatPlat(d.low)}</TableCell>
            <TableCell align="right">{formatPlat(d.avg)}</TableCell>
            <TableCell align="right">{formatPlat(d.high)}</TableCell>
            <TableCell align="right">{d.n}</TableCell>
            <TableCell align="right">{d.unpriced}</TableCell>
          </TableRow>
        ))}
    </>
  )
}

export default function BazaarView(): JSX.Element {
  const snap = useModule<BazaarSnap>(BAZAAR_MODULE_ID)
  const [text, setText] = useState('')
  const [dir, setDir] = useState<BazaarDir | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const entries = useMemo(() => summarizeBazaar(snap, { text, dir }), [snap, text, dir])

  return (
    <Stack spacing={2} sx={{ p: 2 }} data-testid="bazaar-view">
      <Typography variant="body2" color="text.secondary">
        Prices players asked (selling) and offered (buying) in trade chat, read from your log. A seller
        repeating the same offer in a day counts once. Click a line to see it day by day.
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search items"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          slotProps={{ htmlInput: { 'data-testid': 'bazaar-search' } }}
        />
        <ToggleButtonGroup size="small" exclusive value={dir} onChange={(_e, v: BazaarDir | 'all' | null) => v !== null && setDir(v)}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="sell">Selling</ToggleButton>
          <ToggleButton value="buy">Buying</ToggleButton>
          <ToggleButton value="trade">Trading</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {snap === null ? (
        <Typography variant="body2">Reading your log…</Typography>
      ) : entries.length === 0 ? (
        <Typography variant="body2">No trade offers {text === '' && dir === 'all' ? 'in your log yet' : 'match'}.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell>Last seen</TableCell>
                <TableCell align="right">Latest</TableCell>
                <TableCell align="right">Low</TableCell>
                <TableCell align="right">Average</TableCell>
                <TableCell align="right">High</TableCell>
                <TableCell align="right">Priced</TableCell>
                <TableCell align="right">No price</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <EntryRow key={e.key} e={e} open={open === e.key} onToggle={() => setOpen(open === e.key ? null : e.key)} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  )
}
