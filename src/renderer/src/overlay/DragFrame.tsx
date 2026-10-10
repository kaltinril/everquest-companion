// DragFrame — the STRIPS' positioning frame: the celebration toast, the alert banner and the mob
// card, which differ only in their test id and the words on it.
//
// Shown only while the overlay is unlocked. It is also where the TEXT SIZE and the TRANSPARENCY
// live for these kinds, for the same reason the drag handle does: a strip has no header and no
// footer to hang a control off — it renders nothing at all most of the time — so this frame is
// the only chrome it ever shows. Preferences → Overlays → "Move it" is therefore the whole route
// to all three knobs: move it, size it, fade it, Done. (The `bg` slider arrived in JOS-407; until
// then a strip's 0.72 was not settable at all.)

import type { JSX } from 'react'
import { TextScaleStepper } from './TextScaleStepper'
import { BgAlphaSlider } from './BgAlphaSlider'
import type { OverlayChrome } from './useOverlayChrome'

const GOLD = '#d9b25f'

export function DragFrame({
  testId,
  prompt,
  chrome
}: {
  testId: string
  prompt: string
  chrome: OverlayChrome
}): JSX.Element {
  const { patch, noDrag } = chrome
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 8,
        padding: '6px 10px',
        borderRadius: 8,
        border: `1px dashed ${GOLD}`,
        background: 'rgba(15,17,21,0.65)',
        color: GOLD,
        fontSize: 11
      }}
    >
      {/* The PROSE is the give on a narrow strip; the three controls beside it are the whole point
          of the frame and stay whole at every width. */}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {prompt}
      </span>
      <BgAlphaSlider bgAlpha={chrome.bgAlpha} patch={patch} noDrag={noDrag} />
      <TextScaleStepper textScale={chrome.textScale} patch={patch} noDrag={noDrag} />
      <button
        type="button"
        onClick={chrome.toggleLock}
        style={{
          ...noDrag,
          flexShrink: 0,
          border: `1px solid ${GOLD}`,
          borderRadius: 4,
          background: 'transparent',
          color: GOLD,
          fontSize: 11,
          padding: '2px 8px',
          cursor: 'pointer'
        }}
      >
        Done
      </button>
    </div>
  )
}
