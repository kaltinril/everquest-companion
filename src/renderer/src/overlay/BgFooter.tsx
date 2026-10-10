// BgFooter — the footer the damage meter, the heal meter and the event log share: a `bg` slider
// in the panel's own accent, then the text-size stepper. The near-variants (respawn, xp, buffs)
// carry other controls in their footer and keep their own.

import type { JSX } from 'react'
import { TextScaleStepper } from './TextScaleStepper'
import { FOOTER_ROW } from './overlayScale'
import type { OverlayChrome } from './useOverlayChrome'

/**
 * Footer controls — interactive mode only: bg-alpha slider + text size.
 *
 * CHROME, so it is UNSCALED and must fit whatever window it is in — ONE ROW, always (owner: the
 * A+ was rendering cut off mid-glyph on a narrow meter). The BUTTONS are fixed-size and never
 * shrink; the SLIDER is the give: `flexBasis: 0` + a floor small enough to still be draggable
 * means it absorbs every pixel the row is short, instead of an `<input type=range>`'s intrinsic
 * width pushing the controls that fix a too-small window off the edge of one.
 */
export function BgFooter({
  accent,
  bgAlpha,
  textScale,
  patch,
  noDrag
}: {
  accent: string
  bgAlpha: number
  textScale: number
  patch: OverlayChrome['patch']
  noDrag: React.CSSProperties
}): JSX.Element {
  return (
    <div
      style={{
        ...FOOTER_ROW,
        ...noDrag,
        gap: 8,
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)'
      }}
    >
      {/* The word IS the label (JOS-358) — the footer names its own controls, it does not hover. */}
      <span style={{ flexShrink: 0 }}>bg</span>
      <input
        type="range"
        min={0.1}
        max={1}
        step={0.02}
        value={bgAlpha}
        onChange={(e) => patch({ bgAlpha: Number(e.target.value) })}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 24, accentColor: accent, height: 4 }}
      />
      <TextScaleStepper textScale={textScale} patch={patch} noDrag={noDrag} />
    </div>
  )
}
