// character/ExaltationAudit.tsx — the cleanup advisor's panel (fork ask, kaltinril 2026-09-09).
//
// Renders `exaltationAudit.ts`'s two finding lists and NOTHING when both are empty — a sheet with
// tidy sockets should not carry an empty card congratulating it. Every sentence is advice over
// the player's own dump; the panel deletes nothing and links nothing (the Wish list precedent:
// this tab takes no router). The class gate behind the "outclassed" rows is the character's
// CURRENT loadout (the same detected trio the Gear tab reads), and the caption says so, because
// a swap to a caster loadout changes which higher tiers count as usable.

import { useMemo, type JSX } from 'react'
import { Chip, Paper, Stack, Typography } from '@mui/material'
import { resolvedClasses } from '@shared/classCombo'
import type { OwnedExaltation } from '@shared/characterSheet'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import { useComboSnap } from '../profiles/ClassComboData'
import { useGearIndex } from '../gear/gearData'
import { auditExaltations, type DuplicateFinding, type SupersededFinding } from './exaltationAudit'

/** An item name that opens the same hover card every other item name in the app opens. */
function Name({ children }: { children: string }): JSX.Element {
  return (
    <KnownItemTooltip name={children}>
      <Typography component="span" variant="body2" sx={{ textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
        {children}
      </Typography>
    </KnownItemTooltip>
  )
}

function DuplicateRow({ f }: { f: DuplicateFinding }): JSX.Element {
  const loose = f.copies - f.socketed
  return (
    <Typography variant="body2" color="text.secondary" data-testid="exaltation-duplicate">
      <Name>{f.name}</Name>
      {` - ${String(f.copies)} copies (${String(f.socketed)} socketed, ${String(loose)} loose): ${f.wheres.join(', ')}`}
    </Typography>
  )
}

function SupersededRow({ f }: { f: SupersededFinding }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" data-testid="exaltation-superseded">
      {/* A WORN worse tier is the finding worth a loud chip - you are using the weaker one. */}
      {f.socketed && <Chip size="small" color="warning" label="worn" sx={{ height: 16 }} />}
      <Typography variant="body2" color="text.secondary">
        {`${f.effect} (`}
        <Name>{f.name}</Name>
        {`) - outclassed by ${f.betterEffect} (`}
        <Name>{f.betterName}</Name>
        {`). In: ${f.wheres.join(', ')}`}
      </Typography>
    </Stack>
  )
}

export default function ExaltationAudit({ exaltations }: { exaltations: OwnedExaltation[] }): JSX.Element | null {
  const gear = useGearIndex()
  const combo = useComboSnap()
  // Read once so the memo keys on the VALUE (the gearData precedent - `combo.current` itself is
  // mutable and not a valid dependency).
  const current = combo.current
  const classes = useMemo(() => (current === null ? [] : resolvedClasses(current)), [current])
  const audit = useMemo(
    () => auditExaltations(exaltations, gear.rows, classes),
    [exaltations, gear.rows, classes]
  )
  if (audit.duplicates.length === 0 && audit.superseded.length === 0) return null
  return (
    <Paper variant="outlined" data-testid="exaltation-audit" sx={{ p: 1.5 }}>
      <Stack spacing={0.75}>
        <Typography variant="subtitle2">Exaltation cleanup</Typography>
        {audit.superseded.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              Outclassed tiers - a better copy of the same effect is in your dump and usable by
              this loadout:
            </Typography>
            {audit.superseded.map((f, i) => (
              <SupersededRow key={`${f.name}#${String(i)}`} f={f} />
            ))}
          </>
        )}
        {audit.duplicates.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              Multiple copies - spares may be for a second item, so nothing here says destroy:
            </Typography>
            {audit.duplicates.map((f) => (
              <DuplicateRow key={f.name} f={f} />
            ))}
          </>
        )}
      </Stack>
    </Paper>
  )
}
