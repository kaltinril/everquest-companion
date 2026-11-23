// tradeskills/HiddenTilesLine.tsx — the one line at the bottom of Tradeskills Home that holds the
// not-in-log tiles the player chose to hide (owner, 2026-11-22). Each name is a button with a plus
// and the line says "click to show", because a row of bare names was once read as comments.

import type { JSX } from 'react'
import AddIcon from '@mui/icons-material/Add'
import { Button, Stack, Typography } from '@mui/material'
import type { TradeskillTile } from '@shared/tradeskillBook'
import { HIDDEN_LINE_LABEL, SHOW_ALL_HIDDEN_TEXT, showTileTip } from '@shared/tradeskillHome'
import type { Tradeskill } from '@shared/tradeskills'
import { Tooltip } from '../../lib/Tooltip'

interface HiddenTilesLineProps {
  tiles: readonly TradeskillTile[]
  onShow: (tradeskill: Tradeskill) => void
  onShowAll: () => void
}

export function HiddenTilesLine({ tiles, onShow, onShowAll }: HiddenTilesLineProps): JSX.Element | null {
  if (tiles.length === 0) return null
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }} data-testid="tradeskills-hidden-line">
      <Typography variant="caption" color="text.secondary">
        {HIDDEN_LINE_LABEL}
      </Typography>
      {tiles.map((tile) => (
        <Tooltip key={tile.tradeskill} title={showTileTip(tile.tradeskill)} describeChild>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon fontSize="inherit" />}
            onClick={() => {
              onShow(tile.tradeskill)
            }}
            sx={{ textTransform: 'none', py: 0 }}
            data-testid={`tradeskill-hidden-${tile.tradeskill}`}
          >
            {tile.tradeskill}
          </Button>
        </Tooltip>
      ))}
      {tiles.length > 1 && (
        <Button size="small" onClick={onShowAll} sx={{ textTransform: 'none', py: 0 }} data-testid="tradeskills-show-all">
          {SHOW_ALL_HIDDEN_TEXT}
        </Button>
      )}
    </Stack>
  )
}
