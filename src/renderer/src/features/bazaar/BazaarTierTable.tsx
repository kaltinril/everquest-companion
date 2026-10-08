// BazaarTierTable — a combined item's tiers (shared/bazaarTiers.ts): what each was actually asked
// and offered at beside the estimate the combined +0 price gives it, so the guess can be checked
// against the tiers that were priced and read for the ones that were not.

import { type JSX } from 'react'
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { formatPlat, type CombinedTiers } from '@shared/bazaar'

export default function BazaarTierTable({ c }: { c: CombinedTiers }): JSX.Element {
  return (
    <Box data-testid="bazaar-tiers">
      <Typography variant="caption" color="text.secondary">
        Every tier read as +{c.at}: each tier adds about {Math.round((c.rate - 1) * 100)}% for this item
      </Typography>
      <Table size="small" sx={{ maxWidth: 560 }}>
        <TableHead>
          <TableRow>
            <TableCell>Tier</TableCell>
            <TableCell align="right">Asking</TableCell>
            <TableCell align="right">Offered</TableCell>
            <TableCell align="right">Offers</TableCell>
            <TableCell align="right">Estimate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {c.tiers.map((t) => (
            <TableRow key={t.tier}>
              <TableCell>+{t.tier}</TableCell>
              <TableCell align="right">{formatPlat(t.asking)}</TableCell>
              <TableCell align="right">{formatPlat(t.offered)}</TableCell>
              <TableCell align="right">{t.offers}</TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary' }}>
                {formatPlat(t.estimate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
