// CursorRingSetting — Preferences → Cursor overlay (called "Cursor ring" on screen until the owner's
// 2026-11-26 rename; the file, the `cursorRing` store key and every data-testid keep the old name,
// because existing installs and tests depend on them).
//
// A thick circle that follows the mouse, drawn ONLY over the EverQuest window (owner request:
// "I lose my mouse on EQ screens"). Off by default; the toggle is the only thing that makes it
// exist. It is white until the player picks another colour (JOS-125), and a circle until the
// player picks another shape (owner, 2026-11-26); both defaults are the old ring exactly, so
// nobody's ring changes by upgrading.
//
// THE NOTE ABOUT SCOPE IS NOT DECORATION. "Only over EverQuest" is the single most surprising
// thing about this feature — a user who turns it on while reading Preferences sees nothing
// happen, and without that line would reasonably conclude it is broken. It states WHERE the
// ring is, which is state, not process.
//
// Every control here is live: main pushes the whole blob to the ring window on every write
// (presenceEffects.refreshPresenceEffects), so dragging a slider resizes the halo under the
// pointer, and picking a colour recolours it, instead of on the next restart.
//
// ONE BORDER: PreferencesView wraps each item in an outlined Paper, so this renders bare Stacks.

import { type JSX, useCallback, useState } from 'react'
import { FormControlLabel, MenuItem, Select, Slider, Stack, Switch, Typography } from '@mui/material'
import AdjustIcon from '@mui/icons-material/Adjust'
import type { PrefSection } from './PreferencesView'
import { recordPref, usePrefsSeed } from './prefsHydration'
import {
  type CursorRingPrefs,
  MAX_RING_OFFSET_PX,
  MAX_RING_SIZE_PX,
  MAX_RING_THICKNESS_PX,
  MIN_RING_OFFSET_PX,
  MIN_RING_SIZE_PX,
  MIN_RING_THICKNESS_PX,
  RING_SHAPES,
  type RingShape,
  normalizeRingShape
} from '@shared/presencePrefs'
import { CursorRingDemo } from './CursorRingDemo'
import { CrosshairRow } from './CursorCrosshairSetting'
import { TrailRow } from './CursorTrailSetting'

/**
 * SEEDED from the pane's hydration snapshot, written back on every change; main's reply is
 * authoritative (every field is re-clamped there, so a slider at the cap visibly stops instead of
 * drifting).
 *
 * IT USED TO MOUNT ON `DEFAULT_CURSOR_RING` AND CORRECT ITSELF (JOS-340). This is the card that
 * proves the defect was never only about switches: the ring's SIZE and THICKNESS are sliders and
 * its colour is a picker, so a user with a fat red ring opened this section, saw a thin white one
 * with the handles parked at the shipped numbers, and watched all three jump. Nothing here paints
 * until the snapshot has the values (./prefsHydration.tsx).
 */
function useCursorRing(): [CursorRingPrefs, (patch: Partial<CursorRingPrefs>) => void] {
  const [prefs, setPrefs] = useState<CursorRingPrefs>(usePrefsSeed().cursorRing)

  const update = useCallback((patch: Partial<CursorRingPrefs>) => {
    setPrefs((cur) => ({ ...cur, ...patch }))
    void window.eq.setCursorRing(patch).then((stored) => {
      setPrefs(stored)
      recordPref('cursorRing', stored)
    })
  }, [])

  return [prefs, update]
}

/** What each shape is called in the picker, in `RING_SHAPES` order. */
const SHAPE_LABELS: Record<RingShape, string> = {
  circle: 'Circle',
  oval: 'Oval',
  square: 'Square',
  rounded: 'Rounded square',
  diamond: 'Diamond',
  dot: 'Ring with a centre dot',
  target: 'Target (double ring)'
}

/** The shape picker (owner, 2026-11-26). A plain select: seven names read better as words than
 *  as a row of tiny icons, and main re-checks the value (an unknown one draws the circle). */
