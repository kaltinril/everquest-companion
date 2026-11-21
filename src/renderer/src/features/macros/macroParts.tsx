// macros/macroParts.tsx — the pieces the Macros tab's two sections share: the list-and-detail
// layout, a quiet line of help, a macro drawn as a list row, the tag chips that narrow a list,
// and the Undo and Redo buttons.

import type { JSX, ReactNode } from 'react'
import { Box, Chip, IconButton, ListItemButton, Paper, Stack, Typography } from '@mui/material'
import RedoIcon from '@mui/icons-material/Redo'
import UndoIcon from '@mui/icons-material/Undo'
import type { ButtonMark } from '@shared/macros/buttons'
import { firstLine } from '@shared/macros/library'
import { tagList, toggleTag, usedTagList } from '@shared/macros/tags'
import type { Macro } from '@shared/macros/types'
import { Tooltip } from '../../lib/Tooltip'
import type { MacroStore } from './useMacroLibrary'

export const MONO_SX = { fontFamily: 'monospace', fontSize: 13 } as const

/** The colour of each mark a button carries against the game's file. */
export const MARK_COLOR: Record<ButtonMark, 'success' | 'warning' | 'error'> = { new: 'success', changed: 'warning', removed: 'error' }

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
  /** Which characters and loadouts hold it, in a few words. */
  where?: string
}

/** One library macro in a list: its name, its first command, and optionally its tags. */
export function MacroRow({ macro, selected, onPick, testid, toCheck = 0, showTags = false, where }: MacroRowProps): JSX.Element {
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
      {where !== undefined && (
        <Typography variant="caption" color="text.secondary" noWrap component="div" data-testid="macro-row-where">
          {where}
        </Typography>
      )}
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

interface TagFilterProps {
  store: MacroStore
  tags: string[]
  onTags: (tags: string[]) => void
  /** Only the tags some macro carries: the short list a picker has room for. */
  usedOnly?: boolean
}

/** The tag chips over a list: each with how many macros carry it; the picked ones narrow the list. */
export function TagFilter({ store, tags, onTags, usedOnly = false }: TagFilterProps): JSX.Element {
  const list = usedOnly ? usedTagList(store.library) : tagList(store.library)
  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" data-testid="macros-tag-filters">
      {list.map(({ tag, count }) => {
        const on = tags.includes(tag)
        return (
          <Chip
            key={tag}
            size="small"
            label={`${tag} ${String(count)}`}
            color={on ? 'primary' : 'default'}
            variant={on ? 'filled' : 'outlined'}
            aria-pressed={on}
            data-testid="macros-tag-filter"
            onClick={() => {
              onTags(toggleTag(tags, tag))
            }}
          />
        )
      })}
    </Stack>
  )
}

/** Undo and Redo for every change to the macros and the layouts (not for a send or a restore). */
export function UndoRedo({ store }: { store: MacroStore }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
      <Tooltip title="Undo the last change to your macros and layouts.">
        <span>
          <IconButton size="small" aria-label="Undo" disabled={!store.canUndo} onClick={store.undo} data-testid="macro-undo">
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Put back the change that Undo just took away.">
        <span>
          <IconButton size="small" aria-label="Redo" disabled={!store.canRedo} onClick={store.redo} data-testid="macro-redo">
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  )
}
