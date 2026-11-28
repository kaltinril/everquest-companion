// OverviewEditBar — Edit layout's controls (owner, 2026-11-28: "someone should be able to drag/drop
// to place them ... chose the width of the panels 1, 2, 3, or 4 units wide"). The toggle on the
// zone strip, and the bar each card wears while the mode is on: a drag handle, earlier and later
// buttons (the keyboard way to move a card), and the width control. Outside the mode none of this
// is drawn, so a card cannot be dragged by accident.

import type { JSX } from 'react'
import { Box, Button, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt'
import CheckIcon from '@mui/icons-material/Check'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import {
  OVERVIEW_COLUMNS,
  overviewWidgetLabel,
  overviewWidgetMinWidth,
  type OverviewWidgetId,
  type OverviewWidth
} from '@shared/overviewLayout'
import { Tooltip } from '../../lib/Tooltip'
import type { OverviewDrag } from './useOverviewGrid'

/** The zone strip's "Edit layout" toggle. */
export function OverviewEditToggle({
  editing,
  disabled,
  onToggle
}: {
  editing: boolean
  disabled: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <Tooltip title={editing ? 'Finish editing the layout. Pressing Esc does the same.' : 'Drag cards to new places and pick how wide each one is.'}>
      <span>
        <Button
          size="small"
          data-testid="overview-edit-layout"
          aria-pressed={editing}
          variant={editing ? 'contained' : 'text'}
          disableElevation
          disabled={disabled}
          startIcon={editing ? <CheckIcon sx={{ fontSize: 16 }} /> : <ViewQuiltIcon sx={{ fontSize: 16 }} />}
          onClick={onToggle}
          // The strip's own line box, like Customize beside it.
          sx={{ minWidth: 0, py: 0, px: 0.75, lineHeight: 1.4, flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {editing ? 'Done' : 'Edit layout'}
        </Button>
      </span>
    </Tooltip>
  )
}

const WIDTHS: readonly OverviewWidth[] = [1, 2, 3, 4]

export interface OverviewEditProps {
  width: OverviewWidth
  first: boolean
  last: boolean
  drag: OverviewDrag
  onWidth: (w: OverviewWidth) => void
  onStep: (step: -1 | 1) => void
}

/** The bar above a card in Edit layout. */
export function OverviewEditBar({ id, edit }: { id: OverviewWidgetId; edit: OverviewEditProps }): JSX.Element {
  const label = overviewWidgetLabel(id)
  const min = overviewWidgetMinWidth(id)
  const grabbing = edit.drag.drag?.id === id
  return (
    <Stack
      direction="row"
      spacing={0.5}
      data-testid={`overview-edit-bar-${id}`}
      sx={{ alignItems: 'center', minWidth: 0, mb: 0.5, px: 0.25, borderRadius: 1, bgcolor: 'action.hover' }}
    >
      <Tooltip title="Drag this card to a new place on the page." cursor="inherit">
        <Box
          role="button"
          aria-label={`Drag ${label}`}
          data-testid={`overview-drag-${id}`}
          {...edit.drag.handleProps(id)}
          sx={{ display: 'flex', p: 0.25, cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none', color: 'text.secondary' }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </Tooltip>
      <Typography variant="caption" noWrap sx={{ minWidth: 0, flexGrow: 1, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Tooltip title="Move this card one place earlier on the page.">
        <span>
          <IconButton size="small" aria-label={`Move ${label} earlier`} data-testid={`overview-earlier-${id}`} disabled={edit.first} onClick={() => edit.onStep(-1)} sx={{ p: 0.25 }}>
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Move this card one place later on the page.">
        <span>
          <IconButton size="small" aria-label={`Move ${label} later`} data-testid={`overview-later-${id}`} disabled={edit.last} onClick={() => edit.onStep(1)} sx={{ p: 0.25 }}>
            <ArrowForwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={`How many of the ${String(OVERVIEW_COLUMNS)} columns this card spans across the page.`}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={edit.width}
          aria-label={`${label} width`}
          data-testid={`overview-width-${id}`}
          onChange={(_e, w: OverviewWidth | null) => {
            if (w !== null) edit.onWidth(w)
          }}
          sx={{ flexShrink: 0 }}
        >
          {WIDTHS.map((w) => (
            <ToggleButton
              key={w}
              value={w}
              disabled={w < min}
              aria-label={`${label} width ${String(w)}`}
              data-testid={`overview-width-${id}-${String(w)}`}
              sx={{ py: 0, px: 0.75, minWidth: 0, lineHeight: 1.5, fontSize: 12 }}
            >
              {w}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Tooltip>
    </Stack>
  )
}

/** The drop indicator: a bar in the gap on the side of the card the dragged one would land. */
export function DropMarker({ side }: { side: 'before' | 'after' }): JSX.Element {
  return (
    <Box
      data-testid="overview-drop-marker"
      data-side={side}
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        // The grid gap is 12 px; the 4 px bar sits in the middle of it.
        [side === 'before' ? 'left' : 'right']: -8,
        width: 4,
        borderRadius: 2,
        bgcolor: 'primary.main',
        pointerEvents: 'none',
        zIndex: 2
      }}
    />
  )
}
