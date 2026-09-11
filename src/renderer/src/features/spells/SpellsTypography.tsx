// spells/SpellsTypography — the Spells area reads a size up.
//
// The owner, twice in a minute (2026-09-10): *"increase the size of font on the spells tabs
// please"* and *"the spell names are hard to read"*.
//
// ── WHY A NESTED THEME AND NOT THIRTY EDITS ───────────────────────────────────────────────────
//
// This area is dense by nature - a corpus browser, three recommended sets and a stats panel - so it
// leans on `caption` (0.75rem) and small chips in about thirty places. Bumping each one by hand
// would be thirty chances to pick a different number, and the next time he asks for "a bit bigger"
// it would be thirty more. A nested `ThemeProvider` makes it ONE number, and the number is named.
//
// It scales the three variants this area actually draws in, plus the chips, and it touches NOTHING
// outside the Spells views: `MainColumn` wraps only this area with it, so the Gear tab beside it is
// byte for byte what it was. That containment is the whole reason this is a theme rather than a
// change to `theme.ts`.
//
// ── THE ROW HEIGHT MOVES WITH IT, OR THE WINDOWED TABLE DESYNCS ───────────────────────────────
//
// `SpellbookView` windows its rows on a FIXED height and the hook's arithmetic assumes every row is
// exactly that tall (`GearTable.tsx` states the contract in full). Type that grows inside a row
// whose height did not is a row that wraps, and a wrapped row drifts the scroll offset of every row
// below it. `SPELL_ROW_HEIGHT` lives here, beside the scale that forces it, rather than in the view
// that reads it - the two numbers are one decision.

import type { JSX, ReactNode } from 'react'
import { ThemeProvider, useTheme, createTheme, type Theme } from '@mui/material/styles'

/**
 * HOW MUCH BIGGER. One number, one place.
 *
 * 1.15 is a size up without being a different design: `caption` lands at 0.8625rem (13.8px) and
 * `body2` at ~1rem (16px), which is what makes a dense table legible rather than merely larger.
 */
const SCALE = 1.15

/** The dense row height the Spellbook's windowing is pinned to, scaled with the type. */
export const SPELL_ROW_HEIGHT = Math.round(37 * SCALE)

/** `0.75rem` -> `0.8625rem`. Falls back to the caller's own string when a variant states none. */
function scaled(size: string | number | undefined, fallbackRem: number): string {
  const rem = typeof size === 'string' && size.endsWith('rem') ? Number.parseFloat(size) : fallbackRem
  return `${String(Number((rem * SCALE).toFixed(4)))}rem`
}

/**
 * The Spells area's theme: the outer one, a size up.
 *
 * Derived from the LIVE outer theme rather than from the module's own, so a future palette or font
 * change reaches this area without anybody remembering it exists.
 */
function spellsTheme(outer: Theme): Theme {
  return createTheme(outer, {
    typography: {
      caption: { fontSize: scaled(outer.typography.caption.fontSize, 0.75) },
      body2: { fontSize: scaled(outer.typography.body2.fontSize, 0.875) },
      body1: { fontSize: scaled(outer.typography.body1.fontSize, 1) }
    },
    components: {
      // The chips carry their own stated sizes at the call sites (`TINY_CHIP`), which a typography
      // scale cannot reach - so the small chip is nudged here instead, in the same one place.
      MuiChip: {
        styleOverrides: {
          sizeSmall: { fontSize: `${String(Number((0.75 * SCALE).toFixed(4)))}rem` }
        }
      }
    }
  })
}

export default function SpellsTypography({ children }: { children: ReactNode }): JSX.Element {
  const outer = useTheme()
  return <ThemeProvider theme={spellsTheme(outer)}>{children}</ThemeProvider>
}
