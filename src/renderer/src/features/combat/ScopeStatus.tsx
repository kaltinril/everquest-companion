// THE SCOPE READOUT AND THE ROSTER BEHIND IT — docs/plans/group-model.md §3.
//
// One WORD answering "whose damage am I looking at", and a popover answering the question it
// immediately provokes: "…and who does the app think is in my group, and why?"
//
// IT IS NO LONGER A CONTROL (JOS-115, owner: the You/Group/Everyone selector "is shown INLINE on
// every combat surface and is too crowded"). Scope is now ONE persisted preference written in
// Preferences > Combat and read by the Combat tab, the Overview card and every floating overlay
// (features/combat/useCombatPrefs.ts). What survives here is the STATE — because a meter that is
// filtering rows out must be able to say so on the surface where the rows are missing. `chipLabel`
// is the whole reason: `Group (no roster yet)` is the sentence that explains why a Group-scoped
// meter is showing everybody (law 1's fallback), and moving the control away must not take that
// explanation with it.
//
// IT IS A CONTROL AGAIN, ON THIS TAB ONLY (fork owner, 2026-11-16: a "mine only" on the Combat
// tab). Three buttons, You / Group / Everyone, the chosen one lit (owner, 2026-11-17: a single
// word that cycled on click was "not obvious"). A press writes the TAB'S OWN pick (owner,
// 2026-11-17: "thats only for the combat tab, not the overlay"), so the Overview card and the
// overlays stay on what Preferences > Combat holds; the overlays still carry no control.
//
// THE PROVENANCE IS THE POINT, not decoration. The roster is inferred from lines the game prints
// once, so a member can be there because they joined (the game said so), because they hold the
// leader role, because they are talking to your group, or because you said so. A meter that
// hides a row without being able to say why is a meter you cannot trust — and hiding a real
// group-mate is the exact defect this whole feature exists to fix. So every row states its rung
// and the ones the app is least sure of say so loudest (a STALE row is dimmed and labelled).
//
// AND EVERY ROW IS CORRECTABLE. Remove is the answer to "that person left and the log never
// said so"; the add box is the answer to "we grouped before I opened the app". Neither can lose
// you a number: a removed member's damage is still recorded and still shows under Everyone
// (shared/roster.ts RosterView.admitted says why), so the worst a wrong edit can do is hide a
// row you can bring straight back.
//
// UI CONVENTION (AGENTS.md): state, never process. No captions about how membership is
// detected — the provenance word IS the state, and the tooltip carries the rest.

import { useState } from 'react'
import {
  Box,
  Button,
  ClickAwayListener,
  IconButton,
  Paper,
  Popper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import GroupIcon from '@mui/icons-material/Group'
import { Tooltip } from '../../lib/Tooltip'
import { formatDate } from '../../lib/formatDate'
import { useCombatTabScope } from './useCombatPrefs'
import { segmented } from './segmented'
import {
  METER_SCOPES,
  SCOPE_HINT,
  SCOPE_LABEL,
  SOURCE_LABEL,
  chipLabel,
  type MeterScope,
  type RosterMember,
  type RosterSnap
} from '@shared/roster'

/** One member row: name, provenance, and the remove that hides it. */
function MemberRow({ m, onRemove }: { m: RosterMember; onRemove: (name: string) => void }): React.JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.25 }}>
      <Typography
        variant="body2"
        sx={{ flexGrow: 1, minWidth: 0, color: m.stale ? 'text.disabled' : 'text.primary' }}
      >
        {m.name}
      </Typography>
      {/* STALE is its own word, not just a dimmer row: the app is saying "I have not heard from
          this group since you were last offline", and EQ drops groups silently on camp. The row
          is still counted — hiding a real member is the worse error. */}
      {m.stale && (
        <Tooltip title="No signal since you were last offline. Still counted - EQ never says when a group breaks.">
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            stale
          </Typography>
        </Tooltip>
      )}
      <Tooltip title={`Since ${formatDate(m.sinceTs)}`}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {SOURCE_LABEL[m.source]}
        </Typography>
      </Tooltip>
      <Tooltip title="Hide this row from the Group scope. Their damage stays recorded, and stays visible under Everyone.">
        <IconButton size="small" aria-label={`Remove ${m.name}`} onClick={() => onRemove(m.name)} sx={{ p: 0.25 }}>
          <CloseIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}

/** The add box — the member whose join message the log never carried. */
function AddMember({ onAdd }: { onAdd: (name: string) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const submit = (): void => {
    const name = text.trim()
    if (name === '') return
    onAdd(name)
    setText('')
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75 }}>
      <TextField
        size="small"
        variant="outlined"
        placeholder="Add a name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        slotProps={{
          htmlInput: { 'aria-label': 'Add a group member by name', style: { fontSize: 12, padding: '4px 8px' } }
        }}
        sx={{ flexGrow: 1 }}
      />
      <Button size="small" onClick={submit} sx={{ fontSize: 11, minWidth: 0, px: 1 }}>
        Add
      </Button>
    </Stack>
  )
}

