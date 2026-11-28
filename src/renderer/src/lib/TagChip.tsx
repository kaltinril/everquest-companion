// The ONE small tag chip (dup-ui-b-9, 2026-11-27 audit). The tags that each drew their own MUI
// Chip size="small" with their own height and font (Combat 14/9, Loot and Factions 18/11, Alerts
// 18/0.68rem and 20/0.7rem, Factions 20/11) draw this instead, so a tag is the same object on
// every tab. Each caller keeps its own colour, variant, tooltip and margins; only the geometry
// lives here.
//
// Two sizes. `tag` (the default) is the dense 18 px tag. `clickable` is MUI's own small chip, 24 px
// tall with its own padding and font, untouched: the Gaps table's action chips are buttons, and its
// job, held and edited chips sit in the same row beside them, so Gaps keeps the bigger click target
// and looks exactly as it did before the shared chip (owner, 2026-11-27). The Leveling unlock list's
// chips, SeenAsChips and KnowledgeBadge are not on this chip.

import { forwardRef, type ElementType } from 'react'
import { Chip, type ChipProps } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'

/**
 * The `tag` geometry: 18 px tall, 11 px text, 6 px side padding.
 *
 * A CHIP IS A FACT, NOT A SPRING (JOS-190, from the Alerts row): left to the default
 * `flex-shrink: 1` a chip squeezed below its own label when its flex row ran out of room, and,
 * the row being an un-clipped nowrap flex box, kept drawing past its edge and over the chips
 * beside it. It holds its size; what gives is the text beside it (the name ellipsizes, then the
 * row wraps).
 */
export const TAG_CHIP_SX = {
  height: 18,
  flexShrink: 0,
  fontSize: 11,
  '& .MuiChip-label': { px: 0.75, fontSize: 11 },
  '& .MuiChip-icon': { fontSize: 14, ml: 0.5, mr: -0.25 }
} as const

/** `tag`: the dense 18 px tag. `clickable`: MUI's small chip as it comes (24 px), for Gaps. */
export type TagChipSize = 'tag' | 'clickable'

/** MUI's Chip props with our own `size`, plus the link props a chip that is an `<a>` takes. */
export type TagChipProps = Omit<ChipProps, 'size'> & {
  size?: TagChipSize
  component?: ElementType
  href?: string
  target?: string
  rel?: string
}

/** A small tag: MUI Chip size="small" at the chosen geometry; the caller's `sx` lays on top. */
export const TagChip = forwardRef<HTMLDivElement, TagChipProps>(function TagChip({ size = 'tag', sx, ...rest }, ref) {
  if (size === 'clickable') return <Chip ref={ref} size="small" {...rest} sx={sx} />
  return <Chip ref={ref} size="small" {...rest} sx={[TAG_CHIP_SX, ...(Array.isArray(sx) ? (sx as unknown[]) : [sx])] as SxProps<Theme>} />
})
