// macros/MacroPicker.tsx — the library, searched and narrowed by tag, to put one macro on a button.

import { type JSX, useState } from 'react'
import { List, Stack } from '@mui/material'
import { filterMacros } from '@shared/macros/tags'
import { SearchField } from '../../lib/SearchField'
import { MacroRow, Quiet, TagFilter } from './macroParts'
import type { MacroStore } from './useMacroLibrary'

export function MacroPicker({ store, onPick }: { store: MacroStore; onPick: (macroId: string) => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const rows = filterMacros(store.library.macros, query, tags)
  return (
    <Stack spacing={1} data-testid="macro-slot-picker">
      <SearchField
        query={query}
        onChange={setQuery}
        placeholder="Search your macros"
        testid="macro-slot-search"
        clearTestid="macro-slot-search-clear"
        ariaLabel="Search your macros"
        clearLabel="Clear the search"
        sx={{ width: '100%' }}
      />
      <TagFilter store={store} tags={tags} onTags={setTags} usedOnly />
      {rows.length === 0 && (
        <Quiet testid="macro-slot-no-match">{store.library.macros.length === 0 ? 'No macros in the library yet.' : 'No macro matches. Clear the search or the tags.'}</Quiet>
      )}
      <List dense disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
        {rows.map((m) => (
          <MacroRow
            key={m.id}
            macro={m}
            selected={false}
            testid="macro-slot-choice"
            showTags
            onPick={() => {
              onPick(m.id)
            }}
          />
        ))}
      </List>
    </Stack>
  )
}
