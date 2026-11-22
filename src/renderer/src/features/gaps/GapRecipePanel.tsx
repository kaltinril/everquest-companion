// GapRecipePanel - a crafted item's recipe, told to the app (owner, 2026-11-21: "search for and chose
// items to tell the app what are needed for the receipe and the containter ... the app can format
// the complete wiki code for me"). In the open row's details, only on a crafted item the wiki holds
// no recipe for. What it writes and when the row is Ready is shared/gapRecipe.ts.
//
// THE DRAFT IS LOCAL AND SAVED A BEAT LATER: a saved edit re-derives every row of the tab, so a
// keystroke must not. It is saved after a short pause and when the panel closes.

import { type JSX, useDeferredValue, useEffect, useRef, useState } from 'react'
import { Autocomplete, Box, Chip, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import {
  addMaterial,
  changeMaterial,
  containerOptions,
  guideOffers,
  recipeDraft,
  removeMaterial,
  tradeOption,
  typedCount,
  typedSources,
  type GapRecipe,
  type GapRecipeHelp,
  type GapRecipeMaterial
} from '@shared/gapRecipe'
import type { GapRow } from '@shared/gaps'
import { itemIconUrl } from '../../lib/ItemWindow'
import { Tooltip } from '../../lib/Tooltip'
import { saveGapEdit } from './gapEditsStore'

const SAVE_MS = 350
const MIN_QUERY = 2
const NO_HELP: GapRecipeHelp = { trades: [], containers: {}, guide: [] }
const NO_HITS: readonly GapRecipeMaterial[] = []

/** The form's recipe: edited at once, saved to the row a beat later and on the way out. */
function useRecipeDraft(row: GapRow): [GapRecipe, (next: GapRecipe) => void] {
  const [draft, setDraft] = useState(() => recipeDraft(row))
  const latest = useRef({ row, draft, saved: JSON.stringify(draft) })
  latest.current.row = row
  latest.current.draft = draft
  const flush = useRef(() => {
    const now = latest.current
    const text = JSON.stringify(now.draft)
    if (text === now.saved) return
    now.saved = text
    saveGapEdit(now.row, { ...now.row.edit, recipe: now.draft })
  })
  useEffect(() => {
    const timer = setTimeout(flush.current, SAVE_MS)
    return () => clearTimeout(timer)
  }, [draft])
  useEffect(() => () => flush.current(), [])
  return [draft, setDraft]
}

/** The tradeskills, each tradeskill's containers and the guide's materials for this item. */
function useRecipeHelp(item: string): GapRecipeHelp {
  const [help, setHelp] = useState(NO_HELP)
  useEffect(() => {
    let alive = true
    void window.eq
      .gapRecipeHelp(item)
      .then((got) => {
        if (alive) setHelp(got)
      })
      .catch(() => {
        // No offers: the fields still take typed text.
      })
    return () => {
      alive = false
    }
  }, [item])
  return help
}

function useItemHits(query: string): readonly GapRecipeMaterial[] {
  const deferred = useDeferredValue(query).trim()
  const [hits, setHits] = useState(NO_HITS)
  useEffect(() => {
    if (deferred.length < MIN_QUERY) {
      setHits(NO_HITS)
      return undefined
    }
    let alive = true
    void window.eq
      .gapRecipeSearch(deferred)
      .then((got) => {
        if (alive) setHits(got)
      })
      .catch(() => {
        if (alive) setHits(NO_HITS)
      })
    return () => {
      alive = false
    }
  }, [deferred])
  return hits
}

function MaterialIcon({ iconId }: { iconId: number | undefined }): JSX.Element {
  if (iconId === undefined) return <Box sx={{ width: 20, flexShrink: 0 }} />
  return <Box component="img" src={itemIconUrl(iconId)} alt="" sx={{ width: 20, height: 20, imageRendering: 'pixelated', flexShrink: 0 }} />
}

/** The item search: a pick adds it at 1, and text with no match adds as typed. */
function MaterialSearch({ onAdd }: { onAdd: (m: GapRecipeMaterial) => void }): JSX.Element {
  const [input, setInput] = useState('')
  const hits = useItemHits(input)
  return (
    <Autocomplete<GapRecipeMaterial, false, false, true>
      freeSolo
      size="small"
      options={[...hits]}
      filterOptions={(all) => all}
      value={null}
      inputValue={input}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
      onInputChange={(_e, v, reason) => {
        if (reason !== 'reset') setInput(v)
      }}
      onChange={(_e, picked) => {
        if (picked === null) return
        onAdd(typeof picked === 'string' ? { name: picked, qty: 1 } : { ...picked, qty: 1 })
        setInput('')
      }}
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={key ?? o.name} {...props} sx={{ gap: 1 }}>
          <MaterialIcon iconId={o.iconId} />
          {o.name}
        </Box>
      )}
      renderInput={(p) => <TextField {...p} placeholder="Add a material" slotProps={{ htmlInput: { ...p.inputProps, 'data-testid': 'gaps-recipe-search' } }} />}
      sx={{ width: 280 }}
    />
  )
}