/** The popover body: the roster, or the honest empty state. */
function RosterPanel({
  roster,
  onAdd,
  onRemove
}: {
  roster: RosterSnap
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}): React.JSX.Element {
  return (
    <Box sx={{ p: 1.25, width: 260 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        Group roster
      </Typography>
      {roster.members.length === 0 ? (
        // NOT a zeroed list, and NOT one sentence. `seen` is the difference between two empty
        // rosters that mean opposite things, and the Group scope behaves differently in each —
        // so saying the same words for both would make one of them a lie:
        //
        //   seen: false  we have been told NOTHING. Group falls back to Everyone (law 1 —
        //                unknown must not hide people), so the meter really is showing all.
        //   seen: true   we were told, and the group is over. Group means just you now, and
        //                it is genuinely filtering.
        <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 0.5 }}>
          {roster.seen
            ? 'Nobody on the roster right now - the Group scope is showing you and your pets.'
            : 'No group signal yet this session - the Group scope is showing everyone.'}
        </Typography>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          {roster.members.map((m) => (
            <MemberRow key={m.key} m={m} onRemove={onRemove} />
          ))}
        </Box>
      )}
      <AddMember onAdd={onAdd} />
    </Box>
  )
}

/**
 * The scope switch: the three scopes with this tab's one lit, and the group icon beside it opening
 * the roster. The roster button is its own control —
 * it is the only place a mis-inferred group can be corrected, and correcting it is a different act
 * from choosing a scope.
 */
export function ScopeStatus({
  scope,
  roster
}: {
  scope: MeterScope
  roster: RosterSnap
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [, setScope] = useCombatTabScope()
  // `chipLabel` is the one place the fallback wording is decided (shared/roster.ts).
  const fallback = chipLabel(scope, roster) !== SCOPE_LABEL[scope]
  const add =(name: string): void => {
    void window.eq.setRosterEdit({ name, action: 'add' })
  }
  const remove = (name: string): void => {
    void window.eq.setRosterEdit({ name, action: 'remove' })
  }

  return (
    <>
      {/* THREE BUTTONS, the chosen one lit (fork owner, 2026-11-17: one word you had to know to
          click was "not obvious that it's a 3 way toggle"). The tab's other switches wear the
          same chrome (segmented.ts), so it reads as a switch at a glance. */}
      <ToggleButtonGroup
        size="small"
        exclusive
        value={scope}
        data-testid="meter-scope"
        title={`${SCOPE_HINT[scope]}. This tab only.`}
        // `exclusive` hands back null when the lit button is pressed; scope has no "off".
        onChange={(_e: unknown, v: MeterScope | null) => v && setScope(v)}
        sx={segmented('quiet')}
      >
        {METER_SCOPES.map((s) => (
          <ToggleButton key={s} value={s} data-testid={`meter-scope-${s}`}>
            {s === scope ? <span data-testid="meter-scope-label">{SCOPE_LABEL[s]}</span> : SCOPE_LABEL[s]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {/* Law 1's fallback, said where the rows are: Group with no roster shows everybody. Its own
          shrinking caption, not button text: the lens line never wraps, and a 121px label inside a
          button that cannot shrink once pushed this bar 30px past a 720px window (2026-08-06). */}
      {fallback && (
        <Typography
          variant="caption"
          noWrap
          data-testid="meter-scope-note"
          title="No group signal yet, so Group shows everyone"
          sx={{ minWidth: 0, color: 'text.secondary' }}
        >
          (no roster yet)
        </Typography>
      )}
      <Tooltip title="Who the app thinks is in your group, and why">
        <IconButton
          size="small"
          data-testid="roster-open"
          aria-label="Show the group roster"
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
          sx={{ p: 0.25 }}
        >
          <GroupIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      {anchor && (
        <ClickAwayListener
          onClickAway={(e) => {
            // Ignore the click that is closing us by toggling the trigger — otherwise the
            // trigger would close and immediately reopen (the FightPicker precedent).
            if (e.target instanceof Node && anchor.contains(e.target)) return
            setAnchor(null)
          }}
        >
          <Popper open anchorEl={anchor} placement="bottom-start" sx={{ zIndex: 1300 }}>
            <Paper variant="outlined" data-testid="roster-popover" elevation={8}>
              <RosterPanel roster={roster} onAdd={add} onRemove={remove} />
            </Paper>
          </Popper>
        </ClickAwayListener>
      )}
    </>
  )
}
