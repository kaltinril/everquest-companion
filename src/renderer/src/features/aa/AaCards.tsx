// aa/AaCards.tsx — the Alt. Advancement tab's top row: Points, Pace, Spend your points, and the AAs
// the log cannot settle (a one-rank AA `/alt list` prints the same owned or not).
//
// Pace is the Leveling tab's own AA pace (shared/aaPace.ts, worded by leveling/aaPaceRows.ts) over the
// app-wide slice (features/timeslice): Session, Zone + Session, Zone, All. A slice the log cannot
// define yet is shown disabled with its reason, never filled with a number.

import { type JSX, type ReactNode, useMemo } from 'react'
import { Box, Button, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { aaPace } from '@shared/aaPace'
import { aaCantTell, aaSpent, type AaBoardRow } from '@shared/aaBoard'
import { AA_BANK_CAP, type AaRecs } from '@shared/aaRecommend'
import { AaUnspentLine } from './AaUnspentLine'
import { rangeStats } from '@shared/progressionStats'
import { sliceLabel, type SliceId } from '@shared/timeslice'
import type { LevelingSnap } from '@shared/types'
import { useModule } from '../../lib/useModule'
import { Tooltip } from '../../lib/Tooltip'
import { aaPaceCaption, aaPaceTiles } from '../leveling/aaPaceRows'
import { useRateBasis } from '../timeslice/useRateBasis'
import { useTimeslice } from '../timeslice/useTimeslice'
import { useAaNav } from './aaNav'

const PACE_SLICES: readonly SliceId[] = ['session', 'zoneSession', 'zone', 'all']
const SLICE_WHY: Partial<Record<SliceId, string>> = {
  session: 'Your log has no login line yet, so there is no session to measure.',
  zone: 'Your log has not named a zone yet.',
  zoneSession: 'Needs both a login line and a zone line in your log.'
}

export function Card({ title, extra, children, testId }: { title: string; extra?: ReactNode; children: ReactNode; testId: string }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 240px', minWidth: 0 }} data-testid={testId}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
          {title}
        </Typography>
        {extra}
      </Stack>
      {children}
    </Paper>
  )
}

function Figure({ value, label, amber = false, title }: { value: string; label: string; amber?: boolean; title?: string }): JSX.Element {
  const body = (
    <Box>
      <Typography variant="h5" sx={{ lineHeight: 1.1, fontWeight: 600 }} color={amber ? 'warning.main' : 'text.primary'}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  )
  return title === undefined ? body : <Tooltip title={title}>{body}</Tooltip>
}

/** Unspent from the log, and what the held ranks cost at the corrected prices. */
export function PointsCard({ unspent, ownBoard, planning }: { unspent: number | null; ownBoard: AaBoardRow[]; planning: boolean }): JSX.Element {
  const spent = aaSpent(ownBoard)
  return (
    <Card title="Points" testId="aa-points-card">
      <Stack direction="row" spacing={3}>
        <Figure value={unspent === null ? '-' : String(unspent)} label={unspent === null ? 'no point line in your log yet' : 'unspent, from your log'} amber />
        <Figure value={`${String(spent.spent)}${spent.unknown ? '+' : ''}`} label={planning ? "spent, your own classes, wiki's prices" : "spent, at the wiki's prices"} />
      </Stack>
      <AaUnspentLine />
    </Card>
  )
}

