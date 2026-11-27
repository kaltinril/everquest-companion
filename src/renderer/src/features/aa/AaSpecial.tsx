// aa/AaSpecial.tsx — the Special sub-tab: the stat cap as a sum with the next reincarnation planned,
// the lines started, one Completionist line, and the lines not started folded into one line
// (shared/aaSpecial.ts). Fits about one screen until opened.

import { type JSX, Fragment, useMemo, useState } from 'react'
import { Box, Chip, Link, Paper, Stack, Typography } from '@mui/material'
import { aaMatches, type AaBoardRow } from '@shared/aaBoard'
import { RULERS_OF_KUNARK } from '@shared/reincarnationCap'
import { aaCapView, aaDefaultRace, aaNextRebirth, aaSpecialLayout, type AaCapTerm } from '@shared/aaSpecial'
import type { ClassAbbr } from '@shared/classCombo'
import type { AaRanked } from '@shared/aaRanks'
import { AaList } from './AaList'
import { useAaNav } from './aaNav'
import type { SetPick } from './AaRowDetail'

function Sum({ terms, total, totalLabel }: { terms: readonly AaCapTerm[]; total: number; totalLabel: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-end', flexWrap: 'wrap' }} useFlexGap data-testid="aa-cap-sum">
      {terms.map((t, i) => (
        <Fragment key={t.label}>
          {i > 0 && <Typography sx={{ color: 'text.disabled' }}>+</Typography>}
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>{t.n}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t.label}</Typography>
          </Box>
        </Fragment>
      ))}
      <Typography sx={{ color: 'text.disabled' }}>=</Typography>
      <Box>
        <Typography variant="h6" sx={{ color: 'warning.main', lineHeight: 1.1 }}>{total}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{totalLabel}</Typography>
      </Box>
    </Stack>
  )
}

interface CapProps {
  board: AaBoardRow[]
  ranked: AaRanked[]
  reincarnations: number[]
  classes: readonly ClassAbbr[]
  races: { race: string; rank: number }[]
}

/** The cap block: the sum, its link to Best in slot, and one "next reincarnation" line with a plan. */
function CapBlock({ board, ranked, reincarnations, classes, races }: CapProps): JSX.Element {
  const nav = useAaNav()
  const cap = useMemo(() => aaCapView(ranked, reincarnations), [ranked, reincarnations])
  const [plan, setPlan] = useState(false)
  const [kunark, setKunark] = useState(() => Date.now() >= RULERS_OF_KUNARK)
  const [race, setRace] = useState(() => aaDefaultRace(races))
  const next = aaNextRebirth(board, reincarnations, { kunark, race }, classes)
  const unlocks = next.unlocks.length === 0 ? '' : `; ${next.unlocks.join(', ')} unlock`
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="aa-cap">
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Your stat cap</Typography>
      <Sum terms={cap.terms} total={cap.total} totalLabel={cap.soft ? 'soft cap' : 'hard cap'} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
        {cap.soft ? `Past ${String(cap.total)} a point counts a fifth. ` : 'No reincarnation in your log, so the cap is hard. '}
        <Link component="button" variant="body2" sx={{ color: 'success.main' }} onClick={() => nav.go('bis')}>Best in slot uses this cap</Link>
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }} data-testid="aa-next-rebirth">
        {`Next reincarnation: +${String(next.raise)} ${kunark ? 'from Dec 8' : 'before Dec 8'}`}
        {next.raceAdd > 0 ? ` and +${String(next.raceAdd)} as ${race}` : ''}
        {` → ${String(next.total)}${unlocks}. `}
        <Chip size="small" label="plan" variant={plan ? 'filled' : 'outlined'} onClick={() => setPlan(!plan)} sx={{ height: 20 }} data-testid="aa-plan-rebirth" />
      </Typography>
      {plan && (
        <Stack spacing={0.75} sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={0.75}>
            <Chip size="small" label="Before Dec 8 · +10" color={kunark ? 'default' : 'warning'} onClick={() => setKunark(false)} />
            <Chip size="small" label="From Dec 8 (Kunark) · +11" color={kunark ? 'warning' : 'default'} onClick={() => setKunark(true)} />
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
            {races.map((r) => (
              <Chip key={r.race} size="small" variant={r.race === race ? 'filled' : 'outlined'} color={r.race === race ? 'warning' : 'default'} label={r.rank > 0 ? `${r.race} ${String(r.rank)}/3` : r.race} onClick={() => setRace(r.race)} />
            ))}
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {next.raceGives === null ? `${race} is at rank 3.` : `${race} ${String(next.raceRank)} → ${String(next.raceRank + 1)}: ${next.raceGives}`}
          </Typography>
        </Stack>
      )}
    </Paper>
  )
}

export interface AaSpecialProps {
  board: AaBoardRow[]
  ranked: AaRanked[]
  reincarnations: number[]
  classes: readonly ClassAbbr[]
  setPick: SetPick
  query: string
}

export function AaSpecial(p: AaSpecialProps): JSX.Element {
  const [rest, setRest] = useState(false)
  const layout = useMemo(() => aaSpecialLayout(p.board, p.classes, (b) => aaMatches(b, p.query)), [p.board, p.classes, p.query])
  const searching = p.query.trim() !== ''
  const open = rest || searching
  const notStarted = layout.classLines.length + layout.raceLines.length
  const comp = layout.completionist
  return (
    <Box data-testid="aa-special">
      {!searching && <CapBlock board={p.board} ranked={p.ranked} reincarnations={p.reincarnations} classes={p.classes} races={layout.races} />}
      <AaList groups={layout.started.length === 0 ? [] : [{ title: 'Started', kind: 'mine', rows: layout.started }]} classes={p.classes} setPick={p.setPick} empty={searching ? 'Nothing started matches.' : 'No Special line started yet.'} />
      {comp !== null && !searching && (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 1, py: 1 }} data-testid="aa-completionist">
          {`Completionist ${String(comp.r.rank)}/${String(comp.max)}: every class line at rank 3 (${String(layout.classDone)} of ${String(layout.classTotal)} now${layout.classDoneNext > layout.classDone ? `, ${String(layout.classDoneNext)} after your next reincarnation` : ''}).`}
        </Typography>
      )}
      {notStarted > 0 && (
        <Link component="button" variant="body2" onClick={() => setRest(!rest)} sx={{ color: 'text.secondary', px: 1 }} aria-expanded={open} data-testid="aa-not-started">
          {`${open ? '▾' : '▸'} ${String(layout.classLines.length)} class lines and ${String(layout.raceLines.length)} race lines not started`}
        </Link>
      )}
      {open && notStarted > 0 && (
        <AaList groups={layout.rest} classes={p.classes} setPick={p.setPick} empty="" />
      )}
    </Box>
  )
}
