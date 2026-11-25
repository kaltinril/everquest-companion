// gear/BisSavedLists.tsx — NAMED TIER LISTS (owner, 2026-11-24: *"should be able to save the users Teir
// list settings, let them NAME them too"*). Saves the board in force (lanes, the step, split resists,
// caps) under a name at `eq.gear.tierLists`; picking one puts it in force; the bin deletes it. The
// same name saved again replaces the old one.

import { useState, type JSX } from 'react'
import { Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import type { TierSetup } from '@shared/planner/tierChips'
import { SAVED_NAME_MAX, readSavedBoards, withSavedBoard, writeSavedBoards, type SavedBoard } from './bisPrefs'

export interface BisSavedListsProps {
  setup: TierSetup
  onLoad: (saved: SavedBoard) => void
}

export default function BisSavedLists({ setup, onLoad }: BisSavedListsProps): JSX.Element {
  const [list, setList] = useState<SavedBoard[]>(readSavedBoards)
  const [picked, setPicked] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const store = (next: SavedBoard[]): void => {
    setList(next)
    writeSavedBoards(next)
  }
  const save = (): void => {
    const clean = name.trim()
    if (clean === '') {
      setMsg('Type a name first.')
      return
    }
    const replaced = list.some((s) => s.name.toLowerCase() === clean.toLowerCase())
    store(withSavedBoard(list, clean, setup))
    setPicked(clean.slice(0, SAVED_NAME_MAX))
    setName('')
    setMsg(replaced ? `Replaced "${clean}".` : `Saved "${clean}".`)
  }
  const load = (value: string): void => {
    setPicked(value)
    const saved = list.find((s) => s.name === value)
    if (saved !== undefined) {
      onLoad(saved)
      setMsg(`Loaded "${saved.name}".`)
    }
  }
  const remove = (): void => {
    store(list.filter((s) => s.name !== picked))
    setMsg(`Deleted "${picked}".`)
    setPicked('')
  }
  return (
    <Stack spacing={0.5} data-testid="bis-saved">
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="My tier lists"
          value={picked}
          onChange={(e) => load(e.target.value)}
          disabled={list.length === 0}
          sx={{ minWidth: 170, flex: 1 }}
          slotProps={{ htmlInput: { 'data-testid': 'bis-saved-pick' } }}
        >
          {list.length === 0 && <MenuItem value="">none saved yet</MenuItem>}
          {list.map((s) => (
            <MenuItem key={s.name} value={s.name}>{s.name}</MenuItem>
          ))}
        </TextField>
        <Tooltip title={picked === '' ? 'Pick a saved list to delete it' : `Delete "${picked}"`}>
          <span>
            <IconButton size="small" disabled={picked === ''} onClick={remove} data-testid="bis-saved-delete" aria-label="Delete the saved list">
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="name this tier list"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          slotProps={{ htmlInput: { maxLength: SAVED_NAME_MAX, 'data-testid': 'bis-saved-name' } }}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <Button size="small" variant="outlined" onClick={save} data-testid="bis-saved-save">Save</Button>
      </Stack>
      {msg !== '' && <Typography variant="caption" color="text.secondary">{msg}</Typography>}
    </Stack>
  )
}
