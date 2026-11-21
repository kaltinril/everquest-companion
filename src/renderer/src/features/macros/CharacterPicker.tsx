// macros/CharacterPicker.tsx — the characters found in the game folder, one panel each, with a
// character's loadouts picked INSIDE its panel (owner, 2026-11-20: "not this same character name
// 4 times in 4 panels"). Under the panels, one line about the picked loadout and a name for it.

import type { JSX } from 'react'
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'
import { type CharacterGroup, LOADOUT_LABEL_MAX, groupCharacters, loadoutLabel, loadoutText, loadoutsCaption, newestLoadout, setLoadoutLabel } from '@shared/macros/characters'
import { characterFileKey } from '@shared/macros/socials'
import type { CharacterFileMacros } from '@shared/macros/types'
import { formatDateTime } from '../../lib/formatDate'
import type { MacroStore } from './useMacroLibrary'

interface PickerProps {
  store: MacroStore
  files: CharacterFileMacros[]
  picked: CharacterFileMacros
  onSelect: (key: string) => void
}

interface PanelProps extends Omit<PickerProps, 'files'> {
  group: CharacterGroup<CharacterFileMacros>
}

function NameLines({ group, caption }: { group: CharacterGroup; caption: string }): JSX.Element {
  return (
    <>
      <Typography variant="subtitle1" component="div" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
        {group.character}
      </Typography>
      <Typography variant="caption" component="div" sx={{ opacity: 0.75 }}>
        {caption}
      </Typography>
    </>
  )
}

/** The picked character: its name, and its loadouts as chips when it has more than one. */
function PickedPanel({ store, group, picked, onSelect }: PanelProps): JSX.Element {
  const several = group.loadouts.length > 1
  return (
    <Box
      data-testid="macro-character"
      aria-current="true"
      sx={{ border: 2, borderColor: 'primary.main', borderRadius: 1, px: 1.5, py: 0.5, bgcolor: 'action.selected' }}
    >
      <NameLines group={group} caption={several ? group.server : loadoutsCaption(group)} />
      {several && (
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ pt: 0.5, pb: 0.25 }} data-testid="macro-loadouts">
          {group.loadouts.map((f) => {
            const on = f === picked
            return (
              <Chip
                key={f.file}
                size="small"
                label={loadoutText(f, loadoutLabel(store.library, f))}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                data-testid="macro-loadout"
                onClick={() => {
                  onSelect(characterFileKey(f))
                }}
              />
            )
          })}
        </Stack>
      )}
    </Box>
  )
}

/** Another character: one button. Picking it opens the loadout its game file changed last. */
function OtherPanel({ group, onSelect }: Pick<PanelProps, 'group' | 'onSelect'>): JSX.Element {
  return (
    <Button
      variant="outlined"
      color="inherit"
      data-testid="macro-character"
      sx={{ display: 'block', textAlign: 'left', textTransform: 'none', py: 0.5, borderColor: 'divider' }}
      onClick={() => {
        onSelect(characterFileKey(newestLoadout(group)))
      }}
    >
      <NameLines group={group} caption={loadoutsCaption(group)} />
    </Button>
  )
}

function macrosText(count: number): string {
  return count === 1 ? '1 macro' : `${String(count)} macros`
}

/** What is known of the picked loadout, and the name the player gives it (the game writes none). */
function LoadoutLine({ store, file }: { store: MacroStore; file: CharacterFileMacros }): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap" data-testid="macro-loadout-detail">
      <Typography variant="body2" color="text.secondary">
        Loadout {file.loadout}: {macrosText(file.macros.length)} in the game, file changed {formatDateTime(file.mtimeMs)}
      </Typography>
      <TextField
        size="small"
        variant="standard"
        placeholder="Name this loadout"
        value={store.library.labels?.[characterFileKey(file)] ?? ''}
        onChange={(e) => {
          store.change((current) => setLoadoutLabel(current, file, e.target.value))
        }}
        slotProps={{ htmlInput: { maxLength: LOADOUT_LABEL_MAX, 'aria-label': 'Name this loadout', 'data-testid': 'macro-loadout-label' } }}
        sx={{ width: 200 }}
      />
    </Stack>
  )
}

/** One panel per character, the picked one holding its loadouts; then the picked loadout's line. */
export function CharacterPicker({ store, files, picked, onSelect }: PickerProps): JSX.Element {
  const groups = groupCharacters(files)
  return (
    <Stack spacing={1} sx={{ flexShrink: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start" data-testid="macro-files">
        {groups.map((group) =>
          group.loadouts.includes(picked) ? (
            <PickedPanel key={group.key} store={store} group={group} picked={picked} onSelect={onSelect} />
          ) : (
            <OtherPanel key={group.key} group={group} onSelect={onSelect} />
          )
        )}
      </Stack>
      <LoadoutLine store={store} file={picked} />
    </Stack>
  )
}
