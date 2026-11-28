// OverviewCustomize — the "Customize" button and its checklist: every Overview card, on or off,
// in the order the page draws them (plan Phase 1). Every change is saved at once through
// `useOverviewLayout`; there is nothing to apply and nothing to cancel.

import type { JSX } from 'react'
import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  Typography
} from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import {
  defaultOverviewLayout,
  isDefaultOverviewLayout,
  moveOverviewWidget,
  overviewWidgetLabel,
  setOverviewWidgetOn,
  type OverviewLayout,
  type OverviewWidgetEntry
} from '@shared/overviewLayout'
import { Tooltip } from '../../lib/Tooltip'

interface RowProps {
  entry: OverviewWidgetEntry
  first: boolean
  last: boolean
  layout: OverviewLayout
  onSave: (next: OverviewLayout) => void
}

function WidgetRow({ entry, first, last, layout, onSave }: RowProps): JSX.Element {
  const label = overviewWidgetLabel(entry.id)
  return (
    <ListItem
      disableGutters
      data-testid={`overview-customize-row-${entry.id}`}
      secondaryAction={
        <>
          <IconButton
            size="small"
            aria-label={`Move ${label} up`}
            data-testid={`overview-customize-up-${entry.id}`}
            disabled={first}
            onClick={() => {
              onSave(moveOverviewWidget(layout, entry.id, -1))
            }}
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Move ${label} down`}
            data-testid={`overview-customize-down-${entry.id}`}
            disabled={last}
            onClick={() => {
              onSave(moveOverviewWidget(layout, entry.id, 1))
            }}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </>
      }
      sx={{ py: 0, pr: 10 }}
    >
      <Checkbox
        size="small"
        checked={entry.on}
        data-testid={`overview-customize-check-${entry.id}`}
        slotProps={{ input: { 'aria-label': label } }}
        onChange={(e) => {
          onSave(setOverviewWidgetOn(layout, entry.id, e.target.checked))
        }}
      />
      <Typography variant="body2" sx={{ color: entry.on ? 'text.primary' : 'text.secondary' }}>
        {label}
      </Typography>
    </ListItem>
  )
}

export function OverviewCustomize({ layout, onSave }: { layout: OverviewLayout | null; onSave: (next: OverviewLayout) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip title="Choose which cards Overview shows, and the order they appear in.">
        <span>
          <Button
            size="small"
            data-testid="overview-customize"
            startIcon={<TuneIcon sx={{ fontSize: 16 }} />}
            disabled={layout === null}
            onClick={() => {
              setOpen(true)
            }}
            // The strip's own line box, so adding the button does not make the strip taller.
            sx={{ minWidth: 0, py: 0, px: 0.75, lineHeight: 1.4, flexShrink: 0 }}
          >
            Customize
          </Button>
        </span>
      </Tooltip>
      <Dialog
        open={open && layout !== null}
        onClose={() => {
          setOpen(false)
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Overview cards</DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.5 }}>
            Saved at once, the same for every character on this computer.
          </Typography>
          <List dense disablePadding data-testid="overview-customize-list">
            {layout?.widgets.map((entry, i) => (
              <WidgetRow
                key={entry.id}
                entry={entry}
                first={i === 0}
                last={i === layout.widgets.length - 1}
                layout={layout}
                onSave={onSave}
              />
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            data-testid="overview-customize-reset"
            disabled={layout === null || isDefaultOverviewLayout(layout)}
            onClick={() => {
              onSave(defaultOverviewLayout())
            }}
          >
            Reset
          </Button>
          <Button
            data-testid="overview-customize-done"
            onClick={() => {
              setOpen(false)
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
