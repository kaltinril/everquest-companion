// spells/LoadoutParty.tsx — WHO YOU ARE GROUPED WITH, for the buff set.
//
// The ask (Garrett, 2026-09-26): buff stacking that takes group members into account. The buff
// set's pool is what you cast plus what a group-mate can put on you (`shared/spellParty.ts`), so
// this strip is where the group-mates' classes are entered.
//
// TYPED IN, OR OFFERED. The log states a group-mate's classes only in a `/who` row, and where one
// has been seen for somebody on the roster the strip offers them as a one-click chip. It never
// adds anybody by itself: the group is the user's list. `useLoadoutPool` keeps it; this draws it.
//
// A COLOUR PER CASTER (owner, 2026-09-26), so a row's caster reads at a glance. Clicking a chip
// opens the swatches: the colour is the user's to change.

import { type JSX, useState } from 'react'
import { Box, Button, Chip, Popover, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { CLASS_ABBRS, MAX_COMBO_SLOTS, type ClassAbbr } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import {
  MAX_PARTY_MEMBERS,
  SELF_CASTER,
  withColor,
  withMember,
  withoutMember
} from '@shared/spellParty'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import { PARTY_PAINT, casterChipSx, paintOf } from './partyPaint'
import type { LoadoutGroup } from './useLoadoutPool'

/** Who the open swatch popover is for. */
interface Picking {
  anchor: HTMLElement
  caster: string
}

/** The swatches: one dot per slot, the worn one ringed. */
function Swatches({ worn, onPick }: { worn: number; onPick: (slot: number) => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} sx={{ p: 1 }} data-testid="loadout-party-swatches">
      {PARTY_PAINT.map((paint, slot) => (
        <Box
          key={paint}
          component="button"
          type="button"
          aria-label={`Colour ${String(slot + 1)}`}
          data-testid="loadout-party-swatch"
          data-slot={slot}
          onClick={() => onPick(slot)}
          sx={{
            width: 20,
            height: 20,
            p: 0,
            borderRadius: '50%',
            cursor: 'pointer',
            bgcolor: paint,
            border: 2,
            borderColor: slot === worn ? 'text.primary' : 'transparent'
          }}
        />
      ))}
    </Stack>
  )
}

/** The chips: you, then each member, each in its colour. Clicking one opens its swatches. */
function MemberChips({ group }: { group: LoadoutGroup }): JSX.Element {
  const { party, setParty, setSelfColor, colorOf } = group
  const [picking, setPicking] = useState<Picking | null>(null)
  const pick = (slot: number): void => {
    if (picking === null) return
    if (picking.caster === SELF_CASTER) setSelfColor(slot)
    else setParty(withColor(party, picking.caster, slot))
    setPicking(null)
  }
  const chip = (caster: string, label: string, onDelete?: () => void): JSX.Element => (
    <Chip
      key={caster}
      size="small"
      variant="outlined"
      data-testid="loadout-party-member"
      data-member={caster}
      data-color={colorOf(caster)}
      label={label}
      title="Click to change the colour."
      onClick={(e) => setPicking({ anchor: e.currentTarget, caster })}
      onDelete={onDelete}
      sx={casterChipSx(paintOf(colorOf(caster)))}
    />
  )
  return (
    <>
      {chip(SELF_CASTER, SELF_CASTER)}
      {party.map((m) =>
        chip(m.name, `${m.name} · ${m.classes.join(' / ')}`, () => setParty(withoutMember(party, m.name)))
      )}
      <Popover
        open={picking !== null}
        anchorEl={picking?.anchor ?? null}
        onClose={() => setPicking(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Swatches worn={picking === null ? 0 : colorOf(picking.caster)} onPick={pick} />
      </Popover>
    </>
  )
}

/** The offers: roster members a `/who` row stated classes for. One click adds one. */
function Suggestions({ group }: { group: LoadoutGroup }): JSX.Element | null {
  const { party, setParty, suggestions } = group
  if (suggestions.length === 0 || party.length >= MAX_PARTY_MEMBERS) return null
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        In your group, from /who:
      </Typography>
      {suggestions.map((s) => (
        <Chip
          key={s.name}
          size="small"
          variant="outlined"
          icon={<AddIcon />}
          data-testid="loadout-party-suggestion"
          data-member={s.name}
          label={`${s.name} · ${s.classes.join(' / ')}`}
          title={
            s.statedTs === undefined
              ? 'Add them to the group with the classes their /who row stated.'
              : `Add them to the group with the classes their /who row stated on ${new Date(s.statedTs).toLocaleDateString()}.`
          }
          onClick={() => setParty(withMember(party, s))}
        />
      ))}
    </Stack>
  )
}

/** The row that adds a member by hand. It closes itself once it has added one. */
function AddRow({ group, onDone }: { group: LoadoutGroup; onDone: () => void }): JSX.Element {
  const { party, setParty } = group
  const [name, setName] = useState('')
  const [classes, setClasses] = useState<ClassAbbr[]>([])
  const full = party.length >= MAX_PARTY_MEMBERS
  // "You" is your own caster; the shared reader refuses a member of that name.
  const isSelf = name.trim().toLowerCase() === SELF_CASTER.toLowerCase()
  const add = (): void => {
    setParty(withMember(party, { name, classes }))
    setName('')
    setClasses([])
    onDone()
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
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
        disabled={classes.length === 0 || full || isSelf}
        onClick={add}
        data-testid="loadout-party-add"
        title={full ? 'A group is six, and one of them is you.' : isSelf ? 'You are already in the group.' : undefined}
      >
        Add
      </Button>
    </Stack>
  )
}

/**
 * The group strip: the chips, the offers, and the row that adds another by hand.
 *
 * THE ADD ROW IS CLOSED UNTIL ASKED FOR. It is two fields and a button that are used once per
 * group-mate, and open they sat between the heading and the set on every visit.
 */
export default function LoadoutParty({ group }: { group: LoadoutGroup }): JSX.Element {
  const { party } = group
  const [adding, setAdding] = useState(false)
  return (
    <Box data-testid="loadout-party">
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography variant="overline" color="text.secondary">
          Group
        </Typography>
        {party.length === 0 ? (
          <Typography variant="caption" color="text.secondary" data-testid="loadout-party-empty">
            Add who you are grouped with and the set is picked from their buffs as well as yours.
          </Typography>
        ) : (
          <MemberChips group={group} />
        )}
        <Chip
          size="small"
          variant={adding ? 'filled' : 'outlined'}
          icon={<AddIcon />}
          data-testid="loadout-party-open"
          label="Add"
          title="Add a group-mate and their classes by hand. They add only the buffs they can cast on someone else, read at your level: the log does not state theirs."
          disabled={party.length >= MAX_PARTY_MEMBERS}
          onClick={() => setAdding((v) => !v)}
        />
      </Stack>
      <Suggestions group={group} />
      {adding && <AddRow group={group} onDone={() => setAdding(false)} />}
    </Box>
  )
}
