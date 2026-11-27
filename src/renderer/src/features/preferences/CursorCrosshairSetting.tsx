// CursorCrosshairSetting — the Crosshair row of Preferences → Cursor overlay (owner, 2026-11-26:
// "a cross hair like thing, 1 vertical line across the entire screen at the mouse posiiton, and 1
// horizontal at the mouse position (they can control line color and weight)").
//
// Its own switch, on with or without the shape, its own colour and its own weight. A sibling file
// of CursorRingSetting.tsx so that card stays under the repo's code-line ceiling; it renders bare
// Stacks inside that card, and every write goes through the card's one `update`.

import type { JSX } from 'react'
import { FormControlLabel, Slider, Stack, Switch, Typography } from '@mui/material'
import {
  type CursorRingPrefs,
  MAX_CROSSHAIR_WEIGHT_PX,
  MIN_CROSSHAIR_WEIGHT_PX
} from '@shared/presencePrefs'

type OnChange = (patch: Partial<CursorRingPrefs>) => void

/** The one id the caption's `htmlFor` and the colour input share. */
const CROSSHAIR_COLOR_INPUT_ID = 'pref-cursor-crosshair-color-input'

/** The lines' colour: the platform colour input, as the shape's picker is (JOS-125). Main takes
 *  the value through the strict `#rrggbb` normalizer before anything draws it. */
function CrosshairColor({ value, onChange }: { value: string; onChange: OnChange }): JSX.Element {
  return (
    <Stack sx={{ minWidth: 120 }}>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary' }}
        component="label"
        htmlFor={CROSSHAIR_COLOR_INPUT_ID}
      >
        Line color
      </Typography>
      <input
        id={CROSSHAIR_COLOR_INPUT_ID}
        type="color"
        data-testid="pref-cursor-crosshair-color"
        value={value}
        onChange={(e) => onChange({ crosshairColorHex: e.target.value })}
        style={{
          width: 64,
          height: 32,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer'
        }}
      />
    </Stack>
  )
}

export function CrosshairRow({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: OnChange
}): JSX.Element {
  return (
    <Stack spacing={0.5} data-testid="pref-cursor-crosshair">
      <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <FormControlLabel
          sx={{ minWidth: 180 }}
          control={
            <Switch
              size="small"
              data-testid="pref-cursor-crosshair-enabled"
              checked={prefs.crosshairEnabled}
              onChange={(e) => onChange({ crosshairEnabled: e.target.checked })}
            />
          }
          label={<Typography variant="body2">Crosshair lines</Typography>}
        />
        <Stack sx={{ minWidth: 180 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Line weight ({prefs.crosshairWeightPx}px)
          </Typography>
          <Slider
            size="small"
            data-testid="pref-cursor-crosshair-weight"
            min={MIN_CROSSHAIR_WEIGHT_PX}
            max={MAX_CROSSHAIR_WEIGHT_PX}
            step={1}
            value={prefs.crosshairWeightPx}
            onChange={(_e, v) => onChange({ crosshairWeightPx: v })}
            sx={{ width: 160 }}
          />
        </Stack>
        <CrosshairColor value={prefs.crosshairColorHex} onChange={onChange} />
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        One line straight up and down and one straight across, through the tip of your pointer,
        each spanning the whole EverQuest window (the whole screen when the game is fullscreen).
        They follow the pointer itself, not the shape&apos;s offset.
      </Typography>
    </Stack>
  )
}
