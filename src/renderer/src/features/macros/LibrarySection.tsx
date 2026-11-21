// macros/LibrarySection.tsx — the Library section: every macro the app keeps, with a search box,
// tag chips, New and Paste on the left and the picked macro's editor on the right.

import { type JSX, useState } from 'react'
import { Button, Chip, List, Paper, Stack, TextField, Typography } from '@mui/material'
import { addMacro, findMacro, importGameMacros, newMacro, systemMint } from '@shared/macros/library'
import { filterMacros, tagList, toggleTag } from '@shared/macros/tags'
import { parseMacroText } from '@shared/macros/text'
import { validateMacro } from '@shared/macros/validate'
import { SearchField } from '../../lib/SearchField'
import { MacroEditor } from './MacroEditor'
import { MONO_SX, MacroRow, Quiet, TwoPane } from './macroParts'
import { useMacroUi } from './macroUi'
import type { MacroStore } from './useMacroLibrary'

const PASTE_PLACEHOLDER = 'Page3Button1Name=Assist\nPage3Button1Color=0\nPage3Button1Line1=/assist'

interface LibraryProps {
  store: MacroStore
  selected: string | null
  onSelect: (id: string | null) => void
}

/** The box that takes pasted ini lines or another player's shared text. */
function PasteBox({ store, onSelect, onClose }: { store: MacroStore; onSelect: (id: string | null) => void; onClose: () => void }): JSX.Element {
  const ui = useMacroUi()
  const [text, setText] = useState('')
  const importText = (): void => {
    const found = parseMacroText(text)
    if (found.length === 0) {
      ui.notify('No macro found in that text')
      return
    }
    const result = importGameMacros(store.library, found)
    store.change(() => result.library)
    onSelect(result.ids.at(-1) ?? null)
    onClose()
    ui.notify(`${String(result.added)} added, ${String(result.skipped)} already in the library`)
  }
  return (
    <Paper variant="outlined" sx={{ p: 1, bgcolor: 'action.hover' }} data-testid="macros-paste-box">
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          Paste macros copied from an ini file or shared by another player
        </Typography>
        <TextField
          multiline
          minRows={6}
          maxRows={12}
          size="small"
          autoFocus
          value={text}
          placeholder={PASTE_PLACEHOLDER}
          onChange={(e) => {
            setText(e.target.value)
          }}
          slotProps={{ htmlInput: { style: MONO_SX, spellCheck: false } }}
          data-testid="macros-paste-text"
        />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" onClick={importText} data-testid="macros-paste-import">
            Import
          </Button>
          <Button size="small" variant="outlined" onClick={onClose}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}

/** The tag chips over the list: each with how many macros carry it; the picked ones narrow the list. */
function TagFilter({ store, tags, onTags }: { store: MacroStore; tags: string[]; onTags: (tags: string[]) => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" data-testid="macros-tag-filters">
      {tagList(store.library).map(({ tag, count }) => {
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

interface ListProps extends LibraryProps {
  query: string
  tags: string[]
}

function MacroList({ store, selected, onSelect, query, tags }: ListProps): JSX.Element {
  const rows = filterMacros(store.library.macros, query, tags)
  if (store.library.macros.length === 0) return <Quiet testid="macros-empty">No macros yet. Make one, or paste some in.</Quiet>
  if (rows.length === 0) return <Quiet testid="macros-no-match">No macro matches. Clear the search or the tags.</Quiet>
  return (
    <List dense disablePadding sx={{ maxHeight: '60vh', overflow: 'auto' }} data-testid="macros-list">
      {rows.map((m) => (
        <MacroRow
          key={m.id}
          macro={m}
          selected={m.id === selected}
          testid="macro-row"
          toCheck={validateMacro(m).length}
          showTags
          onPick={() => {
            onSelect(m.id)
          }}
        />
      ))}
    </List>
  )
}

export function LibrarySection({ store, selected, onSelect }: LibraryProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [pasting, setPasting] = useState(false)
  /** The macro New just made: its name box takes the focus once. */
  const [fresh, setFresh] = useState<string | null>(null)
  const macro = findMacro(store.library, selected)
  const shown = filterMacros(store.library.macros, query, tags).length
  const create = (): void => {
    const made = newMacro(systemMint, { name: 'New macro' })
    store.change((current) => addMacro(current, made))
    setQuery('')
    setTags([])
    setFresh(made.id)
    onSelect(made.id)
  }
  const pick = (id: string | null): void => {
    setFresh(null)
    onSelect(id)
  }
  const left = (
    <>
      <SearchField
        query={query}
        onChange={setQuery}
        placeholder="Search name, command, note"
        testid="macros-search"
        clearTestid="macros-search-clear"
        ariaLabel="Search macros"
        clearLabel="Clear the search"
        sx={{ width: '100%' }}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" variant="contained" onClick={create} data-testid="macros-new">
          New macro
        </Button>
        <Button
          size="small"
          variant="outlined"
          data-testid="macros-paste-open"
          onClick={() => {
            setPasting(!pasting)
          }}
        >
          Paste macros
        </Button>
        <Typography variant="caption" color="text.secondary" data-testid="macros-count">
          {shown} of {store.library.macros.length}
        </Typography>
      </Stack>
      {pasting && (
        <PasteBox
          store={store}
          onSelect={onSelect}
          onClose={() => {
            setPasting(false)
          }}
        />
      )}
      <TagFilter store={store} tags={tags} onTags={setTags} />
      <MacroList store={store} selected={selected} onSelect={pick} query={query} tags={tags} />
    </>
  )
  const right =
    macro === null ? (
      <Quiet testid="macro-editor-none">Pick a macro on the left, or make a new one.</Quiet>
    ) : (
      <MacroEditor key={macro.id} store={store} macro={macro} onSelect={onSelect} focusName={macro.id === fresh} />
    )
  return <TwoPane left={left} right={right} />
}