function ScopeChips({ available, id, setId }: { available: readonly SliceId[]; id: SliceId; setId: (id: SliceId) => void }): JSX.Element {
  const ids = PACE_SLICES.includes(id) ? PACE_SLICES : [...PACE_SLICES, id]
  return (
    <Stack direction="row" spacing={0.5} sx={{ ml: 'auto' }} data-testid="aa-pace-scopes">
      {ids.map((s) => {
        const can = available.includes(s)
        const chip = (
          <Chip
            size="small"
            label={sliceLabel(s)}
            color={s === id ? 'warning' : 'default'}
            variant={s === id ? 'filled' : 'outlined'}
            disabled={!can}
            onClick={can ? () => setId(s) : undefined}
            sx={{ height: 20, fontSize: 11 }}
            data-testid={`aa-pace-${s}`}
          />
        )
        return can || SLICE_WHY[s] === undefined ? (
          <Box key={s}>{chip}</Box>
        ) : (
          <Tooltip key={s} title={SLICE_WHY[s]}>
            <Box component="span">{chip}</Box>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

/** AA pace over the slice in force: the next point, AAs an hour, points an hour. */
export function PaceCard(): JSX.Element {
  const snap = useModule<LevelingSnap>('leveling')
  const gains = snap?.aaGains
  const extraTs = useMemo(() => (gains ?? []).map((g) => g.ts), [gains])
  const { prog, available, slice, setId } = useTimeslice(extraTs, 'session')
  const { basis } = useRateBasis()
  const pace = useMemo(() => {
    if (snap === null || snap.aaGains.length === 0) return null
    const window = rangeStats({ snap: prog, range: slice.range, zoneKey: slice.zoneKey, zoneExactKey: slice.zoneExactKey })
    return aaPace({ leveling: snap, prog, window })
  }, [snap, prog, slice])
  const tiles = pace === null ? [] : aaPaceTiles(pace, basis)
  const order = ['eta', 'rate', 'points']
  return (
    <Card title="Pace" extra={<ScopeChips available={available} id={slice.id} setId={setId} />} testId="aa-pace-card">
      {pace === null ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No AA points in your log yet.
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={3}>
            {order.map((id) => {
              const t = tiles.find((x) => x.id === id)
              return t === undefined ? null : <Figure key={id} value={`${t.value}${t.unit === '' ? '' : ` ${t.unit}`}`} label={t.label} title={t.title} />
            })}
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>
            {aaPaceCaption(pace, basis)}
          </Typography>
        </>
      )}
    </Card>
  )
}

function BankBar({ unspent }: { unspent: number }): JSX.Element {
  return (
    <>
      <LinearProgress variant="determinate" color="warning" value={Math.min(100, (unspent / AA_BANK_CAP) * 100)} sx={{ my: 0.75, height: 4, borderRadius: 2 }} />
      <Typography variant="caption" sx={{ color: 'text.disabled' }}>{`${String(unspent)} of ${String(AA_BANK_CAP)} banked`}</Typography>
    </>
  )
}

/** The top recommendations, or the bank when there is nothing to buy. */
export function SpendCard({ recs, unspent }: { recs: AaRecs; unspent: number | null }): JSX.Element {
  const nav = useAaNav()
  const budget = unspent ?? 0
  const top = recs.items.slice(0, 4)
  return (
    <Card title={recs.items.length === 0 ? 'Points banked' : unspent === null ? 'Spend your points' : `Spend your ${String(unspent)}`} testId="aa-spend-card">
      {recs.items.length === 0 ? (
        <>
          <Typography variant="body2">{`Nothing to buy: points bank up to ${String(AA_BANK_CAP)}.`}</Typography>
          {unspent !== null && <BankBar unspent={unspent} />}
        </>
      ) : (
        <>
          {top.map((i) => (
            <Stack key={i.b.r.key} direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
              <Typography variant="body2" sx={{ color: 'success.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} noWrap onClick={() => nav.jump(i.b)}>
                {i.b.r.key}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }} noWrap>{`${String(i.b.r.rank)} → ${String(i.b.r.rank + 1)}`}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }} noWrap>
                {i.next === null ? '? pts' : i.next === 0 ? 'free' : `${String(i.next)} pts`}
              </Typography>
            </Stack>
          ))}
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            {`${String(recs.used)} of ${String(budget)} points · ${String(recs.total)} to max everything`}
          </Typography>
        </>
      )}
    </Card>
  )
}

/** The usable AAs the log cannot settle, each with a one-click "I have it" (the player's pick). */
export function CantTellCard({ board, setPick }: { board: readonly AaBoardRow[]; setPick: (key: string, rank: number | null) => void }): JSX.Element | null {
  const nav = useAaNav()
  const rows = aaCantTell(board)
  if (rows.length === 0) return null
  return (
    <Card title="Can't tell from the log" testId="aa-cant-tell">
      {rows.map((b) => (
        <Stack key={b.r.key} direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography variant="body2" sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} noWrap onClick={() => nav.jump(b)}>
            {b.r.key}
          </Typography>
          <Button size="small" sx={{ ml: 'auto', textTransform: 'none', py: 0, minWidth: 0 }} onClick={() => setPick(b.r.key, b.max)} data-testid="aa-have-it">
            I have it
          </Button>
        </Stack>
      ))}
    </Card>
  )
}
