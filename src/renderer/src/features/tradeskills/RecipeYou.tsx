// tradeskills/RecipeYou.tsx — what the player's own log says of a recipe, on the picked recipe's
// panel: the combines made and failed with the raises they gave, the game's own trivial notice,
// what a combine costs at the prices last paid, and what a merchant last paid for the result.
//
// Every number is one a log line stated (shared/tradeskillHistory.ts, shared/tradeskillMoney.ts).
// Where the log has no price, no price is drawn: at most the reason, in words.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import type { CraftedItemRow } from '@shared/crafting'
import type { BookRecipe } from '@shared/tradeskillBook'
import { NOTICE_LABEL, NO_HISTORY_TEXT, historyWords, noticeTip, recipeHistory, trivialNotice } from '@shared/tradeskillHistory'
import { costPartsText, differenceText, noCostText, ppText, type RecipeMoney } from '@shared/tradeskillMoney'
import { formatDate } from '../../lib/formatDate'
import { Tooltip } from '../../lib/Tooltip'
import { useFacts } from './benchFacts'
import { SourceChip } from './MaterialWhere'
import { MerchantLink } from './tradeskillLinks'

const CHIP_SX = { height: 18, fontSize: 10 } as const

/**
 * "trivial for you": the game printed its own notice on a combine of this item. Apart from the
 * level mark (`RecipeTable.StateChip`), which only compares the wiki's trivial with the level.
 */
export function NoticeChip({ row }: { row: CraftedItemRow | null }): JSX.Element | null {
  const notice = trivialNotice(row)
  if (notice === null) return null
  return (
    <Tooltip title={noticeTip(notice.count, notice.ts === null ? '' : formatDate(notice.ts))}>
      <Chip size="small" variant="outlined" color="info" label={NOTICE_LABEL} sx={CHIP_SX} data-testid="tradeskill-notice-chip" />
    </Tooltip>
  )
}

/** The same notice on a recipe line: a small mark, because a chip cut that line's You text. */
export function NoticeMark({ row }: { row: CraftedItemRow | null }): JSX.Element | null {
  const notice = trivialNotice(row)
  if (notice === null) return null
  return (
    <Tooltip title={noticeTip(notice.count, notice.ts === null ? '' : formatDate(notice.ts))}>
      <Box
        component="span"
        aria-label={NOTICE_LABEL}
        sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', mr: 0.5, color: 'info.main' }}
        data-testid="tradeskill-notice-mark"
      >
        <InfoOutlinedIcon sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  )
}

/** The player's combines of the recipe. Nothing until the engine has served the crafting module. */
function YouLine({ recipe }: { recipe: BookRecipe }): JSX.Element | null {
  const { craft } = useFacts()
  if (!craft.served) return null
  const row = recipeHistory(craft, recipe)
  return (
    <Typography variant="body2" color="text.secondary" data-testid="tradeskill-picked-you">
      <SourceChip kind="log" />
      {row === null ? NO_HISTORY_TEXT : `You ${historyWords(row)}. Last combine ${formatDate(row.lastTs)}.`}
    </Typography>
  )
}

/** What one combine costs at the last prices paid, or why no cost is stated; nothing for a recipe with no priced part and no reason. */
function CostLine({ money }: { money: RecipeMoney }): JSX.Element | null {
  const none = noCostText(money)
  if (money.perCombine === null && none === '') return null
  return (
    <Typography variant="body2" color="text.secondary" data-testid="tradeskill-picked-cost">
      <SourceChip kind="log" />
      {money.perCombine === null ? none : `One combine costs ${ppText(money.perCombine)} at the prices you last paid: ${costPartsText(money)}.`}
      {money.perCombine !== null && money.returned.length > 0 && ` Not counted, the wiki says the combine gives it back: ${money.returned.join(', ')}.`}
    </Typography>
  )
}

/** What a merchant last paid for the result, and how that sits against the materials. */
function SaleLine({ money }: { money: RecipeMoney }): JSX.Element | null {
  const { sale } = money
  if (sale === null) return null
  const against = differenceText(money)
  return (
    <Typography variant="body2" color="text.secondary" data-testid="tradeskill-picked-sale">
      <SourceChip kind="log" />
      Last sold for {ppText(sale.lastCopper)} to <MerchantLink name={sale.merchant} />
      {` on ${formatDate(sale.ts)}`}
      {against !== '' && `: ${against}`}.
    </Typography>
  )
}

/** The log's lines for the picked recipe, under its name. */
export function RecipeYou({ recipe }: { recipe: BookRecipe }): JSX.Element {
  const { money } = useFacts()
  const of = money.of(recipe)
  return (
    <Stack spacing={0.25} sx={{ mb: 1 }} data-testid="tradeskill-picked-log">
      <YouLine recipe={recipe} />
      <CostLine money={of} />
      <SaleLine money={of} />
    </Stack>
  )
}
