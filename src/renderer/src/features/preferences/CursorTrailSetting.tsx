// CursorTrailSetting — the Trail row of Preferences → Cursor overlay (owner, 2026-11-26:
// "trail/particle affects").
//
// A select (Off, Trail, Sparkles) and one Length slider. The trail is drawn in the shape's colour.
// A sibling file of CursorRingSetting.tsx so that card stays under the repo's code-line ceiling;
// every write goes through the card's one `update`, and main re-checks every value.

import type { JSX } from 'react'
import { MenuItem, Select, Slider, Stack, Typography } from '@mui/material'
import {
  CURSOR_TRAIL_MODES,
  type CursorRingPrefs,
  type CursorTrailMode,
  MAX_TRAIL_LENGTH,
  MIN_TRAIL_LENGTH,
  normalizeTrailMode
} from '@shared/presencePrefs'

type OnChange = (patch: Partial<CursorRingPrefs>) => void

/** What each mode is called in the picker, in `CURSOR_TRAIL_MODES` order. */
const TRAIL_LABELS: Record<CursorTrailMode, string> = {
  off: 'Off',
  trail: 'Trail',
  sparkles: 'Sparkles'
}

export function TrailRow({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: OnChange
}): JSX.Element {
  const off = prefs.trail === 'off'
  return (
    <Stack spacing={0.5} data-testid="pref-cursor-trail">
      <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <Stack sx={{ minWidth: 180 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Trail
          </Typography>
          <Select
            size="small"
            data-testid="pref-cursor-trail-mode"
            value={prefs.trail}
            onChange={(e) => onChange({ trail: normalizeTrailMode(e.target.value) })}
            sx={{ width: 160 }}
          >
            {CURSOR_TRAIL_MODES.map((mode) => (
              <MenuItem key={mode} value={mode}>
                {TRAIL_LABELS[mode]}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        <Stack sx={{ minWidth: 180 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Length ({prefs.trailLength} of {MAX_TRAIL_LENGTH})
          </Typography>
          <Slider
            size="small"
            data-testid="pref-cursor-trail-length"
            min={MIN_TRAIL_LENGTH}
            max={MAX_TRAIL_LENGTH}
            step={1}
            disabled={off}
            value={prefs.trailLength}
            onChange={(_e, v) => onChange({ trailLength: v })}
            sx={{ width: 160 }}
          />
        </Stack>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {off
          ? 'No trail.'
          : 'Drawn behind the pointer in the shape’s colour while the mouse moves; it fades out when the mouse stops. Longer keeps each point (and, for sparkles, more of them) on screen longer.'}
      </Typography>
    </Stack>
  )
}
