// OpenTabButton — a widget's link to its tab, in the header's own line box (the DPS card's
// "Open in Combat" pattern). It routes through a callback; the card never navigates by itself.

import type { JSX } from 'react'
import { Button } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

export function OpenTabButton({ label, testId, onOpen }: { label: string; testId: string; onOpen: () => void }): JSX.Element {
  return (
    <Button
      size="small"
      data-testid={testId}
      endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
      onClick={onOpen}
      // The DPS card's line box, so every card in a rank starts its body on one baseline.
      sx={{ minWidth: 0, py: 0, px: 0.75, lineHeight: 1.4 }}
    >
      {label}
    </Button>
  )
}
