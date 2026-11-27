// macros/TagGroups.tsx — "Tag groups...": a tag's macros put on this character's empty buttons, or
// taken off it again, for the player at the button limit who swaps a zone's macros in and out.

import { type JSX, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { putTagOn, tagGroupStatus, tagStatusText, takeTagOff } from '@shared/macros/groups'
import { usedTagList } from '@shared/macros/tags'
import type { MacroSet } from '@shared/macros/types'
import { Quiet } from './macroParts'
import { useMacroUi } from './macroUi'
import type { MacroStore } from './useMacroLibrary'

interface TagGroupsProps {
  store: MacroStore
  /** The character's own layout. */
  set: MacroSet
  onClose: () => void
}

function macrosText(n: number): string {
  return n === 1 ? '1 macro' : `${String(n)} macros`
}

export function TagGroupsDialog({ store, set, onClose }: TagGroupsProps): JSX.Element {
  const ui = useMacroUi()
  const tags = usedTagList(store.library)
  const [tag, setTag] = useState(tags.at(0)?.tag ?? '')
  const status = tag === '' ? null : tagGroupStatus(store.library, set, tag)
  const fits = status?.plan.landing.length ?? 0
  const short = status !== null && status.plan.left > 0
  const put = (): void => {
    store.change((current) => putTagOn(current, set.id, tag))
    ui.notify(`Put ${macrosText(fits)} on empty buttons`)
    onClose()
  }
  const takeOff = (): void => {
    store.change((current) => takeTagOff(current, set.id, tag))
    ui.notify(`Took ${macrosText(status?.onCharacter ?? 0)} off. They stay in the library.`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid="macro-tag-groups-dialog">
      <DialogTitle>Tag groups</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {tags.length === 0 ? (
            <Quiet testid="macro-tag-groups-none">No macro has a tag yet. Select buttons, then use Tag...</Quiet>
          ) : (
            <TextField
              select
              size="small"
              label="Tag"
              value={tag}
              onChange={(e) => {
                setTag(e.target.value)
              }}
              sx={{ mt: 1 }}
              data-testid="macro-tag-groups-tag"
            >
              {tags.map((t) => (
                <MenuItem key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </MenuItem>
              ))}
            </TextField>
          )}
          {status !== null && (
            <Typography variant="body2" sx={{ color: short ? 'warning.main' : 'text.primary' }} data-testid="macro-tag-groups-status">
              {tagStatusText(status)}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="macro-tag-groups-cancel">
          Cancel
        </Button>
        <Button disabled={status === null || status.onCharacter === 0} onClick={takeOff} data-testid="macro-tag-groups-off">
          Take off this character
        </Button>
        <Button variant="contained" disabled={fits === 0} onClick={put} data-testid="macro-tag-groups-put">
          {short ? `Put the ${String(fits)} that fit` : 'Put on empty buttons'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
