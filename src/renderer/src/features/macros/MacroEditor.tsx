// macros/MacroEditor.tsx — one macro's editor, beside the Library's list and beside a character's
// buttons: name, colour number, five command lines, tags and note. Every key goes straight into
// the library (useMacroLibrary saves it); the warnings are shared/macros/validate.ts and never
// stop an edit.

import { type JSX, type ReactNode, useRef, useState } from 'react'
import { Box, Button, Chip, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { duplicateMacro, removeMacro, restoreMacro, systemMint, updateMacro } from '@shared/macros/library'
import { LINES, LINE_MAX, NAME_MAX } from '@shared/macros/limits'
import { type SpellNames, insertSpellId, memSpellHint } from '@shared/macros/memSpell'
import { addOwnTag, normalizeTag, tagList, toggleTag } from '@shared/macros/tags'
import { macrosToText } from '@shared/macros/text'
import type { Macro } from '@shared/macros/types'
import { lineHint, validateMacro, type Warning } from '@shared/macros/validate'
import { ColorPicker } from './MacroColor'
import { MONO_SX } from './macroParts'
import { SpellFinder, useSpellNames } from './SpellFinder'
import { useMacroUi } from './macroUi'
import type { MacroStore } from './useMacroLibrary'

/** `field` names the box being typed in, so a run of keys in it is one Undo step. */
type Patch = (patch: Partial<Omit<Macro, 'id'>>, field?: string) => void

/** A field's helper text is a warning, never an error: it is drawn in the warning colour. */
const WARNING_HELPER = { formHelperText: { sx: { color: 'warning.main' } } } as const

interface EditorProps {
  store: MacroStore
  macro: Macro
  /** The name box takes the focus: the macro was just made. */
  focusName: boolean
  /** What stands over the fields: where the macro is, and what can be done with it there. */
  top: ReactNode
  /** What stands under them. */
  bottom?: ReactNode
}

interface LibraryActionsProps {
  store: MacroStore
  macro: Macro
  onSelect: (id: string | null) => void
  /** Go to the Characters section with this macro ready to put on a button. */
  onPlace: (id: string) => void
}

/** The Library's actions on its picked macro. */
export function LibraryActions({ store, macro, onSelect, onPlace }: LibraryActionsProps): JSX.Element {
  const ui = useMacroUi()
  const duplicate = (): void => {
    const made = duplicateMacro(store.library, macro.id, systemMint)
    if (made.macro === null) return
    store.change(() => made.library)
    onSelect(made.macro.id)
    ui.notify('Duplicated')
  }
  const remove = (): void => {
    const { library, undo } = removeMacro(store.library, macro.id)
    if (undo === null) return
    store.change(() => library)
    const next = library.macros.at(undo.index) ?? library.macros.at(undo.index - 1)
    onSelect(next?.id ?? null)
    ui.notify(`Deleted "${macro.name}"`, () => {
      store.change((current) => restoreMacro(current, undo))
      onSelect(undo.macro.id)
    })
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
      <Typography variant="subtitle1">Edit macro</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-put-on-button"
          onClick={() => {
            onPlace(macro.id)
          }}
        >
          Put on a button...
        </Button>
        <Button size="small" variant="outlined" onClick={duplicate} data-testid="macro-duplicate">
          Duplicate
        </Button>
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-copy"
          onClick={() => {
            ui.copy(macrosToText([macro]))
          }}
        >
          Copy as text
        </Button>
        <Button size="small" variant="outlined" color="error" onClick={remove} data-testid="macro-delete">
          Delete
        </Button>
      </Stack>
    </Stack>
  )
}

function NameAndColor({ macro, patch, warnings, focusName }: { macro: Macro; patch: Patch; warnings: Warning[]; focusName: boolean }): JSX.Element {
  const nameWarning = warnings.find((w) => w.field === 'name')?.text
  const colorWarning = warnings.find((w) => w.field === 'color')?.text
  return (
    <Stack spacing={1.5}>
      <TextField
        size="small"
        label="Name"
        value={macro.name}
        autoFocus={focusName}
        onFocus={(e) => {
          if (focusName) e.target.select()
        }}
        onChange={(e) => {
          patch({ name: e.target.value }, 'name')
        }}
        helperText={nameWarning}
        slotProps={{
          ...WARNING_HELPER,
          // A longer stored name still shows whole: maxLength only stops more being typed.
          htmlInput: { maxLength: NAME_MAX },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="caption" color="text.secondary" data-testid="macro-name-count">
                  {macro.name.length}/{NAME_MAX}
                </Typography>
              </InputAdornment>
            )
          }
        }}
        data-testid="macro-name"
      />
      <ColorPicker
        value={macro.color}
        warning={colorWarning}
        onPick={(color) => {
          patch({ color })
        }}
      />
    </Stack>
  )
}

interface LineFieldProps {
  index: number
  value: string
  onChange: (value: string) => void
  /** What the game's spell file says about the ids on screen. */
  known: SpellNames
  /** The caret or selection moved in this line. */
  onCursor: (start: number, end: number) => void
}

/** A warning first, then what a `/memspellslot` line memorizes, then what a pause does. */
function shownHint(value: string, known: SpellNames): ReturnType<typeof lineHint> {
  const hint = lineHint(value)
  return hint.text === '' ? (memSpellHint(value, known) ?? hint) : hint
}

