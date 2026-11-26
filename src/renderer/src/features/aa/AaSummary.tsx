// aa/AaSummary.tsx — the Summary sub-tab: "What your AAs give you" (shared/aaStats.ts) in groups under
// amber titles, and the Recommendations beside it (shared/aaRecommend.ts).

import { type JSX, useMemo, useState } from 'react'
import { Box, LinearProgress, Link, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { aaByGroup, type AaBoardRow } from '@shared/aaBoard'
import { AA_BANK_CAP, aaNotForPoints, aaRecFit, type AaRecItem, type AaRecs } from '@shared/aaRecommend'
import { aaSigned, aaStatTotals, type AaStatLine } from '@shared/aaStats'
import type { ClassAbbr } from '@shared/classCombo'
import { useAaNav } from './aaNav'

const LINK_SX = { cursor: 'pointer', color: 'success.main', '&:hover': { textDecoration: 'underline' } } as const

function StatLine({ line, board }: { line: AaStatLine; board: readonly AaBoardRow[] }): JSX.Element {
  const nav = useAaNav()
  return (
    <Box sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider', breakInside: 'avoid' }} data-testid="aa-stat">
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {line.stat}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {line.total === 0 && line.seeText ? 'see text' : aaSigned(line.total, line.unit)}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div">
        {line.from.map((f) => {
          const b = board.find((x) => x.r.key === f.key)
          return (
            <Box key={f.key} component="span" sx={{ mr: 1.25, ...(b === undefined ? {} : LINK_SX), color: 'text.secondary' }} onClick={b === undefined ? undefined : () => nav.jump(b)}>
              {`${f.name} ${f.n === null ? 'see text' : aaSigned(f.n, line.unit)}`}
            </Box>
          )
        })}
        {line.stat === 'Stat cap' && (
          <Link component="button" variant="caption" onClick={() => nav.go('bis')} color="success.main">
            Best in slot
          </Link>
        )}
      </Typography>
    </Box>
  )
}

function RecLine({ item, budget }: { item: AaRecItem; budget: number }): JSX.Element {
  const nav = useAaNav()
  const { b } = item
  const fit = aaRecFit(item, budget)
  const more = b.max - b.r.rank > 1 ? ` · ${String(item.toMax)} to max` : ''
  return (
    <Box sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }} data-testid="aa-rec">
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="body2" sx={{ ...LINK_SX, flex: 1 }} onClick={() => nav.jump(b)}>
          {b.r.key}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {item.next === null ? '? pts' : item.next === 0 ? 'free' : `${String(item.next)} pts`}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.disabled" component="div">
        {`${String(b.r.rank)} → ${String(b.r.rank + 1)} of ${String(b.max)}${more} · ${b.effect.label}${item.gives === null ? '' : ` ${item.gives}`}`}
        {fit !== null && <Box component="span" sx={{ color: 'success.main' }}>{` · ${fit}`}</Box>}
      </Typography>
    </Box>
  )
}

function Recommendations({ recs, board, unspent, classes, onSpecial }: { recs: AaRecs; board: readonly AaBoardRow[]; unspent: number | null; classes: readonly ClassAbbr[]; onSpecial: () => void }): JSX.Element {
  const nav = useAaNav()
  const [sort, setSort] = useState<'cheap' | 'group'>('cheap')
  const budget = unspent ?? 0
  const groups = useMemo(() => aaByGroup(recs.items, (i) => i.b.effect.group), [recs.items])
  const bane = aaNotForPoints(board).banestrike
  const combo = classes.join('/')
  return (
    <Paper variant="outlined" sx={{ p: 1.5, alignSelf: 'start' }} data-testid="aa-recommendations">
      <Typography variant="subtitle2">Recommendations</Typography>
      {recs.items.length === 0 ? (
        <Typography variant="caption" color="text.secondary" component="div">
          {`Everything ${combo === '' ? 'you' : combo} can buy is maxed.${unspent === null ? '' : ` ${String(unspent)} of ${String(AA_BANK_CAP)} points banked.`}`}
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary" component="div">
          {`${String(budget)} unspent cover ${String(recs.used)} of the ${String(recs.total)} points left`}
        </Typography>
      )}
      <LinearProgress
        variant="determinate"
        color="warning"
        value={recs.items.length === 0 ? Math.min(100, (budget / AA_BANK_CAP) * 100) : recs.total === 0 ? 0 : Math.min(100, (recs.used / recs.total) * 100)}
        sx={{ my: 0.75, height: 4, borderRadius: 2 }}
      />
      {recs.items.length > 0 && (
        <ToggleButtonGroup exclusive size="small" value={sort} onChange={(_e, v: 'cheap' | 'group' | null) => v !== null && setSort(v)} sx={{ my: 0.5 }}>
          <ToggleButton value="cheap" sx={{ textTransform: 'none', py: 0.1, fontSize: 12 }}>Cheapest first</ToggleButton>
          <ToggleButton value="group" sx={{ textTransform: 'none', py: 0.1, fontSize: 12 }}>By what it does</ToggleButton>
        </ToggleButtonGroup>
      )}
      {sort === 'cheap'
        ? recs.items.map((i) => <RecLine key={i.b.r.key} item={i} budget={budget} />)
        : groups.map((g) => (
            <Box key={g.group}>
              <Typography variant="overline" color="warning.main" component="div" sx={{ lineHeight: 1.8 }}>
                {g.label}
              </Typography>
              {g.items.map((i) => (
                <RecLine key={i.b.r.key} item={i} budget={budget} />
              ))}
            </Box>
          ))}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        Not bought with points:
      </Typography>
      {bane !== null && (
        <Typography variant="caption" component="div">
          {`Banestrike ${String(bane.rank)} of ${String(bane.max)} · `}
          <Link component="button" variant="caption" color="success.main" onClick={() => nav.go('slayer')}>
            Slayer achievements
          </Link>
        </Typography>
      )}
      <Typography variant="caption" component="div">
        {'Class and race lines · '}
        <Link component="button" variant="caption" color="success.main" onClick={onSpecial}>
          plan a reincarnation
        </Link>
      </Typography>
    </Paper>
  )
}

export interface AaSummaryProps {
  board: AaBoardRow[]
  /** Another combo than the detected one is in force. */
  planning: boolean
  recs: AaRecs
  unspent: number | null
  classes: readonly ClassAbbr[]
  onSpecial: () => void
}

export function AaSummary(p: AaSummaryProps): JSX.Element {
  const groups = useMemo(() => aaStatTotals(p.board), [p.board])
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 2 }} data-testid="aa-summary">
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          What your AAs give you
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          {`Totals from your ranks${p.planning ? `, for ${p.classes.join('/')}` : ''}. Click an AA to open its row.`}
        </Typography>
        <Box sx={{ columnCount: { xs: 1, md: 2, xl: 3 }, columnGap: 3 }}>
          {groups.map((g) => (
            <Box key={g.group} sx={{ breakInside: 'avoid', mb: 1.5 }}>
              <Typography variant="overline" color="warning.main" component="div" sx={{ fontWeight: 700, lineHeight: 1.8 }}>
                {g.group}
              </Typography>
              {g.lines.map((l) => (
                <StatLine key={l.stat} line={l} board={p.board} />
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      <Recommendations recs={p.recs} board={p.board} unspent={p.unspent} classes={p.classes} onSpecial={p.onSpecial} />
    </Box>
  )
}
