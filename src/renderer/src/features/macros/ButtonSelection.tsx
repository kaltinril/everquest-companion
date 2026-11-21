// macros/ButtonSelection.tsx — picking several buttons at once on a character's page, across pages,
// and what can be done with them: copy or move them to another loadout's empty buttons, or tag them.

import { type JSX, useCallback, useState } from 'react'
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText, ListSubheader, Paper, Stack, TextField, Typography } from '@mui/material'
import { countWithTag, filledOnPageSlots, groupTargets, macroIdsOnSlots, placeGroup, planGroup, planText, tagMacros, usedText } from '@shared/macros/groups'
import { groupMoveHotbarText } from '@shared/macros/hotbars'
import { type PlacePlan } from '@shared/macros/groups'
import { findSet } from '@shared/macros/sets'
import { characterFileKey } from '@shared/macros/socials'
import { normalizeTag, tagList } from '@shared/macros/tags'
import type { CharacterFileMacros, MacroSet } from '@shared/macros/types'
import { Tooltip } from '../../lib/Tooltip'
import { Line } from './GameFileSend'
import { Quiet } from './macroParts'
import { useMacroUi } from './macroUi'
import type { MacroStore } from './useMacroLibrary'

export interface Selection {
  on: boolean
  slots: string[]
  /** Turning it off forgets what was selected. */
  setOn: (on: boolean) => void
  toggle: (slot: string) => void
  add: (slots: readonly string[]) => void
  clear: () => void
}

export function useSelection(): Selection {
  const [on, setOnState] = useState(false)
  const [slots, setSlots] = useState<string[]>([])
  const setOn = useCallback((next: boolean) => {
    setOnState(next)
    if (!next) setSlots([])
  }, [])
  const toggle = useCallback((slot: string) => {
    setSlots((current) => (current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot]))
  }, [])
  const add = useCallback((more: readonly string[]) => {
    setSlots((current) => [...new Set([...current, ...more])])
  }, [])
  const clear = useCallback(() => {
    setSlots([])
  }, [])
  return { on, slots, setOn, toggle, add, clear }
}

interface ToggleProps {
  selection: Selection
  disabled: boolean
  /** Selecting began: the open editor closes. */
  onStart: () => void
}

/** "Select", on the page row. */
export function SelectToggle({ selection, disabled, onStart }: ToggleProps): JSX.Element {
  return (
    <Tooltip title="Pick several buttons to copy, move or tag together.">
      <span>
        <Button
          size="small"
          variant={selection.on ? 'contained' : 'outlined'}
          aria-pressed={selection.on}
          disabled={disabled}
          data-testid="macro-select-toggle"
          onClick={() => {
            if (!selection.on) onStart()
            selection.setOn(!selection.on)
          }}
        >
          Select
        </Button>
      </span>
    </Tooltip>
  )
}

function buttonsText(n: number): string {
  return n === 1 ? '1 button' : `${String(n)} buttons`
}

interface GroupProps {
  store: MacroStore
  file: CharacterFileMacros
  files: readonly CharacterFileMacros[]
  set: MacroSet
  /** The selected buttons that hold a macro, in button order. */
  selected: string[]
}

interface PlaceProps extends GroupProps {
  move: boolean
  onDone: () => void
  onClose: () => void
}

interface PickedTarget {
  setId: string
  name: string
}

/** What the dialog says about the picked loadout, and what a Move does to this character's hotbars. */
function PlaceResult({ plan, onHotbar, testid }: { plan: PlacePlan | null; onHotbar: string | null; testid: string }): JSX.Element | null {
  if (plan === null) return null
  return (
    <>
      <Typography variant="body2" color={plan.left > 0 ? 'warning.main' : 'text.primary'} data-testid={`${testid}-plan`}>
        {planText(plan)}
      </Typography>
      {onHotbar !== null && (
        <Typography variant="body2" color="warning.main" data-testid={`${testid}-hotbar`}>
          {onHotbar}
        </Typography>
      )}
    </>
  )
}

function placeLabel(verb: string, plan: PlacePlan | null): string {
  return plan !== null && plan.left > 0 ? `${verb} the ${String(plan.landing.length)} that fit` : verb
}