function MaterialRow({ m, onChange, onRemove }: { m: GapRecipeMaterial; onChange: (patch: Partial<GapRecipeMaterial>) => void; onRemove: () => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-recipe-material">
      <TextField
        variant="standard"
        size="small"
        value={m.qty === undefined ? '' : String(m.qty)}
        error={m.qty === undefined}
        placeholder="#"
        onChange={(e) => onChange({ qty: typedCount(e.target.value) })}
        slotProps={{ htmlInput: { 'aria-label': `How many ${m.name}`, inputMode: 'numeric', style: { textAlign: 'right' } } }}
        sx={{ width: 36, flexShrink: 0 }}
      />
      <Typography variant="caption" color="text.secondary">
        x
      </Typography>
      <MaterialIcon iconId={m.iconId} />
      <Typography variant="body2" noWrap sx={{ minWidth: 190 }}>
        {m.name}
      </Typography>
      <SourceField key={(m.sources ?? []).join(', ')} name={m.name} sources={m.sources} onChange={(sources) => onChange({ sources })} />
      <IconButton size="small" aria-label={`Remove ${m.name}`} onClick={onRemove}>
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Stack>
  )
}

/** Where it comes from, in the wiki's words: its own text while typed, so a comma can be typed. */
function SourceField({ name, sources, onChange }: { name: string; sources: readonly string[] | undefined; onChange: (next: string[]) => void }): JSX.Element {
  const [text, setText] = useState((sources ?? []).join(', '))
  return (
    <TextField
      variant="standard"
      size="small"
      placeholder="Source"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(typedSources(text))}
      slotProps={{ htmlInput: { 'aria-label': `Where ${name} comes from` } }}
      sx={{ flexGrow: 1, minWidth: 120, maxWidth: 340 }}
    />
  )
}

/** The combine itself: tradeskill, container, trivial and how many it makes. */
function CombineFields({ draft, help, onChange }: { draft: GapRecipe; help: GapRecipeHelp; onChange: (next: GapRecipe) => void }): JSX.Element {
  const trade = tradeOption(help, draft.tradeskill)
  const trades = trade === undefined || help.trades.includes(trade) ? help.trades : [trade, ...help.trades]
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
      <TextField select size="small" label="Tradeskill" value={trade ?? ''} onChange={(e) => onChange({ ...draft, tradeskill: e.target.value })} sx={{ width: 160 }} data-testid="gaps-recipe-trade">
        {trades.map((t) => (
          <MenuItem key={t} value={t}>
            {t}
          </MenuItem>
        ))}
      </TextField>
      <Autocomplete
        freeSolo
        size="small"
        options={[...containerOptions(help, draft.tradeskill)]}
        inputValue={draft.container ?? ''}
        onInputChange={(_e, v) => onChange({ ...draft, container: v })}
        renderInput={(p) => <TextField {...p} label="Container" error={(draft.container ?? '').trim() === ''} slotProps={{ htmlInput: { ...p.inputProps, 'data-testid': 'gaps-recipe-container' } }} />}
        sx={{ width: 230 }}
      />
      <NumberField label="Trivial" value={draft.trivial} onChange={(trivial) => onChange({ ...draft, trivial })} testId="gaps-recipe-trivial" />
      <NumberField label="Makes" value={draft.yieldQty} placeholder="1" onChange={(yieldQty) => onChange({ ...draft, yieldQty })} testId="gaps-recipe-yield" />
    </Stack>
  )
}

function NumberField({ label, value, placeholder, onChange, testId }: { label: string; value: number | undefined; placeholder?: string; onChange: (next: number | undefined) => void; testId: string }): JSX.Element {
  return (
    <TextField
      size="small"
      label={label}
      placeholder={placeholder}
      value={value === undefined ? '' : String(value)}
      onChange={(e) => onChange(typedCount(e.target.value))}
      slotProps={{ inputLabel: placeholder === undefined ? {} : { shrink: true }, htmlInput: { inputMode: 'numeric', 'data-testid': testId } }}
      sx={{ width: 76 }}
    />
  )
}

/** The guide's materials, each one click from the recipe and never on the page before that click. */
function GuideOffers({ draft, guide, onAdd }: { draft: GapRecipe; guide: readonly GapRecipeMaterial[]; onAdd: (m: GapRecipeMaterial) => void }): JSX.Element | null {
  const offers = guideOffers(draft, guide)
  if (offers.length === 0) return null
  return (
    <Tooltip title="A community guide names these. Click one to add it.">
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" data-testid="gaps-recipe-guide">
        {offers.map((m) => (
          <Chip key={m.name} size="small" variant="outlined" icon={<AddIcon />} label={m.qty === undefined ? m.name : `${String(m.qty)} x ${m.name}`} onClick={() => onAdd(m)} />
        ))}
      </Stack>
    </Tooltip>
  )
}

export default function GapRecipePanel({ row }: { row: GapRow }): JSX.Element {
  const [draft, setDraft] = useRecipeDraft(row)
  const help = useRecipeHelp(row.name)
  const add = (m: GapRecipeMaterial): void => setDraft(addMaterial(draft, m))
  return (
    <Stack spacing={1} sx={{ my: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }} data-testid="gaps-recipe">
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        Recipe
      </Typography>
      <CombineFields draft={draft} help={help} onChange={setDraft} />
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <MaterialSearch onAdd={add} />
        <GuideOffers draft={draft} guide={help.guide} onAdd={add} />
      </Stack>
      {draft.materials.map((m) => (
        <MaterialRow key={m.name} m={m} onChange={(patch) => setDraft(changeMaterial(draft, m.name, patch))} onRemove={() => setDraft(removeMaterial(draft, m.name))} />
      ))}
      <TextField size="small" placeholder="Notes (optional)" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} slotProps={{ htmlInput: { 'data-testid': 'gaps-recipe-notes' } }} />
    </Stack>
  )
}
