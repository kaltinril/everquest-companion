// macros/MacroPicker.tsx — the library, searched and narrowed by tag or by who holds a macro, to put
// one macro on a button.

import { type JSX, useMemo, useState } from 'react'
import { List, MenuItem, Stack, TextField } from '@mui/material'
import type { CharacterFileMacros } from '@shared/macros/types'
import { fromChoices, holdersText, macroHolders, pickList } from '@shared/macros/where'
import { SearchField } from '../../lib/SearchField'
import { MacroRow, Quiet, TagFilter } from './macroParts'
import type { MacroStore } from './useMacroLibrary'

interface PickerProps {
  store: MacroStore
  /** Every character file of the game folder: where each row says its macro sits. */
  files: readonly CharacterFileMacros[]
  onPick: (macroId: string) => void
}

function noMatchText(empty: boolean, from: string): string {
  if (empty) return 'No macros in the library yet.'
  return from === '' ? 'No macro matches. Clear the search or the tags.' : 'No macro matches. Clear the search, the tags or From.'
}

export function MacroPicker({ store, files, onPick }: PickerProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const holders = useMemo(() => macroHolders(store.library, files), [store.library, files])
  const choices = fromChoices(store.library, files)
  // A loadout that left the game folder falls back to every macro rather than an empty box.
  const shownFrom = choices.some((c) => c.value === from) ? from : ''
  const rows = pickList(store.library.macros, { query, tags, from: shownFrom, holders })
  return (
    <Stack spacing={1} data-testid="macro-slot-picker">
      <SearchField
        query={query}
        onChange={setQuery}
        placeholder="Search by name, command, tag or character"
        testid="macro-slot-search"
        clearTestid="macro-slot-search-clear"
        ariaLabel="Search your macros"
        clearLabel="Clear the search"
        sx={{ width: '100%' }}
      />
      <TextField
        select
        size="small"
        label="From"
        value={shownFrom}
        onChange={(e) => {
          setFrom(e.target.value)
        }}
        slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
        data-testid="macro-from"
      >
        <MenuItem value="">All macros</MenuItem>
        {choices.map((c) => (
          <MenuItem key={c.value} value={c.value} data-testid="macro-from-choice">
            {c.label}
          </MenuItem>
        ))}
      </TextField>
      <TagFilter store={store} tags={tags} onTags={setTags} usedOnly />
      {rows.length === 0 && <Quiet testid="macro-slot-no-match">{noMatchText(store.library.macros.length === 0, shownFrom)}</Quiet>}
      <List dense disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
        {rows.map((m) => (
          <MacroRow
            key={m.id}
            macro={m}
            selected={false}
            testid="macro-slot-choice"
            showTags
            where={holdersText(holders, m.id)}
            onPick={() => {
              onPick(m.id)
            }}
          />
        ))}
      </List>
    </Stack>
  )
}
