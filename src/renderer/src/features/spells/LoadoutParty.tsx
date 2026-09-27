// spells/LoadoutParty.tsx — WHO YOU ARE GROUPED WITH, for the buff set.
//
// The ask (Garrett, 2026-09-26): buff stacking that takes group members into account. The buff
// set's pool is what you cast plus what a group-mate can put on you (`shared/spellParty.ts`), so
// this strip is where the group-mates' classes are entered.
//
// TYPED IN, because nothing the app reads states them: the roster knows names and the log's `/who`
// rule reads your own row only. `useLoadoutPool` keeps the list; this draws and edits it.

import { type JSX, useState } from 'react'
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'
import { CLASS_ABBRS, MAX_COMBO_SLOTS, type ClassAbbr } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import { MAX_PARTY_MEMBERS, withMember, withoutMember, type PartyMember } from '@shared/spellParty'
import ChipMultiSelect from '../../components/ChipMultiSelect'

export interface LoadoutPartyProps {
  party: PartyMember[]
  onParty: (next: PartyMember[]) => void
}

/** The group strip: a chip per member, and the one row that adds another. */
export default function LoadoutParty({ party, onParty }: LoadoutPartyProps): JSX.Element {
  const [name, setName] = useState('')
  const [classes, setClasses] = useState<ClassAbbr[]>([])
  const full = party.length >= MAX_PARTY_MEMBERS
  const add = (): void => {
    onParty(withMember(party, { name, classes }))
    setName('')
    setClasses([])
  }
  return (
    <Box data-testid="loadout-party">
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        <Typography variant="overline" color="text.secondary">
          Group
        </Typography>
        {party.length === 0 && (
          <Typography variant="caption" color="text.secondary" data-testid="loadout-party-empty">
            Add who you are grouped with and the set is picked from their buffs as well as yours.
          </Typography>
        )}
        {party.map((m) => (
          <Chip
            key={m.name}
            size="small"
            variant="outlined"
            data-testid="loadout-party-member"
            data-member={m.name}
            label={`${m.name} · ${m.classes.join(' / ')}`}
            onDelete={() => onParty(withoutMember(party, m.name))}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <TextField
          size="small"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { 'data-testid': 'loadout-party-name', maxLength: 32 } }}
          sx={{ width: 160 }}
        />
        <ChipMultiSelect
          options={CLASS_ABBRS}
          value={classes}
          onChange={setClasses}
          label="Their classes"
          placeholder="up to three"
          max={MAX_COMBO_SLOTS}
          optionLabel={classDisplayName}
          minWidth={240}
          testId="loadout-party-classes"
        />
        <Button
          size="small"
          variant="outlined"
          disabled={classes.length === 0 || full}
          onClick={add}
          data-testid="loadout-party-add"
          title={full ? 'A group is six, and one of them is you.' : undefined}
        >
          Add
        </Button>
      </Stack>
      {party.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          A group-mate adds only the buffs they can cast on someone else, read at your level: the
          log does not state theirs.
        </Typography>
      )}
    </Box>
  )
}
