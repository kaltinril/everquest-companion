// gear/BisStartFrom.tsx — ONE MENU FOR WHERE THE BOARD STARTS: the presets and the player's own named tier
// lists together (owner, 2026-11-24: *"I feel like this should be part of the same feature, there
// should just be an ADD or SAVE Icon next to the stat instead of having 2 sections"*). The save icon
// names the board in force and adds it to the menu (`eq.gear.tierLists`; the same name replaces);
// the bin deletes the list in force. Replaces the separate "My tier lists" box of the first R1 pass.

import { useState, type JSX } from 'react'
import { Button, Chip, IconButton, ListSubheader, MenuItem, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SaveIcon from '@mui/icons-material/Save'
import type { TierSetup } from '@shared/planner/tierChips'
import { PRESET_LABEL, TIER_PRESETS, type TierPreset } from '@shared/planner/tierDefaults'
import { SAVED_NAME_MAX, matchesSaved, readSavedBoards, withLoadedBoard, withSavedBoard, writeSavedBoards, type BisPrefs, type SavedBoard } from './bisPrefs'

export interface BisStartFromProps {
  prefs: BisPrefs
  setPrefs: (p: BisPrefs) => void
  setup: TierSetup
}

const SAVED = 'saved:'

function SaveBox({ anchor, initial, onSave, onClose }: { anchor: HTMLElement; initial: string; onSave: (name: string) => void; onClose: () => void }): JSX.Element {
  const [name, setName] = useState(initial)
  const save = (): void => {
    if (name.trim() !== '') onSave(name)
  }
  return (
    <Popover open anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <Stack spacing={0.75} sx={{ p: 1.5, width: 300 }} data-testid="bis-save-box">
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            autoFocus
            size="small"
            label="Name this tier list"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            slotProps={{ htmlInput: { maxLength: SAVED_NAME_MAX, 'data-testid': 'bis-saved-name' } }}
            sx={{ flex: 1 }}
          />
          <Button size="small" variant="contained" disabled={name.trim() === ''} onClick={save} data-testid="bis-saved-save">Save</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">Saves the tiers, the step, split resists and caps. The same name replaces the old one.</Typography>
      </Stack>
    </Popover>
  )
}

export default function BisStartFrom({ prefs, setPrefs, setup }: BisStartFromProps): JSX.Element {
  const [lists, setLists] = useState<SavedBoard[]>(readSavedBoards)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const current = prefs.list === null ? undefined : lists.find((s) => s.name === prefs.list)
  const edited = current !== undefined ? !matchesSaved(current, setup) : prefs.board !== null
  const store = (next: SavedBoard[]): void => {
    setLists(next)
    writeSavedBoards(next)
  }
  const pick = (value: string): void => {
    if (!value.startsWith(SAVED)) {
      setPrefs({ ...prefs, preset: value as TierPreset, board: null, caps: {}, list: null })
      return
    }
    const saved = lists.find((s) => s.name === value.slice(SAVED.length))
    if (saved !== undefined) setPrefs(withLoadedBoard(prefs, saved))
  }
  const save = (name: string): void => {
    const next = withSavedBoard(lists, name, setup)
    store(next)
    const saved = next.find((s) => s.name.toLowerCase() === name.trim().slice(0, SAVED_NAME_MAX).toLowerCase())
    if (saved !== undefined) setPrefs(withLoadedBoard(prefs, saved))
    setAnchor(null)
  }
  const remove = (): void => {
    if (current === undefined) return
    store(lists.filter((s) => s !== current))
    // The board stays as it is, now the player's own unsaved board.
    setPrefs({ ...prefs, board: { ...setup.board }, list: null })
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <TextField select size="small" label="Start from" value={current === undefined ? prefs.preset : `${SAVED}${current.name}`} onChange={(e) => pick(e.target.value)} sx={{ minWidth: 220 }} slotProps={{ htmlInput: { 'data-testid': 'bis-preset' } }}>
        <ListSubheader>Presets</ListSubheader>
        {TIER_PRESETS.map((p) => <MenuItem key={p} value={p}>{PRESET_LABEL[p]}</MenuItem>)}
        {lists.length > 0 && <ListSubheader>My tier lists</ListSubheader>}
        {lists.map((s) => <MenuItem key={s.name} value={`${SAVED}${s.name}`} data-testid="bis-saved-item">{s.name}</MenuItem>)}
      </TextField>
      <Tooltip title={current === undefined ? 'Save this tier list' : `Save the tier list (as "${current.name}" or a new name)`}>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} data-testid="bis-saved-open" aria-label="Save this tier list">
          <SaveIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {current !== undefined && (
        <Tooltip title={`Delete "${current.name}"`}>
          <IconButton size="small" onClick={remove} data-testid="bis-saved-delete" aria-label="Delete this saved tier list">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {edited && <Chip size="small" color="warning" variant="outlined" label="edited" data-testid="bis-edited" />}
      {anchor !== null && <SaveBox anchor={anchor} initial={current?.name ?? ''} onSave={save} onClose={() => setAnchor(null)} />}
    </Stack>
  )
}