function LineField({ index, value, onChange, known, onCursor }: LineFieldProps): JSX.Element {
  const hint = shownHint(value, known)
  const n = String(index + 1)
  const htmlInput = { 'aria-label': `Line ${n}`, spellCheck: false, style: MONO_SX, 'data-testid': `macro-line-${n}` }
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Typography variant="body2" color="text.secondary" sx={{ width: 14, pt: 1, textAlign: 'right' }}>
        {n}
      </Typography>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <TextField
          size="small"
          fullWidth
          value={value}
          placeholder="/command"
          onChange={(e) => {
            onChange(e.target.value)
          }}
          onSelect={(e) => {
            const input = e.target as HTMLInputElement
            onCursor(input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length)
          }}
          slotProps={{
            htmlInput,
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Typography variant="caption" color="text.secondary" data-testid={`macro-line-count-${n}`}>
                    {value.length}/{LINE_MAX}
                  </Typography>
                </InputAdornment>
              )
            }
          }}
        />
        {hint.text !== '' && (
          <Typography variant="caption" color={hint.warning ? 'warning.main' : 'text.secondary'} data-testid={`macro-line-hint-${n}`}>
            {hint.text}
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

function CommandLines({ macro, patch, warnings }: { macro: Macro; patch: Patch; warnings: Warning[] }): JSX.Element {
  const tooMany = warnings.find((w) => w.field === 'lines')?.text
  // A macro with more lines than the game holds (pasted text) shows them all, so none is hidden.
  const rows = Array.from({ length: Math.max(LINES, macro.lines.length) }, (_, i) => macro.lines.at(i) ?? '')
  const setLine = (index: number, value: string): void => {
    const lines = [...rows]
    lines[index] = value
    patch({ lines }, `line${String(index)}`)
  }
  const known = useSpellNames(rows)
  /** The command line last used and its caret: where a found spell id goes. */
  const cursor = useRef<{ index: number; start: number; end: number } | null>(null)
  const [canInsert, setCanInsert] = useState(false)
  const putSpellId = (id: number): void => {
    const at = cursor.current
    if (at === null) return
    const made = insertSpellId(rows.at(at.index) ?? '', at, id)
    setLine(at.index, made.line)
    cursor.current = { index: at.index, start: made.cursor, end: made.cursor }
  }
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" color="text.secondary">
        Commands, one per line, run top to bottom
      </Typography>
      {tooMany !== undefined && (
        <Typography variant="caption" color="warning.main" data-testid="macro-lines-warning">
          {tooMany}
        </Typography>
      )}
      {rows.map((value, i) => (
        <LineField
          key={i}
          index={i}
          value={value}
          known={known}
          onChange={(next) => {
            setLine(i, next)
          }}
          onCursor={(start, end) => {
            cursor.current = { index: i, start, end }
            setCanInsert(true)
          }}
        />
      ))}
      <SpellFinder canInsert={canInsert} onPick={putSpellId} />
    </Stack>
  )
}

function TagPicker({ store, macro }: { store: MacroStore; macro: Macro }): JSX.Element {
  const [typed, setTyped] = useState('')
  const setTags = (tags: string[]): void => {
    store.change((current) => updateMacro(current, macro.id, { tags }, Date.now()))
  }
  const addTyped = (): void => {
    const tag = normalizeTag(typed)
    if (tag === '') return
    store.change((current) => updateMacro(addOwnTag(current, tag), macro.id, { tags: [...macro.tags, tag] }, Date.now()))
    setTyped('')
  }
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" color="text.secondary">
        Tags (only this app sees them)
      </Typography>
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
        {tagList(store.library).map(({ tag }) => {
          const on = macro.tags.includes(tag)
          return (
            <Chip
              key={tag}
              size="small"
              label={tag}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              aria-pressed={on}
              data-testid="macro-tag"
              onClick={() => {
                setTags(toggleTag(macro.tags, tag))
              }}
            />
          )
        })}
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          placeholder="Add your own tag"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTyped()
          }}
          sx={{ flexGrow: 1 }}
          data-testid="macro-tag-new"
        />
        <Button size="small" variant="outlined" onClick={addTyped} data-testid="macro-tag-add">
          Add tag
        </Button>
      </Stack>
    </Stack>
  )
}

/** The picked macro's editor. Keyed by the macro's id by its caller, so the tag box starts empty. */
export function MacroEditor({ store, macro, focusName, top, bottom }: EditorProps): JSX.Element {
  const warnings = validateMacro(macro)
  const patch: Patch = (fields, field) => {
    store.change((current) => updateMacro(current, macro.id, fields, Date.now()), field === undefined ? undefined : `${macro.id}:${field}`)
  }
  return (
    <Stack spacing={1.5} data-testid="macro-editor">
      {top}
      <NameAndColor macro={macro} patch={patch} warnings={warnings} focusName={focusName} />
      <CommandLines macro={macro} patch={patch} warnings={warnings} />
      <TagPicker store={store} macro={macro} />
      <TextField
        size="small"
        multiline
        minRows={2}
        label="Note (only this app sees it)"
        value={macro.note}
        onChange={(e) => {
          patch({ note: e.target.value }, 'note')
        }}
        data-testid="macro-note"
      />
      {bottom}
    </Stack>
  )
}
