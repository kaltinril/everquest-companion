// gear/BisTargets.tsx — THE TOTALS TABLE AND ITS TARGETS (owner, 2026-11-24: *"what if I want to set targets
// for stats in the bottom also?"*; *"resist gear should have a target of about 200 if you're going to be
// tanking"*; *"default off and if they click a button they can assign targets"*).
//
// A TARGET IS THE BOARD'S CAP, not a second idea: the stat counts only up to it across the loadout, so
// the sheet stops buying it there and spends the slots on other stats. The chip menu's "Cap the
// loadout at" and this column edit the same number. Off by default: the column and its fill buttons
// show only after "Set targets".
//
// THE ATTRIBUTE CAP: Legends publishes 510 (agent/MEASURED.md); reincarnation AAs raise it ("a permanent
// increase to your stat caps", Rulers of Kunark page) but no page states by how much, so the player
// types their own and the fill uses it.

import { useEffect, useState, type JSX } from 'react'
import { Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import type { TierChip, TierSetup } from '@shared/planner/tierChips'
import { CAPPED_ATTRIBUTES, LEGENDS_STAT_CAP, tankResistTargets, withCaps, type BisPrefs } from './bisPrefs'
import type { TotalsRow } from './bisText'

export interface BisTargetsProps {
  rows: readonly TotalsRow[]
  /** the slider's tier the totals are at */
  plus: number
  prefs: BisPrefs
  setPrefs: (p: BisPrefs) => void
  setup: TierSetup
}

/** One target box: typed freely, committed on Enter or leaving the box; empty clears it. */
function TargetInput({ row, onSet }: { row: TotalsRow; onSet: (chip: TierChip, v: number | undefined) => void }): JSX.Element {
  const [text, setText] = useState(row.capValue === undefined ? '' : String(row.capValue))
  useEffect(() => setText(row.capValue === undefined ? '' : String(row.capValue)), [row.capValue])
  const commit = (): void => {
    const n = Number(text)
    onSet(row.chip, text.trim() === '' || !Number.isFinite(n) || n <= 0 ? undefined : n)
  }
  return (
    <TextField
      size="small"
      value={text}
      placeholder={row.capDefault === undefined ? 'none' : String(row.capDefault)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': `bis-target-${row.chip}`, style: { textAlign: 'right', padding: '2px 6px' } } }}
      sx={{ width: 90 }}
    />
  )
}

function Toolbar({ prefs, setPrefs, setup }: Omit<BisTargetsProps, 'rows' | 'plus'>): JSX.Element {
  const [cap, setCap] = useState(String(prefs.statCap))
  const set = (change: Partial<Record<TierChip, number | undefined>>): void => setPrefs(withCaps(prefs, setup, change))
  const statCap = Number(cap) > 0 ? Math.round(Number(cap)) : LEGENDS_STAT_CAP
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="bis-targets-bar">
      <Button size="small" variant={prefs.targets ? 'contained' : 'outlined'} onClick={() => setPrefs({ ...prefs, targets: !prefs.targets })} data-testid="bis-targets-toggle">
        {prefs.targets ? 'Hide targets' : 'Set targets'}
      </Button>
      {prefs.targets && (
        <>
          <Button size="small" variant="outlined" onClick={() => set(tankResistTargets(setup.split))} data-testid="bis-targets-resists">
            Resists 200 (tanking)
          </Button>
          <TextField
            size="small"
            label="Your stat cap"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            onBlur={() => setPrefs({ ...prefs, statCap })}
            slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'bis-stat-cap' } }}
            sx={{ width: 120 }}
          />
          <Button size="small" variant="outlined" onClick={() => setPrefs({ ...withCaps(prefs, setup, Object.fromEntries(CAPPED_ATTRIBUTES.map((c) => [c, statCap]))), statCap })} data-testid="bis-targets-attrs">
            Attributes to the cap
          </Button>
          <Button size="small" color="warning" onClick={() => set(Object.fromEntries(Object.keys(prefs.caps).map((c) => [c, undefined])))} data-testid="bis-targets-clear">
            Clear targets
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ flexBasis: '100%' }}>
            A target stops a stat counting once the loadout reaches it, so the sheet spends the remaining slots on your other stats. Attributes stop counting at 510 by default (the hard cap on eqlwiki's Statistics page), STA inside HP and INT/WIS inside Mana too; a target you set wins. Reincarnation AAs raise the cap (no published amount), so type your own.
          </Typography>
        </>
      )}
    </Stack>
  )
}

export default function BisTargets({ rows, plus, prefs, setPrefs, setup }: BisTargetsProps): JSX.Element {
  const onSet = (chip: TierChip, v: number | undefined): void => setPrefs(withCaps(prefs, setup, { [chip]: v }))
  return (
    <Stack spacing={1}>
      <Toolbar prefs={prefs} setPrefs={setPrefs} setup={setup} />
      <Table size="small" data-testid="bis-totals">
        <TableHead>
          <TableRow>
            <TableCell>Stat</TableCell>
            <TableCell>Tier</TableCell>
            <TableCell align="right">{`Best in slot (+${String(plus)})`}</TableCell>
            <TableCell align="right">{`Worn (+${String(plus)})`}</TableCell>
            <TableCell align="right">{prefs.targets ? 'Target' : 'Cap'}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.chip}>
              <TableCell>{r.label}</TableCell>
              <TableCell>{r.tier === 'Off' ? 'Unassigned' : r.tier}</TableCell>
              <TableCell align="right" sx={{ color: r.capped ? 'success.main' : undefined }}>{r.best}</TableCell>
              <TableCell align="right" sx={{ color: r.capValue === undefined ? 'text.secondary' : r.wornReached ? 'success.main' : 'warning.main' }}>{r.worn}</TableCell>
              <TableCell align="right">{prefs.targets ? <TargetInput row={r} onSet={onSet} /> : r.cap}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  )
}
