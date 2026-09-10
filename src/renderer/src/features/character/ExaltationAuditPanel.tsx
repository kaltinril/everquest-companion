// character/ExaltationAuditPanel.tsx - the cleanup advisor's panel (fork asks, kaltinril
// 2026-09-09, revised the same night: terse and actionable). Four short lists, each a verb:
//
//   SWAP  - a socketed gem with a strictly better LOOSE copy of the same effect family, usable
//           by the current loadout. These are also the RED cards on the grid.
//   FILL  - an open empty socket and the best remaining loose gem that fits it.
//   SCRAP - a loose lower tier whose better copy is also owned; safe to feed to a merge.
//   COPIES - duplicates, counted and never commanded (a spare may be for a second item).
//
// The greedy honesty clause lives on the recommender (exaltationAudit.ts): same-family swaps
// only, no invented cross-family exchange rate, one physical copy never recommended twice. This
// panel renders nothing when there is nothing to do.

import { type JSX } from 'react'
import { Paper, Stack, Typography } from '@mui/material'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import type { DuplicateFinding, ExaltationAudit } from './exaltationAudit'
import type { Recommendations } from './socketRecommend'
import type { BoardPlan } from './socketOptimize'

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

/** One list under one verb - nothing at all when the list is empty. */
function Section({ title, lines }: { title: string; lines: JSX.Element[] }): JSX.Element | null {
  if (lines.length === 0) return null
  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {lines}
    </>
  )
}

function swapLines(recs: Recommendations): JSX.Element[] {
  return recs.swaps.map((s, i) => (
    <Typography key={`s${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-swap">
      {`${s.cellLabel} ${s.type}: `}
      <Name>{s.fromName}</Name>
      {` (${s.fromEffect}) → `}
      <Name>{s.toName}</Name>
      {` (${s.toEffect}), copy in ${s.toWhere}`}
    </Typography>
  ))
}

function fillLines(recs: Recommendations): JSX.Element[] {
  return recs.fills.map((f, i) => (
    <Typography key={`f${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-fill">
      {`${f.cellLabel} ${f.type} is empty: socket `}
      <Name>{f.gemName}</Name>
      {` (${f.effect}) from ${f.where}`}
    </Typography>
  ))
}

function redundantLines(recs: Recommendations): JSX.Element[] {
  return recs.redundant.map((r, i) => (
    <Typography key={`r${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-redundant">
      {r.keptEffect === r.effect
        ? `${r.cellLabel} ${r.type}: a second ${r.effect} adds nothing (one is in ${r.keptIn})`
        : `${r.cellLabel} ${r.type}: ${r.effect} grants nothing (${r.keptEffect} in ${r.keptIn} outranks it)`}
      {r.replaceWith === undefined ? null : (
        <>
          {` → socket `}
          <Name>{r.replaceWith.name}</Name>
          {` (${r.replaceWith.effect}) from ${r.replaceWith.where}`}
        </>
      )}
    </Typography>
  ))
}

/** Loose lower tiers only - the socketed ones are the SWAP list's and the red cards' job. */
function scrapLines(audit: ExaltationAudit): JSX.Element[] {
  return audit.superseded
    .filter((f) => !f.socketed)
    .map((f, i) => (
      <Typography key={`x${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-scrap">
        <Name>{f.name}</Name>
        {` (${f.effect}) in ${f.wheres.join(', ')} - outclassed by `}
        <Name>{f.betterName}</Name>
        {` (${f.betterEffect})`}
      </Typography>
    ))
}

/** The whole-board plan: the moves to reach it, and the contests only a player can judge. */
function planLines(plan: BoardPlan): JSX.Element[] {
  const out: JSX.Element[] = plan.moves.map((m, i) => (
    <Typography key={`p${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-plan-move">
      {`${m.cellLabel} ${m.type}: socket `}
      <Name>{m.gemName}</Name>
      {` (${m.effect})`}
      {m.replacesName === null
        ? ' into the empty socket'
        : ` - replaces ${m.replacesEffect ?? m.replacesName}`}
    </Typography>
  ))
  for (const [i, c] of plan.contested.entries()) {
    out.push(
      <Typography key={`c${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-plan-contested">
        {`${c.effect} (`}
        <Name>{c.gemName}</Name>
        {c.noSeat
          ? `) has no legal socket on what you wear`
          : `) stays benched: ${c.options.map((o) => `${o.cellLabel} ${o.type} holds ${o.heldBy}`).join('; ')} - your call which you value more`}
      </Typography>
    )
  }
  return out
}

function copyLine(f: DuplicateFinding): JSX.Element {
  return (
    <Typography key={f.name} variant="caption" color="text.secondary" data-testid="exaltation-duplicate">
      <Name>{f.name}</Name>
      {` x${String(f.copies)} (${String(f.socketed)} socketed): ${f.wheres.join(', ')}`}
    </Typography>
  )
}

export default function ExaltationAuditPanel({
  recs,
  audit,
  plan
}: {
  recs: Recommendations | null
  audit: ExaltationAudit | null
  plan: BoardPlan | null
}): JSX.Element | null {
  if (recs === null || audit === null) return null
  const board = plan === null ? [] : planLines(plan)
  const swaps = swapLines(recs)
  const fills = fillLines(recs)
  const redundant = redundantLines(recs)
  const scrap = scrapLines(audit)
  const copies = audit.duplicates.map(copyLine)
  if (board.length + swaps.length + fills.length + redundant.length + scrap.length + copies.length === 0) return null
  return (
    <Paper variant="outlined" data-testid="exaltation-audit" sx={{ p: 1.5 }}>
      <Stack spacing={0.5}>
        <Typography variant="subtitle2">Exaltation cleanup</Typography>
        <Section title="Best layout (max distinct effects - a provable maximum, not a guess)" lines={board} />
        <Section title="Swap (the red cards)" lines={swaps} />
        <Section title="Dead sockets (same effect twice - it does not stack)" lines={redundant} />
        <Section title="Fill an empty socket" lines={fills} />
        <Section title="Scrap candidates" lines={scrap} />
        <Section title="Copies" lines={copies} />
        <Typography variant="caption" color="text.disabled">
          Assumes same-name effects do not stack (only the highest applies). Upgrades compare
          within one effect family only; nothing is changed for you.
        </Typography>
      </Stack>
    </Paper>
  )
}
