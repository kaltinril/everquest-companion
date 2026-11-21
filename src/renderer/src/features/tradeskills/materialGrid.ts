// tradeskills/materialGrid.ts — the one table every material line is drawn on: Material, Need,
// Have, Where. The recipe panel and the plan share it, and a nested material indents only inside
// its name cell, so Need, Have and Where stay in the same columns at any depth (owner, 2026-11-20:
// "shouldn't the need, have, comes from be actgual columns so the values all line up?").

import { MATERIAL_LINE } from './MaterialWhere'

export const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(200px, 2fr) 52px 52px minmax(0, 3fr)',
  columnGap: 1.5,
  alignItems: 'start'
} as const

export const ROW_SX = { ...GRID_SX, py: 0.5, borderTop: 1, borderColor: 'divider' } as const

/** The first line of a cell: the item icon's height and a line of text both sit in it. */
export const LINE_SX = { minHeight: MATERIAL_LINE, display: 'flex', alignItems: 'center', minWidth: 0, typography: 'body2' } as const

export const NUMBER_SX = { lineHeight: `${String(MATERIAL_LINE)}px` } as const

/** The Where cell's lines are 20 px tall: this centres the first on the line beside it. */
export const WHERE_SX = { minWidth: 0, pt: `${String((MATERIAL_LINE - 20) / 2)}px` } as const

/** The column the open/close arrow sits in. */
export const OPEN_COL = 28

/** Where a linked material's name starts: past the arrow's column, the icon and the gap after it. */
export const NAME_INDENT = OPEN_COL + 28

/** How far one level of nesting moves a name. */
export const DEPTH_INDENT = 18

/** A name cell at a depth in the tree: 0 for the recipe's own materials. */
export function nameCell(depth: number): typeof LINE_SX & { pl: string } {
  return { ...LINE_SX, pl: `${String(depth * DEPTH_INDENT)}px` }
}