function RingShapePicker({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: (patch: Partial<CursorRingPrefs>) => void
}): JSX.Element {
  return (
    <Stack sx={{ minWidth: 180 }}>
      <Typography variant="caption" color="text.secondary">
        Shape
      </Typography>
      <Select
        size="small"
        data-testid="pref-cursor-ring-shape"
        value={prefs.shape}
        onChange={(e) => onChange({ shape: normalizeRingShape(e.target.value) })}
        sx={{ width: 200 }}
      >
        {RING_SHAPES.map((shape) => (
          <MenuItem key={shape} value={shape}>
            {SHAPE_LABELS[shape]}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  )
}

/** Size + stroke. Both are whole px and both are clamped in main; the labels state the value so
 *  the cap is legible rather than felt. */
function RingSliders({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: (patch: Partial<CursorRingPrefs>) => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
      <Stack sx={{ minWidth: 180 }}>
        <Typography variant="caption" color="text.secondary">
          Size ({prefs.sizePx}px)
        </Typography>
        <Slider
          size="small"
          data-testid="pref-cursor-ring-size"
          min={MIN_RING_SIZE_PX}
          max={MAX_RING_SIZE_PX}
          step={2}
          value={prefs.sizePx}
          onChange={(_e, v) => onChange({ sizePx: v })}
          sx={{ width: 160 }}
        />
      </Stack>
      <Stack sx={{ minWidth: 180 }}>
        <Typography variant="caption" color="text.secondary">
          Thickness ({prefs.thicknessPx}px)
        </Typography>
        <Slider
          size="small"
          data-testid="pref-cursor-ring-thickness"
          min={MIN_RING_THICKNESS_PX}
          max={MAX_RING_THICKNESS_PX}
          step={1}
          value={prefs.thicknessPx}
          onChange={(_e, v) => onChange({ thicknessPx: v })}
          sx={{ width: 160 }}
        />
      </Stack>
    </Stack>
  )
}

/** One offset axis. Whole px, clamped in main; 0 is centred on the pointer. */
function OffsetSlider({
  axis,
  value,
  onChange
}: {
  axis: 'X' | 'Y'
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <Stack sx={{ minWidth: 180 }}>
      <Typography variant="caption" color="text.secondary">
        Offset {axis} ({value > 0 ? `+${value}` : value}px{axis === 'X' ? ', + is right' : ', + is down'})
      </Typography>
      <Slider
        size="small"
        data-testid={`pref-cursor-ring-offset-${axis.toLowerCase()}`}
        min={MIN_RING_OFFSET_PX}
        max={MAX_RING_OFFSET_PX}
        step={1}
        value={value}
        marks={[{ value: 0 }]}
        onChange={(_e, v) => onChange(v)}
        onDoubleClick={() => onChange(0)}
        sx={{ width: 160 }}
      />
    </Stack>
  )
}

/** Where the shape sits relative to the pointer (owner, 2026-11-26). Double-click a slider to
 *  put it back on the pointer. */
function RingOffsets({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: (patch: Partial<CursorRingPrefs>) => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
      <OffsetSlider axis="X" value={prefs.offsetXPx} onChange={(v) => onChange({ offsetXPx: v })} />
      <OffsetSlider axis="Y" value={prefs.offsetYPx} onChange={(v) => onChange({ offsetYPx: v })} />
    </Stack>
  )
}

/** The one id the caption's `htmlFor` and the colour input share. */
const COLOR_INPUT_ID = 'pref-cursor-ring-color-input'

/**
 * The colour picker (JOS-125). A BARE `<input type="color">` and not an MUI control, because MUI
 * has no colour input and the browser's own is the control every player has already used on the
 * web: click it, get the platform's colour dialog, including its eyedropper. Writing a swatch
 * grid instead would be a smaller set of colours and a bigger surface to maintain.
 *
 * It writes on every `change`. The platform dialog fires that continuously while a colour is
 * being dragged, which is what makes the sample beside it (and a live ring in the game) follow
 * the choice rather than land on it — the same liveness the size and thickness sliders have.
 */
function RingColor({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: (patch: Partial<CursorRingPrefs>) => void
}): JSX.Element {
  return (
    <Stack sx={{ minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary" component="label" htmlFor={COLOR_INPUT_ID}>
        Color
      </Typography>
      <input
        id={COLOR_INPUT_ID}
        type="color"
        data-testid="pref-cursor-ring-color"
        value={prefs.colorHex}
        onChange={(e) => onChange({ colorHex: e.target.value })}
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

/** The shape's own switch (2026-11-26: the crosshair is "on with or without the shape"). On by
 *  default, which is the ring every player has had; off leaves the crosshair and trail alone. */
function ShapeSwitch({
  prefs,
  onChange
}: {
  prefs: CursorRingPrefs
  onChange: (patch: Partial<CursorRingPrefs>) => void
}): JSX.Element {
  return (
    <FormControlLabel
      control={
        <Switch
          size="small"
          data-testid="pref-cursor-ring-show-shape"
          checked={prefs.showShape}
          onChange={(e) => onChange({ showShape: e.target.checked })}
        />
      }
      label={<Typography variant="body2">Shape around the pointer</Typography>}
    />
  )
}

export function CursorRingSetting(): JSX.Element {
  const [prefs, update] = useCursorRing()
  return (
    <Stack spacing={2} data-testid="pref-cursor-ring">
      <Stack spacing={0.5}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              data-testid="pref-cursor-ring-enabled"
              checked={prefs.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
          }
          label={<Typography variant="body2">Show a cursor overlay</Typography>}
        />
        <Typography variant="caption" color="text.secondary">
          {prefs.enabled
            ? 'A shape, crosshair lines or a trail follow your pointer so you can find it on a busy screen. Your real cursor is untouched - the overlay never gets in the way of a click.'
            : 'Off. Nothing is drawn and nothing is tracked.'}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
        <Stack spacing={1.5}>
          <ShapeSwitch prefs={prefs} onChange={update} />
          <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
            <RingSliders prefs={prefs} onChange={update} />
            <RingShapePicker prefs={prefs} onChange={update} />
            <RingColor prefs={prefs} onChange={update} />
          </Stack>
          <RingOffsets prefs={prefs} onChange={update} />
        </Stack>
        <CursorRingDemo prefs={prefs} />
      </Stack>

      <CrosshairRow prefs={prefs} onChange={update} />

      <TrailRow prefs={prefs} onChange={update} />

      <Typography variant="caption" color="text.secondary">
        The overlay only appears over EverQuest, while the game is the window you’re in.
      </Typography>
    </Stack>
  )
}

/**
 * The Preferences section this card belongs to — its label, icon and search keywords.
 *
 * It lives HERE rather than in PreferencesView, beside `perfSection`, `graphicsSection` and
 * `whatsNewSection`, for the reason that file's header gives: it sits at the repo's
 * 400-code-line factoring ceiling and a split is the answer to that rather than a widened
 * threshold. Co-locating costs nothing — the words somebody types to find this setting belong
 * with the setting.
 */
export function cursorRingSection(): PrefSection {
  return {
    id: 'cursor',
    label: 'Cursor overlay',
    icon: <AdjustIcon fontSize="small" />,
    items: [
      {
        id: 'cursor-ring',
        label: 'Cursor overlay',
        keywords:
          'cursor overlay mouse pointer ring circle halo highlight find lost locate ultimate size thickness white color colour picker shape oval square rounded diamond dot target bullseye double offset position shift move nudge x y demo crosshair cross hair lines vertical horizontal weight aim trail particle particles sparkle sparkles effect length fade',
        content: <CursorRingSetting />
      }
    ]
  }
}
