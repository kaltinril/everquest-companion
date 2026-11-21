// macros/SpellFinder.tsx — "Find a spell" in the macro editor: type a name, pick a spell, and its
// game id goes into the last command line used. Main searches the player's own spell file, and
// nothing is asked until the control is opened.

import { type JSX, useEffect, useState } from 'react'
import { Button, List, ListItemButton, ListItemText, Stack } from '@mui/material'
import { type SpellNames, memSpellIds } from '@shared/macros/memSpell'
import type { SpellIdRow } from '@shared/macros/spellIds'
import { SearchField } from '../../lib/SearchField'
import { Tooltip } from '../../lib/Tooltip'
import { Quiet } from './macroParts'

const SEARCH_DELAY_MS = 150

/** The names of the spells these command lines memorize; asked only when a line names one. */
export function useSpellNames(lines: readonly string[]): SpellNames {
  const key = memSpellIds(lines).join(',')
  const [known, setKnown] = useState<SpellNames>({ state: 'loading', names: {} })
  useEffect(() => {
    if (key === '') return undefined
    let live = true
    setKnown((held) => ({ ...held, state: 'loading' }))
    void window.eq.spellIdLookup({ text: '', ids: key.split(',').map(Number) }).then((reply) => {
      if (live) setKnown({ state: reply.available ? 'ready' : 'no-file', names: reply.names })
    })
    return () => {
      live = false
    }
  }, [key])
  return known
}

interface Found {
  /** The text these rows answer. */
  text: string
  rows: SpellIdRow[]
  available: boolean
}

function useSpellSearch(text: string): Found | null {
  const [found, setFound] = useState<Found | null>(null)
  const asked = text.trim()
  useEffect(() => {
    if (asked === '') {
      setFound(null)
      return undefined
    }
    let live = true
    const timer = setTimeout(() => {
      void window.eq.spellIdLookup({ text: asked, ids: [] }).then((reply) => {
        if (live) setFound({ text: asked, rows: reply.rows, available: reply.available })
      })
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [asked])
  return found
}

/** The one line said in place of results; null when there are rows to show. */
function statusText(text: string, found: Found | null, canInsert: boolean): string | null {
  if (text.trim() === '') return canInsert ? 'Type a spell name.' : 'Click a command line, then type a spell name.'
  if (found?.text !== text.trim()) return 'Searching the spell file.'
  if (!found.available) return 'Spell file not found. Check the EverQuest folder in Preferences.'
  if (found.rows.length === 0) return 'No spell matches.'
  return canInsert ? null : 'Click a command line first.'
}

interface FinderProps {
  /** A command line has been used, so a picked id has somewhere to go. */
  canInsert: boolean
  onPick: (id: number) => void
}

function FinderBody({ canInsert, onPick, onClose }: FinderProps & { onClose: () => void }): JSX.Element {
  const [text, setText] = useState('')
  const found = useSpellSearch(text)
  const status = statusText(text, found, canInsert)
  const rows = found !== null && found.text === text.trim() ? found.rows : []
  return (
    <Stack spacing={0.75} data-testid="macro-spell-finder">
      <Stack direction="row" spacing={1} alignItems="center">
        <SearchField
          query={text}
          onChange={setText}
          placeholder="Spell name"
          testid="macro-spell-search"
          clearTestid="macro-spell-search-clear"
          ariaLabel="Find a spell by name"
          clearLabel="Clear the spell search"
          sx={{ flexGrow: 1 }}
        />
        <Button size="small" onClick={onClose} data-testid="macro-spell-close">
          Close
        </Button>
      </Stack>
      {status !== null && <Quiet testid="macro-spell-status">{status}</Quiet>}
      <List dense disablePadding sx={{ maxHeight: 200, overflow: 'auto' }}>
        {rows.map((r) => (
          <ListItemButton
            key={r.id}
            disabled={!canInsert}
            data-testid="macro-spell-result"
            sx={{ borderRadius: 1 }}
            onClick={() => {
              onPick(r.id)
            }}
          >
            <ListItemText primary={r.name} secondary={`id ${String(r.id)}, ${r.classes}`} slotProps={{ secondary: { noWrap: true } }} />
          </ListItemButton>
        ))}
      </List>
    </Stack>
  )
}

export function SpellFinder({ canInsert, onPick }: FinderProps): JSX.Element {
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <FinderBody
        canInsert={canInsert}
        onPick={onPick}
        onClose={() => {
          setOpen(false)
        }}
      />
    )
  }
  return (
    <Tooltip title="Look up a spell by name and put its id in.">
      <Button
        size="small"
        variant="outlined"
        sx={{ alignSelf: 'flex-start' }}
        // Keeps the caret where it is in the command line while the button is clicked.
        onMouseDown={(e) => {
          e.preventDefault()
        }}
        onClick={() => {
          setOpen(true)
        }}
        data-testid="macro-spell-open"
      >
        Find a spell
      </Button>
    </Tooltip>
  )
}
