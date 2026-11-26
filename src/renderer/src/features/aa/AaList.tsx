// aa/AaList.tsx — a sub-tab's list: one line per AA (name, rank pips, rank, what it does, its points,
// the next rank's price), opened in place on a click (AaRowDetail).

import { type JSX, Fragment, useEffect, useRef } from 'react'
import { Box, TableSortLabel, Typography } from '@mui/material'
import { aaNotFor, aaSortGroups, aaStartLevel, type AaBoardRow, type AaListGroup, type AaSort } from '@shared/aaBoard'
import { aaCostText } from '@shared/aaCost'
import { aaEffectLine } from '@shared/aaEffects'
import type { ClassAbbr } from '@shared/classCombo'
import { Tooltip } from '../../lib/Tooltip'
import { aaDomId, aaRowId, useAaNav } from './aaNav'
import { AaRowDetail, Mark, type SetPick } from './AaRowDetail'

/** Name · level · pips · rank · effect · points · next: the pips column is fixed so every row lines up. */
const GRID = 'minmax(130px, 1.3fr) 44px 112px 84px minmax(120px, 2fr) 92px 72px'
const MAX_PIPS = 10
const SOURCE_WORD = { list: 'alt list', activated: 'used', pick: 'you', log: 'log', granted: 'granted', none: '' } as const
const SOURCE_TIP = {
  list: 'Read from your latest /alt list.',
  activated: 'Your log shows you using it.',
  pick: 'You set this rank; open the row to go back to the log.',
  log: "Your log's purchase lines show this rank.",
  granted: 'Free AA: the game grants it once you reach its level.',
  none: ''
} as const
const ELSEWHERE_TIP = 'Your log bought this under another class combo; these classes do not get it.'
const LEVEL_TIP = 'The level the wiki gives for rank 1. The wiki can be wrong: fix it there when the game says otherwise.'

/** The level column: rank 1's wiki level, "?" when the text does not state it clearly, "-" on Special rows (not level-gated). */
function LevelCell({ b }: { b: AaBoardRow }): JSX.Element {
  const level = b.r.row.section === 'special' ? '-' : (aaStartLevel(b) ?? '?')
  return (
    <Typography variant="caption" color={b.usable ? 'text.secondary' : 'text.disabled'} data-testid="aa-level">
      {String(level)}
    </Typography>
  )
}

/** The column headings; Name and Level sort the list when the list is sortable. */
function HeaderRow({ sort, setSort }: { sort?: AaSort; setSort?: (s: AaSort) => void }): JSX.Element {
  const sortable = sort !== undefined && setSort !== undefined
  const head = (key: 'name' | 'level', label: string): JSX.Element => {
    if (!sortable) return <span>{label}</span>
    const active = sort.key === key
    const next = (): void => {
      if (!active) setSort({ key, dir: 'asc' })
      else if (sort.dir === 'asc') setSort({ key, dir: 'desc' })
      else setSort({ key: 'wiki', dir: 'asc' })
    }
    return (
      <TableSortLabel active={active} direction={active ? sort.dir : 'asc'} onClick={next} data-testid={`aa-sort-${key}`}>
        {label}
      </TableSortLabel>
    )
  }
  const level = head('level', 'Lvl')
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: GRID, gap: 1.5, px: 1, pb: 0.25, borderBottom: 1, borderColor: 'divider', typography: 'caption', color: 'text.disabled' }} data-testid="aa-list-head">
      {head('name', 'Name')}
      <Tooltip title={LEVEL_TIP}>{level}</Tooltip>
      <span>Ranks</span>
      <span>Have</span>
      <span>What it does</span>
      <span>Points</span>
      <span>Next</span>
    </Box>
  )
}

/** The quiet note after an unusable row's name: another loadout's rank, "may apply", or "not for". */
function NotForNote({ b, classes }: { b: AaBoardRow; classes: readonly ClassAbbr[] }): JSX.Element | null {
  if (b.usable) return null
  const sx = { ml: 0.75, color: 'text.disabled', fontWeight: 400 }
  if (b.elsewhere) {
    return (
      <Tooltip title={ELSEWHERE_TIP}>
        <Box component="small" sx={sx} data-testid="aa-elsewhere">
          from another loadout
        </Box>
      </Tooltip>
    )
  }
  return <Box component="small" sx={sx}>{b.fit === 'mayApply' ? 'may apply' : aaNotFor(classes)}</Box>
}

function Pips({ b }: { b: AaBoardRow }): JSX.Element {
  const on = b.usable ? b.r.rank : 0
  if (b.max > MAX_PIPS) {
    return (
      <Box sx={{ height: 6, width: 96, bgcolor: 'action.selected', borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ height: 1, width: `${String(Math.round((on / b.max) * 100))}%`, bgcolor: 'text.secondary' }} />
      </Box>
    )
  }
  return (
    <Box sx={{ display: 'flex', gap: '3px' }} aria-hidden>
      {Array.from({ length: b.max }, (_, i) => (
        <Box key={i} sx={{ width: 8, height: 8, borderRadius: '2px', border: 1, borderColor: 'text.disabled', bgcolor: i < on ? 'text.secondary' : 'transparent' }} />
      ))}
    </Box>
  )
}

