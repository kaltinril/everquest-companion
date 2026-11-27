// macros/MacroColor.tsx — the game's macro colours as it shows them: a letter "A" in the colour. The
// picker is the game's two rows of ten; the small mark sits beside a macro's name wherever it is listed.

import type { JSX } from 'react'
import { Box, ButtonBase, Stack, Typography } from '@mui/material'
import { MACRO_COLORS, macroSwatch } from '@shared/macros/colors'

const SWATCH_SX = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 0.5, fontWeight: 700, lineHeight: 1 } as const

/** The mark beside a macro's name. A number the game has no colour for shows "?". */
export function ColorMark({ color }: { color: number }): JSX.Element {
  const swatch = macroSwatch(color)
  return (
    <Box
      component="span"
      aria-hidden
      data-testid="macro-color-mark"
      data-color={color}
      sx={{ ...SWATCH_SX, width: 16, height: 16, fontSize: 11, color: swatch?.color ?? 'text.primary', bgcolor: swatch?.back ?? 'action.selected' }}
    >
      {swatch === null ? '?' : 'A'}
    </Box>
  )
}

interface SwatchProps {
  n: number
  on: boolean
  onPick: (color: number) => void
}

function Swatch({ n, on, onPick }: SwatchProps): JSX.Element {
  const swatch = macroSwatch(n)
  return (
    <ButtonBase
      aria-label={`Colour ${String(n)}`}
      aria-pressed={on}
      data-testid={`macro-color-${String(n)}`}
      onClick={() => {
        onPick(n)
      }}
      sx={{
        ...SWATCH_SX,
        width: 24,
        height: 24,
        fontSize: 14,
        color: swatch?.color,
        bgcolor: swatch?.back,
        outline: on ? '2px solid' : 'none',
        outlineColor: 'primary.main',
        outlineOffset: 1,
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.light', outlineOffset: 1 }
      }}
    >
      A
    </ButtonBase>
  )
}

interface PickerProps {
  value: number
  /** What is wrong with the stored number, if anything. */
  warning: string | undefined
  onPick: (color: number) => void
}

/** Two rows of ten, 0 to 9 over 10 to 19. A stored number outside them still shows, with its warning. */
export function ColorPicker({ value, warning, onPick }: PickerProps): JSX.Element {
  const outside = macroSwatch(value) === null
  return (
    <Stack spacing={0.5} data-testid="macro-color">
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Text colour{outside ? `: ${String(value)}` : ''}
      </Typography>
      <Box role="group" aria-label="Text colour" sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 24px)', gap: 0.5, width: 'fit-content' }}>
        {MACRO_COLORS.map((_, n) => (
          <Swatch key={n} n={n} on={n === value} onPick={onPick} />
        ))}
      </Box>
      {warning !== undefined && (
        <Typography variant="caption" sx={{ color: 'warning.main' }} data-testid="macro-color-warning">
          {warning}
        </Typography>
      )}
    </Stack>
  )
}
