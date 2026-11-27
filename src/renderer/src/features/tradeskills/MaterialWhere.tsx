// tradeskills/MaterialWhere.tsx — what the player's log and the recipe guide add to a material's
// line on the picked recipe: where it was last bought and for how much (the log's purchase lines),
// the merchant, zone and loc the guide gives for it, and the count held when the log's depot line
// is newer than the inventory dump.
//
// Guide text is another player's: it is drawn as plain text. A merchant or a zone becomes a link
// only when the app's own tables hold that name (tradeskillLinks.tsx). The loc stays text; a
// merchant the Maps tab pins gets "Show on map" after its line (`MerchantMapLink`), which opens
// the map on the mob's own pin, never on the guide's numbers.

import { Fragment, type JSX } from 'react'
import { Box, Chip, Typography } from '@mui/material'
import { heldCount, type BookIngredient } from '@shared/tradeskillBook'
import { GUIDE_TIP, type GuideSource } from '@shared/tradeskillGuide'
import { depotTip, haveNow } from '@shared/tradeskillHistory'
import { lastPaid, ppText } from '@shared/tradeskillMoney'
import { needQty } from '@shared/tradeskillPicked'
import { formatDate, formatDateTime } from '../../lib/formatDate'
import { Tooltip } from '../../lib/Tooltip'
import { useFacts } from './benchFacts'
import { MerchantLink, MerchantMapLink, ZoneLink } from './tradeskillLinks'

const CHIP_SX = { height: 16, fontSize: 10, mr: 0.5 } as const

/** The height of a material line's first line on the picked recipe: the item icon and one line of text. */
export const MATERIAL_LINE = 24

const LOG_TIP = 'From your own log.'

/** Which source a line came from: the player's log, or a community guide. */
export function SourceChip({ kind }: { kind: 'log' | 'guide' }): JSX.Element {
  if (kind === 'log') {
    return (
      <Tooltip title={LOG_TIP}>
        <Chip size="small" variant="outlined" color="success" label="your log" sx={CHIP_SX} data-testid="tradeskill-source-log" />
      </Tooltip>
    )
  }
  return (
    <Tooltip title={GUIDE_TIP}>
      <Chip size="small" variant="outlined" label="guide" sx={CHIP_SX} data-testid="tradeskill-source-guide" />
    </Tooltip>
  )
}

/** Where the player last bought the material, and what one cost there. Nothing when the log shows no purchase. */
export function PaidLine({ ingredient }: { ingredient: BookIngredient }): JSX.Element | null {
  const paid = lastPaid(useFacts().craft, ingredient.key)
  if (paid === null) return null
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-material-paid">
      <SourceChip kind="log" />
      Last bought for {ppText(paid.unit)} each from <MerchantLink name={paid.merchant} zone={paid.zone} />
      {paid.zone !== undefined && (
        <>
          {' in '}
          <ZoneLink zone={paid.zone} />
        </>
      )}
      {` on ${formatDate(paid.ts)}`}
      <MerchantMapLink name={paid.merchant} zone={paid.zone} />
    </Typography>
  )
}

/** A guide's source for a material as words: merchant, what the guide wrote, zone, loc, remarks. */
function SourceWords({ source }: { source: GuideSource }): JSX.Element {
  const parts: { id: string; node: JSX.Element }[] = []
  if (source.merchant !== undefined) parts.push({ id: 'merchant', node: <MerchantLink name={source.merchant} zone={source.zone} /> })
  if (source.sourceText !== undefined) parts.push({ id: 'text', node: <>{source.sourceText}</> })
  if (source.zone !== undefined) parts.push({ id: 'zone', node: <ZoneLink zone={source.zone} /> })
  if (source.loc !== undefined) parts.push({ id: 'loc', node: <>loc {source.loc}</> })
  for (const [i, note] of source.notes.entries()) parts.push({ id: `note${String(i)}`, node: <>{note}</> })
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={part.id}>
          {i > 0 && ', '}
          {part.node}
        </Fragment>
      ))}
    </>
  )
}

/** The recipe guide's merchant, zone and loc for a material. */
export function GuideSourceLine({ source }: { source: GuideSource }): JSX.Element {
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-material-guide">
      <SourceChip kind="guide" />
      <SourceWords source={source} />
      {source.merchant !== undefined && <MerchantMapLink name={source.merchant} zone={source.zone} />}
    </Typography>
  )
}

/**
 * The Have cell: the inventory dump's count, or the log's depot count when that line is newer
 * than the dump, marked and dated. Blank when neither has said what is held. `line` is the
 * height of the row's first line, where the row sets one (the picked recipe's grid).
 */
export function Have({ ingredient, line }: { ingredient: BookIngredient; line?: number }): JSX.Element {
  const { held, craft } = useFacts()
  const dump = held.index === null ? null : { count: heldCount(held.index, ingredient.name), at: held.dumpedAt }
  const have = haveNow(dump, craft.depot.get(ingredient.key))
  if (have === null) return <span />
  const enough = have.count >= needQty(ingredient)
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Typography
        variant="body2"
        align="right"
        sx={{ color: enough ? 'success.main' : 'text.secondary', lineHeight: line === undefined ? undefined : `${String(line)}px` }}
        data-testid="tradeskill-material-have"
      >
        {have.count}
      </Typography>
      {have.source === 'depot' && have.ts !== null && (
        <Tooltip title={depotTip(formatDateTime(have.ts), held.dumpedAt === null ? '' : formatDate(held.dumpedAt))}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.1 }} data-testid="tradeskill-material-have-log">
            log
          </Typography>
        </Tooltip>
      )}
    </Box>
  )
}