/** "Copy to..." and "Move to...": pick a loadout, read what would happen, then do it. */
function PlaceDialog({ store, file, files, set, selected, move, onDone, onClose }: PlaceProps): JSX.Element {
  const ui = useMacroUi()
  const [picked, setPicked] = useState<PickedTarget | null>(null)
  const verb = move ? 'Move' : 'Copy'
  const testid = move ? 'macro-group-move' : 'macro-group-copy'
  const groups = groupTargets(store.library, files, characterFileKey(file))
  const target = findSet(store.library, picked?.setId ?? null)
  const plan = target === null ? null : planGroup(store.library, set, selected, target)
  const fits = plan?.landing.length ?? 0
  const onHotbar = groupMoveHotbarText(store.library, { fromSetId: set.id, slots: selected, toSetId: target?.id ?? '', move }, file)
  const confirm = (): void => {
    if (target === null || picked === null) return
    store.change((current) => placeGroup(current, { fromSetId: set.id, slots: selected, toSetId: target.id, move }))
    ui.notify(`${move ? 'Moved' : 'Copied'} ${buttonsText(fits)} to ${picked.name}. Open it to send.`)
    onDone()
    onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid={`${testid}-dialog`}>
      <DialogTitle>
        {verb} {buttonsText(selected.length)} to
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {groups.length === 0 && <Quiet testid={`${testid}-none`}>No other character or loadout in the game folder.</Quiet>}
          <List dense disablePadding sx={{ maxHeight: 300, overflow: 'auto' }}>
            {groups.map((g) => (
              <li key={g.key}>
                <ul style={{ padding: 0 }}>
                  <ListSubheader disableSticky sx={{ lineHeight: 2, px: 1 }}>
                    {g.character} ({g.server})
                  </ListSubheader>
                  {g.targets.map((t) => (
                    <ListItemButton
                      key={t.fileKey}
                      selected={t.setId === picked?.setId}
                      data-testid={`${testid}-target`}
                      sx={{ borderRadius: 1 }}
                      onClick={() => {
                        setPicked({ setId: t.setId, name: `${g.character}, ${t.label}` })
                      }}
                    >
                      <ListItemText primary={t.label} secondary={`${usedText(t.used)}, ${String(t.empty)} empty`} />
                    </ListItemButton>
                  ))}
                </ul>
              </li>
            ))}
          </List>
          <PlaceResult plan={plan} onHotbar={onHotbar} testid={testid} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid={`${testid}-cancel`}>
          Cancel
        </Button>
        <Button variant="contained" disabled={fits === 0} onClick={confirm} data-testid={`${testid}-confirm`}>
          {placeLabel(verb, plan)}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** "Tag...": one tag put on or taken off every selected button's macro. */
function TagDialog({ store, set, selected, onClose }: Pick<GroupProps, 'store' | 'set' | 'selected'> & { onClose: () => void }): JSX.Element {
  const ui = useMacroUi()
  const [typed, setTyped] = useState('')
  const tag = normalizeTag(typed)
  const macroIds = macroIdsOnSlots(store.library, set, selected)
  const have = tag === '' ? 0 : countWithTag(store.library, macroIds, tag)
  const apply = (on: boolean): void => {
    store.change((current) => tagMacros(current, { macroIds, tag, on }, Date.now()))
    ui.notify(on ? `Tagged ${String(macroIds.length)} with ${tag}` : `Took ${tag} off ${String(have)}`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid="macro-group-tag-dialog">
      <DialogTitle>Tag {macroIds.length === 1 ? '1 macro' : `${String(macroIds.length)} macros`}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <TextField
            size="small"
            autoFocus
            label="Tag"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
            }}
            sx={{ mt: 1 }}
            slotProps={{ htmlInput: { 'data-testid': 'macro-group-tag-name' } }}
          />
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            {tagList(store.library).map((t) => (
              <Chip
                key={t.tag}
                size="small"
                label={t.tag}
                color={t.tag === tag ? 'primary' : 'default'}
                variant={t.tag === tag ? 'filled' : 'outlined'}
                data-testid="macro-group-tag-choice"
                onClick={() => {
                  setTyped(t.tag)
                }}
              />
            ))}
          </Stack>
          {tag !== '' && (
            <Line>
              {have} of {macroIds.length} have this tag.
            </Line>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="macro-group-tag-cancel">
          Cancel
        </Button>
        <Button
          disabled={have === 0}
          data-testid="macro-group-tag-remove"
          onClick={() => {
            apply(false)
          }}
        >
          Remove tag
        </Button>
        <Button
          variant="contained"
          disabled={tag === '' || have === macroIds.length}
          data-testid="macro-group-tag-add"
          onClick={() => {
            apply(true)
          }}
        >
          Add tag
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface BarProps extends GroupProps {
  page: number
  selection: Selection
}

type Asking = 'copy' | 'move' | 'tag'

/** The bar under the page row while selecting: the count and what to do with the buttons. */
export function SelectionBar({ store, file, files, set, page, selection, selected }: BarProps): JSX.Element {
  const [asking, setAsking] = useState<Asking | null>(null)
  const none = selected.length === 0
  const close = (): void => {
    setAsking(null)
  }
  const action = (next: Asking, label: string): JSX.Element => (
    <Button
      size="small"
      variant="outlined"
      disabled={none}
      data-testid={`macro-group-${next}-open`}
      onClick={() => {
        setAsking(next)
      }}
    >
      {label}
    </Button>
  )
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.75 }} data-testid="macro-select-bar">
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="macro-select-count">
          {buttonsText(selected.length)} selected
        </Typography>
        <Button
          size="small"
          data-testid="macro-select-page"
          onClick={() => {
            selection.add(filledOnPageSlots(store.library, set, page))
          }}
        >
          Select page
        </Button>
        <Button size="small" disabled={none} onClick={selection.clear} data-testid="macro-select-clear">
          Clear
        </Button>
        {action('copy', 'Copy to...')}
        {action('move', 'Move to...')}
        {action('tag', 'Tag...')}
      </Stack>
      {(asking === 'copy' || asking === 'move') && (
        <PlaceDialog
          store={store}
          file={file}
          files={files}
          set={set}
          selected={selected}
          move={asking === 'move'}
          onDone={asking === 'move' ? selection.clear : () => undefined}
          onClose={close}
        />
      )}
      {asking === 'tag' && <TagDialog store={store} set={set} selected={selected} onClose={close} />}
    </Paper>
  )
}