function RankCell({ b }: { b: AaBoardRow }): JSX.Element {
  if (!b.usable || b.r.row.removed !== undefined) {
    // Another loadout's rank stays in sight, dimmed: the log bought it.
    const text = b.r.row.removed !== undefined ? 'removed' : b.elsewhere ? `${String(b.r.rank)}/${String(b.max)}` : '-'
    return <Typography variant="caption" color="text.disabled">{text}</Typography>
  }
  if (b.r.unknown === true) {
    return (
      <Typography variant="caption" color="text.secondary" noWrap data-testid="aa-source-unknown">
        {`?/${String(b.max)}`}
        <Box component="span" sx={{ ml: 0.75, color: 'text.disabled' }}>
          can&apos;t tell
        </Box>
      </Typography>
    )
  }
  const word = SOURCE_WORD[b.r.source]
  return (
    <Typography variant="caption" color="text.secondary" noWrap>
      {`${String(b.r.rank)}/${String(b.max)}`}
      <Mark b={b} fields={['ranks']} />
      {word !== '' && (
        <Tooltip title={SOURCE_TIP[b.r.source]}>
          <Box component="span" sx={{ ml: 0.75, color: b.r.source === 'pick' ? 'warning.main' : 'text.disabled' }} data-testid={`aa-source-${b.r.source}`}>
            {word}
          </Box>
        </Tooltip>
      )}
    </Typography>
  )
}

function EffectCell({ b }: { b: AaBoardRow }): JSX.Element {
  const line = aaEffectLine(b.effect, b.usable ? b.r.rank : 0, b.max)
  return (
    <Typography variant="caption" color={b.usable ? 'text.secondary' : 'text.disabled'} noWrap>
      {line.label}
      {line.now !== null && (
        <Box component="b" sx={{ ml: 0.75, color: 'text.primary' }}>
          {line.now}
        </Box>
      )}
      {line.first !== null && <Box component="span" sx={{ ml: 0.75 }}>{`rank 1: ${line.first}`}</Box>}
    </Typography>
  )
}

/** The points column ("6 of 18 pts", "18 pts") and the next rank's price while there is one to buy. */
function PointsCells({ b }: { b: AaBoardRow }): JSX.Element {
  const next = b.cost?.next ?? null
  return (
    <>
      <Typography variant="caption" color="text.disabled" noWrap>
        {b.cost !== null && b.usable ? aaCostText(b.cost, b.r.rank, b.max) : ''}
        {b.usable && <Mark b={b} fields={['cost']} />}
      </Typography>
      <Typography variant="caption" color="warning.main" noWrap>
        {b.buyable ? `next ${next === null ? '?' : String(next)} pts` : ''}
      </Typography>
    </>
  )
}

function AaLine({ b, classes, setPick, showClass }: { b: AaBoardRow; classes: readonly ClassAbbr[]; setPick: SetPick; showClass: boolean }): JSX.Element {
  const nav = useAaNav()
  const id = aaRowId(b)
  const open = nav.open === id
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [open])
  const dim = b.usable ? {} : { color: 'text.disabled' }
  return (
    <Box ref={ref} id={aaDomId(id)} sx={{ borderBottom: 1, borderColor: 'divider' }} data-testid="aa-row">
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => nav.toggle(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            nav.toggle(id)
          }
        }}
        sx={{ display: 'grid', gridTemplateColumns: GRID, gap: 1.5, alignItems: 'center', px: 1, py: 0.6, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Typography variant="body2" noWrap sx={{ fontWeight: 500, ...dim, ...(b.r.row.removed === undefined ? {} : { textDecoration: 'line-through' }) }}>
          {b.r.key}
          <Mark b={b} fields={['row', 'name', 'text', 'hk', 'removed']} />
          {showClass && b.r.row.class !== undefined && <Box component="small" sx={{ ml: 0.75, color: 'text.disabled' }}>{b.r.row.class}</Box>}
          <NotForNote b={b} classes={classes} />
        </Typography>
        <LevelCell b={b} />
        <Pips b={b} />
        <RankCell b={b} />
        <EffectCell b={b} />
        <PointsCells b={b} />
      </Box>
      {open && <AaRowDetail b={b} classes={classes} setPick={setPick} />}
    </Box>
  )
}

/** The groups of one list, each under its quiet heading. */
export function AaList({ groups, classes, setPick, showClass = false, sort, setSort, empty }: { groups: AaListGroup[]; classes: readonly ClassAbbr[]; setPick: SetPick; showClass?: boolean; sort?: AaSort; setSort?: (s: AaSort) => void; empty: string }): JSX.Element {
  if (groups.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {empty}
      </Typography>
    )
  }
  return (
    <Box data-testid="aa-list">
      <HeaderRow sort={sort} setSort={setSort} />
      {(sort === undefined ? groups : aaSortGroups(groups, sort)).map((g) => (
        <Fragment key={`${g.kind}:${g.title ?? ''}`}>
          {g.title !== null && (
            <Typography variant="overline" component="div" color={g.kind === 'mine' ? 'text.secondary' : 'text.disabled'} sx={{ px: 1, pt: 1.25, lineHeight: 1.6 }}>
              {g.title}
            </Typography>
          )}
          {g.rows.map((b) => (
            <AaLine key={aaRowId(b)} b={b} classes={classes} setPick={setPick} showClass={showClass} />
          ))}
        </Fragment>
      ))}
    </Box>
  )
}
