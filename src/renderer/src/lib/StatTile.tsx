// StatTile — THE app's headline-number tile (dup-ui-a-6, 2026-11-27).
//
// One component for the five copies that had grown apart: the Leveling tab's HeroCard (level, AA
// earned / spent / unspent), its range panel's StatCard and its AA PaceTile, and the identical
// StatCards on the Loot item page and the Mobs page.
//
// PIXEL-IDENTICAL TO THE COPIES IT REPLACED (owner ruling 2026-11-27: merge only if nothing moves;
// proved with hidden-window before/after captures). So every small difference the copies had is a
// density field or a prop here, never "unified on the way":
//   - 'hero'  : h4 value that may wrap, roomy padding, and an INLINE caption. The caption is a
//               <span> after the label's <p>, so it sits on a line box with the body's strut; a
//               block caption made the hero row about 4 px shorter (measured on the prototype).
//               The text column has no `minWidth: 0`, as HeroCard had none.
//   - 'panel' : h5 value that never wraps, panel padding, block caption (range and AA pace panels).
//   - 'plain' : h5 value in the primary colour, no icon, no accent rule, caption label and a
//               dimmed block sub line (Loot and Mobs pages). Mobs keeps its 110 px `minWidth`.
// An `accent` colours the left rule, the icon and the value; without one the value takes the
// primary colour.
//
// Hover is a PROP, not a rewrite: `hover` is the sentence, `hoverMode` picks how it shows.
// 'popper' (the default) is the app's MUI Tooltip (the level hero, the AA pace tiles); 'native' is
// a title= attribute, which the range cards keep because of JOS-143.

import { type JSX, type ReactNode } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { Tooltip } from './Tooltip'

export type StatTileSize = 'hero' | 'panel' | 'plain'

export interface StatTileProps {
  value: string
  label: string
  /** caption line under the label */
  sub?: string
  /** Small suffix on the value's baseline ('AA/hr'). Passing it at all, even '', puts the value
   *  in a baseline row (the AA pace tiles always had that row); '' prints no suffix. */
  unit?: string
  /** an outlined chip under the label ('inferred') */
  chip?: string
  icon?: ReactNode
  accent?: string
  size?: StatTileSize
  /** overrides the density's minimum width (the Mobs page's tiles are 110 px) */
  minWidth?: number
  /** keep the label on one line, cut with an ellipsis (the AA pace tiles) */
  labelNoWrap?: boolean
  hover?: string
  hoverMode?: 'popper' | 'native'
  /** data-testid on the tile itself */
  testId?: string
  /** data-testid on the value text (the level and AA-spent heroes' e2e reads the number) */
  valueTestId?: string
}

interface Density {
  p: number
  gap: number
  minWidth: number
  value: 'h4' | 'h5'
  lh: number
  valueNoWrap: boolean
  label: 'body2' | 'caption'
  labelColor?: string
  subColor: string
  /** false ⇒ the caption is an inline span (the hero row's height depends on it) */
  subBlock: boolean
  /** `minWidth: 0` on the text column beside the icon */
  shrinkBody: boolean
}

const DENSITY: Record<StatTileSize, Density> = {
  hero: {
    p: 2,
    gap: 1.5,
    minWidth: 160,
    value: 'h4',
    lh: 1,
    valueNoWrap: false,
    label: 'body2',
    subColor: 'text.secondary',
    subBlock: false,
    shrinkBody: false
  },
  panel: {
    p: 1.25,
    gap: 1,
    minWidth: 150,
    value: 'h5',
    lh: 1.1,
    valueNoWrap: true,
    label: 'body2',
    subColor: 'text.secondary',
    subBlock: true,
    shrinkBody: true
  },
  plain: {
    p: 1.5,
    gap: 1,
    minWidth: 120,
    value: 'h5',
    lh: 1.1,
    valueNoWrap: false,
    label: 'caption',
    labelColor: 'text.secondary',
    subColor: 'text.disabled',
    subBlock: true,
    shrinkBody: true
  }
}

function TileValue({ d, p }: { d: Density; p: StatTileProps }): JSX.Element {
  const text = (
    <Typography
      variant={d.value}
      sx={{ lineHeight: d.lh, color: p.accent ?? 'primary.main' }}
      noWrap={d.valueNoWrap}
      data-testid={p.valueTestId}
    >
      {p.value}
    </Typography>
  )
  if (p.unit === undefined) return text
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
      {text}
      {p.unit && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
          {p.unit}
        </Typography>
      )}
    </Stack>
  )
}

function TileBody({ d, p }: { d: Density; p: StatTileProps }): JSX.Element {
  return (
    <>
      <TileValue d={d} p={p} />
      <Typography variant={d.label} sx={d.labelColor ? { color: d.labelColor } : undefined} noWrap={p.labelNoWrap}>
        {p.label}
      </Typography>
      {p.sub && (
        <Typography variant="caption" sx={d.subBlock ? { color: d.subColor, display: 'block' } : { color: d.subColor }}>
          {p.sub}
        </Typography>
      )}
      {/* State, not process: the chip says the number is a model, and the tile's hover says
          which part of it the log actually printed. */}
      {p.chip && <Chip size="small" variant="outlined" label={p.chip} sx={{ height: 18, mt: 0.25 }} />}
    </>
  )
}

/** What sits inside the tile's Paper: the icon column and the text, or the text alone. */
function TileContent({ d, p }: { d: Density; p: StatTileProps }): JSX.Element {
  if (!p.icon) return <TileBody d={d} p={p} />
  return (
    <>
      <Box sx={{ color: p.accent, display: 'flex', alignItems: 'center' }}>{p.icon}</Box>
      <Box sx={d.shrinkBody ? { minWidth: 0 } : undefined}>
        <TileBody d={d} p={p} />
      </Box>
    </>
  )
}

export function StatTile(props: StatTileProps): JSX.Element {
  const { icon, accent, hover } = props
  const d = DENSITY[props.size ?? 'panel']
  const native = props.hoverMode === 'native'
  // The Paper is built HERE, not in a child component: the Tooltip clones its anchor class and
  // hover handlers onto its direct child, which must be the DOM-owning MUI element.
  const tile = (
    <Paper
      variant="outlined"
      data-testid={props.testId}
      title={native ? hover : undefined}
      sx={{
        p: d.p,
        flex: 1,
        minWidth: props.minWidth ?? d.minWidth,
        ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
        ...(icon ? { display: 'flex', gap: d.gap } : {})
      }}
    >
      <TileContent d={d} p={props} />
    </Paper>
  )
  // A popper wraps whenever a sentence is given, as the AA pace tiles always wrapped theirs.
  return hover !== undefined && !native ? <Tooltip title={hover}>{tile}</Tooltip> : tile
}

export default StatTile
