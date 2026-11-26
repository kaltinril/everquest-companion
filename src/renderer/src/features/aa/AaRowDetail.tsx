// aa/AaRowDetail.tsx — an AA row opened in place: its full text, timer, requirement, which classes
// bring it, the game's corrections, the rank picker and the links to the rest of the app.

import { type JSX } from 'react'
import { Box, Button, Chip, MenuItem, Select, Stack, Typography } from '@mui/material'
import { aaBroughtBy, aaNotFor, type AaBoardRow } from '@shared/aaBoard'
import { aaEffectBody, aaEffectValue, aaRequirementText } from '@shared/aaEffects'
import { aaActivation, aaLinks } from '@shared/aaLinks'
import { aaMarks, aaMarkTip, type AaField } from '@shared/aaOfficial'
import { aaRankCosts } from '@shared/aaRanks'
import type { ClassAbbr } from '@shared/classCombo'
import { Tooltip } from '../../lib/Tooltip'
import { followAaLink, useAaNav } from './aaNav'

export type SetPick = (key: string, rank: number | null) => void

const MAX_TABLE = 12

/** A quiet mark on a field the game corrected (shared/aaOfficial.ts), its source on hover. */
export function Mark({ b, fields }: { b: AaBoardRow; fields: readonly AaField[] }): JSX.Element | null {
  const marks = fields.flatMap((f) => aaMarks(b.r.row, f))
  if (marks.length === 0) return null
  return (
    <Tooltip title={aaMarkTip(marks)}>
      <Box component="sup" sx={{ color: 'info.main', ml: 0.25, cursor: 'help', fontWeight: 400 }} data-testid="aa-mark">
        *
      </Box>
    </Tooltip>
  )
}

/** Where the rank comes from, in one line. */
function sourceLine(b: AaBoardRow, classes: readonly ClassAbbr[]): string {
  if (b.r.row.removed !== undefined) return `Removed ${b.r.row.removed}${b.r.logRank !== null && b.r.logRank > 0 ? `; your log shows rank ${String(b.r.logRank)}` : ''}.`
  if (b.elsewhere) return `Your log shows rank ${String(b.r.logRank ?? b.r.rank)}, bought under another loadout; not counted for ${classes.join('/')}.`
  if (b.fit === 'mayApply') return 'May apply: measured only beside Warrior and Monk.'
  if (b.fit === 'other') return `Shown to read: ${aaNotFor(classes)}.`
  if (b.r.unlisted) return "From your log; not on the wiki's AA page."
  const said = { pick: 'Rank set by you.', log: "Rank from your log's purchase lines.", granted: 'Free at your level, so counted as held.', none: 'Not held.' }
  return said[b.r.source]
}

/** The rank picker and the way back to the log's rank (pick and clear, as the tab always had). */
function RankPicker({ b, setPick }: { b: AaBoardRow; setPick: SetPick }): JSX.Element | null {
  if (b.r.row.removed !== undefined) return null
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="caption" color="text.secondary">
        Your rank
      </Typography>
      <Select
        size="small"
        value={b.r.rank}
        onChange={(e) => {
          setPick(b.r.key, e.target.value)
        }}
        sx={{ fontSize: 12, minWidth: 64, '& .MuiSelect-select': { py: 0.25 } }}
        inputProps={{ 'aria-label': `${b.r.key} rank` }}
        data-testid="aa-rank"
      >
        {Array.from({ length: b.r.max + 1 }, (_, n) => (
          <MenuItem key={n} value={n} sx={{ fontSize: 12 }}>
            {`${String(n)} / ${String(b.r.max)}`}
          </MenuItem>
        ))}
      </Select>
      {b.r.source === 'pick' && (
        <Button size="small" onClick={() => setPick(b.r.key, null)} sx={{ textTransform: 'none' }} data-testid="aa-clear-pick">
          Back to the log&apos;s rank
        </Button>
      )}
    </Stack>
  )
}

/** Each rank's value and price, the held one lit. */
function RankTable({ b }: { b: AaBoardRow }): JSX.Element | null {
  if (b.max > MAX_TABLE || (b.effect.values === null && b.cost === null)) return null
  const prices = aaRankCosts(b.r.row)
  return (
    <Box component="table" sx={{ fontSize: 12, borderCollapse: 'collapse', '& td, & th': { px: 1, py: 0.25, textAlign: 'left' } }}>
      <thead>
        <tr>
          <Box component="th" sx={{ color: 'text.secondary', fontWeight: 400 }}>Rank</Box>
          <Box component="th" sx={{ color: 'text.secondary', fontWeight: 400 }}>{b.effect.label}</Box>
          {b.cost !== null && <Box component="th" sx={{ color: 'text.secondary', fontWeight: 400 }}>Cost</Box>}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: b.max }, (_, i) => (
          <Box component="tr" key={i} sx={i + 1 === b.r.rank ? { color: 'warning.main' } : undefined}>
            <td>{i + 1}</td>
            <td>{aaEffectValue(b.effect, i + 1) ?? '·'}</td>
            {b.cost !== null && <td>{prices[i] === null || prices[i] === undefined ? '?' : prices[i] === 0 ? 'free' : `${String(prices[i])} pts`}</td>}
          </Box>
        ))}
      </tbody>
    </Box>
  )
}

export function AaRowDetail({ b, classes, setPick }: { b: AaBoardRow; classes: readonly ClassAbbr[]; setPick: SetPick }): JSX.Element {
  const nav = useAaNav()
  const act = aaActivation(b.r.row.text)
  const req = aaRequirementText(b.r.row.text)
  const by = aaBroughtBy(b.r, classes)
  const marks = (b.r.row.marks ?? []).map((m) => m.tip)
  const body = aaEffectBody(b.r.row.text)
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, px: 1.5, py: 1.25, bgcolor: 'action.hover' }} data-testid="aa-row-detail">
      <Stack spacing={0.75} sx={{ minWidth: 0 }}>
        <Typography variant="body2">{body === '' ? b.effect.label : body}</Typography>
        {b.r.row.hk !== undefined && <Typography variant="caption" color="text.secondary">{`Rank 3 hotkey: ${b.r.row.hk}`}</Typography>}
        {act !== null && <Typography variant="caption" color="text.secondary">{`Activated: refresh ${act.refresh}, ability timer ${String(act.timer)}.`}</Typography>}
        {req !== null && <Typography variant="caption" color="text.secondary">{`Requires ${req}.`}</Typography>}
        {by !== null && <Typography variant="caption" color="text.secondary">{by}</Typography>}
        {b.r.wikiName !== null && <Typography variant="caption" color="text.secondary">{`The wiki calls this ${b.r.wikiName}.`}</Typography>}
        {marks.map((m) => (
          <Typography key={m} variant="caption" color="info.main">
            {m}
          </Typography>
        ))}
        <Typography variant="caption" color="text.secondary">
          {sourceLine(b, classes)}
        </Typography>
        <RankPicker b={b} setPick={setPick} />
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {aaLinks(b.r.row, b.r.key).map((l) => (
            <Chip key={l.label} size="small" variant="outlined" color="success" label={l.label} onClick={() => followAaLink(nav, l.to)} data-testid="aa-link" />
          ))}
        </Stack>
      </Stack>
      <RankTable b={b} />
    </Box>
  )
}
