// macros/SetsSection.tsx — the Sets section: named layouts. A set says which library macro sits on
// which button of pages 2 to 10; a click on a button opens a picker over the library.

import { type JSX, useState } from 'react'
import { Box, Button, List, ListItemButton, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { firstLine, systemMint } from '@shared/macros/library'
import { FIRST_EDITABLE_PAGE, PAGES } from '@shared/macros/limits'
import {
  addSet,
  assignSlot,
  duplicateSet,
  filledCount,
  filledOnPage,
  findSet,
  newSet,
  pageSlots,
  removeSet,
  renameSet,
  restoreSet,
  setToGameMacros
} from '@shared/macros/sets'
import { parseSlotKey, renderSocials } from '@shared/macros/socials'
import { filterMacros } from '@shared/macros/tags'
import type { Macro, MacroSet } from '@shared/macros/types'
import { SearchField } from '../../lib/SearchField'
import { MONO_SX, MacroRow, Quiet, TwoPane } from './macroParts'
import { useMacroUi } from './macroUi'
import type { MacroStore } from './useMacroLibrary'

const EDITABLE_PAGES = Array.from({ length: PAGES - FIRST_EDITABLE_PAGE + 1 }, (_, i) => FIRST_EDITABLE_PAGE + i)

function macroCount(n: number): string {
  return n === 1 ? '1 macro' : `${String(n)} macros`
}

interface SetsProps {
  store: MacroStore
  selected: string | null
  onSelect: (id: string | null) => void
}

function SetList({ store, selected, onSelect, onNew }: SetsProps & { onNew: () => void }): JSX.Element {
  const { sets } = store.library
  return (
    <>
      <Stack direction="row">
        <Button size="small" variant="contained" onClick={onNew} data-testid="macro-set-new">
          New set
        </Button>
      </Stack>
      {sets.length === 0 && <Quiet testid="macro-sets-empty">No sets yet.</Quiet>}
      <List dense disablePadding sx={{ maxHeight: '50vh', overflow: 'auto' }}>
        {sets.map((set) => (
          <ListItemButton
            key={set.id}
            selected={set.id === selected}
            data-testid="macro-set-row"
            sx={{ display: 'block', borderRadius: 1 }}
            onClick={() => {
              onSelect(set.id)
            }}
          >
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {set.name === '' ? 'Unnamed set' : set.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {macroCount(filledCount(store.library, set))}
            </Typography>
          </ListItemButton>
        ))}
      </List>
      <Quiet>A set is a layout: which macro sits on which button. One macro can be in many sets.</Quiet>
    </>
  )
}

/** The library, searched, to put on one slot. */
function SlotPicker({ store, slot, onPlace, onClose }: { store: MacroStore; slot: string; onPlace: (macroId: string | null) => void; onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const at = parseSlotKey(slot)
  const rows = filterMacros(store.library.macros, query, [])
  return (
    <Paper variant="outlined" sx={{ p: 1, bgcolor: 'action.hover' }} data-testid="macro-slot-picker">
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2">{at === null ? slot : `Page ${String(at.page)}, button ${String(at.button)}`}</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              color="error"
              data-testid="macro-slot-clear"
              onClick={() => {
                onPlace(null)
              }}
            >
              Clear slot
            </Button>
            <Button size="small" variant="outlined" onClick={onClose}>
              Close
            </Button>
          </Stack>
        </Stack>
        <SearchField
          query={query}
          onChange={setQuery}
          placeholder="Search the library"
          testid="macro-slot-search"
          clearTestid="macro-slot-search-clear"
          ariaLabel="Search the library"
          clearLabel="Clear the search"
          sx={{ width: '100%' }}
        />
        {rows.length === 0 && <Quiet>{store.library.macros.length === 0 ? 'The library has no macros yet.' : 'Nothing matches.'}</Quiet>}
        <List dense disablePadding sx={{ maxHeight: 240, overflow: 'auto' }}>
          {rows.map((m) => (
            <MacroRow
              key={m.id}
              macro={m}
              selected={false}
              testid="macro-slot-choice"
              onPick={() => {
                onPlace(m.id)
              }}
            />
          ))}
        </List>
      </Stack>
    </Paper>
  )
}

function SlotButton({ button, macro, picked, onClick }: { button: number; macro: Macro | null; picked: boolean; onClick: () => void }): JSX.Element {
  return (
    <Button
      variant="outlined"
      color={picked ? 'primary' : 'inherit'}
      onClick={onClick}
      data-testid="macro-slot"
      sx={{
        display: 'block',
        textAlign: 'left',
        textTransform: 'none',
        minWidth: 0,
        minHeight: 64,
        borderStyle: macro === null ? 'dashed' : 'solid',
        borderColor: picked ? 'primary.main' : 'divider'
      }}
    >
      <Typography variant="caption" color="text.secondary" component="div">
        Button {button}
      </Typography>
      {macro === null ? (
        <Typography variant="body2" color="text.secondary">
          Empty
        </Typography>
      ) : (
        <>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {macro.name === '' ? 'Unnamed' : macro.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div" sx={MONO_SX}>
            {firstLine(macro)}
          </Typography>
        </>
      )}
    </Button>
  )
}

/** One page of the picked set: its twelve buttons, and the picker under them while one is open. */
function SlotGrid({ store, set, page }: { store: MacroStore; set: MacroSet; page: number }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const place = (macroId: string | null): void => {
    if (open === null) return
    const slot = open
    store.change((current) => assignSlot(current, set.id, slot, macroId))
    setOpen(null)
  }
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }} data-testid="macro-slot-grid">
        {pageSlots(store.library, set, page).map(({ button, slot, macro }) => (
          <SlotButton
            key={slot}
            button={button}
            macro={macro}
            picked={slot === open}
            onClick={() => {
              setOpen(slot === open ? null : slot)
            }}
          />
        ))}
      </Box>
      {open !== null && (
        <SlotPicker
          key={open}
          store={store}
          slot={open}
          onPlace={place}
          onClose={() => {
            setOpen(null)
          }}
        />
      )}
    </>
  )
}

function SetActions({ store, set, onSelect }: { store: MacroStore; set: MacroSet; onSelect: (id: string | null) => void }): JSX.Element {
  const ui = useMacroUi()
  const duplicate = (): void => {
    const made = duplicateSet(store.library, set.id, systemMint)
    if (made.set === null) return
    store.change(() => made.library)
    onSelect(made.set.id)
    ui.notify('Duplicated')
  }
  const remove = (): void => {
    const { library, undo } = removeSet(store.library, set.id)
    if (undo === null) return
    store.change(() => library)
    onSelect(library.sets.at(0)?.id ?? null)
    ui.notify(`Deleted "${set.name}"`, () => {
      store.change((current) => restoreSet(current, undo))
      onSelect(undo.set.id)
    })
  }
  return (
    <Stack direction="row" spacing={1}>
      <Button size="small" variant="outlined" onClick={duplicate} data-testid="macro-set-duplicate">
        Duplicate
      </Button>
      <Button size="small" variant="outlined" color="error" onClick={remove} data-testid="macro-set-delete">
        Delete
      </Button>
    </Stack>
  )
}

function SetEditor({ store, set, onSelect, focusName }: { store: MacroStore; set: MacroSet; onSelect: (id: string | null) => void; focusName: boolean }): JSX.Element {
  const ui = useMacroUi()
  const [page, setPage] = useState(FIRST_EDITABLE_PAGE)
  return (
    <Stack spacing={1.5} data-testid="macro-set-editor">
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <TextField
          size="small"
          label="Set name"
          value={set.name}
          autoFocus={focusName}
          onFocus={(e) => {
            if (focusName) e.target.select()
          }}
          onChange={(e) => {
            const name = e.target.value
            store.change((current) => renameSet(current, set.id, name))
          }}
          sx={{ flexGrow: 1 }}
          data-testid="macro-set-name"
        />
        <SetActions store={store} set={set} onSelect={onSelect} />
      </Stack>
      <Tabs
        value={page}
        variant="scrollable"
        scrollButtons="auto"
        onChange={(_e, next: number) => {
          setPage(next)
        }}
        sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5, minWidth: 0 } }}
      >
        {EDITABLE_PAGES.map((p) => {
          const filled = filledOnPage(store.library, set, p)
          return <Tab key={p} value={p} label={filled > 0 ? `Page ${String(p)} (${String(filled)})` : `Page ${String(p)}`} data-testid="macro-set-page" />
        })}
      </Tabs>
      <SlotGrid key={page} store={store} set={set} page={page} />
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
        <Quiet testid="macro-set-filled">{filledCount(store.library, set)} slots filled. Page 1 is the game&apos;s own and is left alone.</Quiet>
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-set-copy"
          onClick={() => {
            ui.copy(renderSocials(setToGameMacros(store.library, set)))
          }}
        >
          Copy as [Socials] text
        </Button>
      </Stack>
    </Stack>
  )
}

export function SetsSection({ store, selected, onSelect }: SetsProps): JSX.Element {
  /** The set New just made: its name box takes the focus once. */
  const [fresh, setFresh] = useState<string | null>(null)
  const set = findSet(store.library, selected)
  const create = (): void => {
    const made = newSet(systemMint, 'New set')
    store.change((current) => addSet(current, made))
    setFresh(made.id)
    onSelect(made.id)
  }
  const pick = (id: string | null): void => {
    setFresh(null)
    onSelect(id)
  }
  const right =
    set === null ? (
      <Quiet testid="macro-set-none">Pick a set on the left, or make a new one.</Quiet>
    ) : (
      <SetEditor key={set.id} store={store} set={set} onSelect={onSelect} focusName={set.id === fresh} />
    )
  return <TwoPane left={<SetList store={store} selected={selected} onSelect={pick} onNew={create} />} right={right} />
}
