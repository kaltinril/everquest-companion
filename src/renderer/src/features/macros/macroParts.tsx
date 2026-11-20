// macros/macroParts.tsx — the pieces the Macros tab's three sections share: the list-and-detail
// layout, a quiet line of help, and a macro drawn as a list row.

import type { JSX, ReactNode } from 'react'
import { Box, Chip, ListItemButton, Paper, Stack, Typography } from '@mui/material'
import { firstLine } from '@shared/macros/library'
import type { Macro } from '@shared/macros/types'

export const MONO_SX = { fontFamily: 'monospace', fontSize: 13 } as const

/** A list on the left, the picked thing on the right; one column in a narrow window. */
export function TwoPane({ left, right }: { left: ReactNode; right: ReactNode }): JSX.Element {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(280px, 360px) minmax(0, 1fr)' },
        gap: 2,
        alignItems: 'start'
      }}
    >
      <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
        <Stack spacing={1.25}>{left}</Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
        <Stack spacing={1.5}>{right}</Stack>
      </Paper>
    </Box>
  )
}

export function Quiet({ children, testid }: { children: ReactNode; testid?: string }): JSX.Element {
  return (
    <Typography variant="body2" color="text.secondary" data-testid={testid}>
      {children}
    </Typography>
  )
}

interface MacroRowProps {
  macro: Macro
  selected: boolean
  onPick: () => void
  testid: string
  /** How many warnings the macro has; a chip says so when it is not 0. */
  toCheck?: number
  showTags?: boolean
}

/** One library macro in a list: its name, its first command, and optionally its tags. */
export function MacroRow({ macro, selected, onPick, testid, toCheck = 0, showTags = false }: MacroRowProps): JSX.Element {
  const line = firstLine(macro)
  return (
    <ListItemButton selected={selected} onClick={onPick} data-testid={testid} sx={{ display: 'block', borderRadius: 1, py: 0.75 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {macro.name === '' ? 'Unnamed' : macro.name}
        </Typography>
        {toCheck > 0 && <Chip size="small" color="warning" variant="outlined" label={`${String(toCheck)} to check`} data-testid="macro-row-to-check" />}
      </Stack>
      <Typography variant="body2" color="text.secondary" noWrap sx={MONO_SX}>
        {line === '' ? 'no commands yet' : line}
      </Typography>
      {showTags && macro.tags.length > 0 && (
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
          {macro.tags.map((tag) => (
            <Chip key={tag} size="small" variant="outlined" label={tag} />
          ))}
        </Stack>
      )}
    </ListItemButton>
  )
}
