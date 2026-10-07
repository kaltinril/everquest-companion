// BazaarQuotes — who is selling or asking, and what they said (owner ask, 2026-10-07): counted
// offers one line each, newest first, as the engine quoted them. Under the picked item for its
// tier, and on its own as the whole offers list the toolbar's Offers list button shows.

import { type JSX } from 'react'
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { formatPlat, type DayQuote } from '@shared/bazaar'
import { ASK_COLOR, OFFER_COLOR } from './BazaarChart'

const DIR_LABEL = { sell: 'Selling', buy: 'Buying', trade: 'Trading' } as const
/** Lines drawn at once; the CSV export carries every one. */
const SHOWN = 500

function QuoteRow({ q, withItem }: { q: DayQuote; withItem: boolean }): JSX.Element {
  return (
    <TableRow>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
        {q.day.slice(5)} {q.at.slice(0, 5)}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{q.who}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: q.dir === 'sell' ? ASK_COLOR : q.dir === 'buy' ? OFFER_COLOR : 'text.secondary' }}>
        {DIR_LABEL[q.dir]}
      </TableCell>
      {withItem && (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {q.item}
          {q.tier > 0 ? ` +${q.tier}` : ''}
        </TableCell>
      )}
      <TableCell align="right">{formatPlat(q.price)}</TableCell>
      <TableCell sx={{ color: 'text.secondary' }}>{q.msg}</TableCell>
    </TableRow>
  )
}

export default function BazaarQuotes({ quotes, title, withItem = false, maxHeight = 260 }: { quotes: readonly DayQuote[]; title: string; withItem?: boolean; maxHeight?: number }): JSX.Element | null {
  if (quotes.length === 0) return null
  const shown = quotes.slice(0, SHOWN)
  return (
    <Box data-testid={withItem ? 'bazaar-offers' : 'bazaar-quotes'}>
      <Typography variant="caption" color="text.secondary">
        {title}
        {quotes.length > shown.length ? ` (newest ${shown.length} of ${quotes.length}; Export CSV has them all)` : ''}
      </Typography>
      <Box sx={{ maxHeight, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Who</TableCell>
              <TableCell />
              {withItem && <TableCell>Item</TableCell>}
              <TableCell align="right">Price</TableCell>
              <TableCell>What they said</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((q, i) => (
              <QuoteRow key={`${q.day} ${q.at} ${q.who} ${q.item} ${q.tier} ${i}`} q={q} withItem={withItem} />
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
