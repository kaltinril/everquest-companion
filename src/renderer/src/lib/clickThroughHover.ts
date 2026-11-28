// lib/clickThroughHover.ts — the click-through hover mode, written once (audit 2026-11-27, dup-ui-b-3).
//
// Two item hovers open in "click-through" mode: the item card (KnownItemTooltip `clickThrough`,
// JOS-181) and the compare-with-what-I-wear pair (GearCompareCard `GearRowCompare`, JOS-344). The mode
// is three facts, and before this file each card wrote them itself, line for line:
//   1. it opens BELOW its anchor and can only slide sideways (`bottom-start`, the modifiers below),
//   2. it takes no pointer events,
//   3. it closes on the first pointerdown anywhere, capture phase.
// The cards stay separate (they draw different things); only the mode is shared. Each card's header
// still says why its surface needs the mode. The Best in slot slot hover is NOT in this mode: it is
// interactive and right-placed on purpose (BisCells.tsx).

import { useCallback, useEffect, useState } from 'react'

/**
 * For a `bottom` placement Popper's `mainAxis` is the HORIZONTAL axis and `altAxis` the vertical
 * (`getMainAxisFromPlacement` gives 'x'), so this pair slides the card sideways to stay on screen and
 * never moves it vertically; `flip` off means it cannot jump above its anchor either. The card's top
 * edge is always its anchor's bottom edge, and the anchor is always below the toolbar. The 8px padding
 * keeps a clamped card off the glass rather than flush against it. JOS-344's measured pair
 * (GearCompareCard.tsx's header has the measurement); tests/clickThroughCardAxes.test.mts pins it.
 */
export const CLICK_THROUGH_MODIFIERS = [
  { name: 'flip', enabled: false },
  { name: 'preventOverflow', options: { mainAxis: true, altAxis: false, padding: 8 } }
]

/**
 * The popper slot props of the mode: the modifiers and no pointer events. `disableInteractive` already
 * leaves MUI's popper at `pointer-events: none`; it is written out because that is a library default
 * and this is the defect the whole mode exists for. Module scope, so a list of anchors shares one
 * object (JOS-206).
 */
export const CLICK_THROUGH_POPPER = { modifiers: CLICK_THROUGH_MODIFIERS, sx: { pointerEvents: 'none' } } as const

/**
 * The controlled open state the mode needs, because it CLOSES ON POINTERDOWN anywhere: capture phase,
 * so nothing downstream can swallow the event first, and `pointerdown` rather than `click` so the card
 * is gone before the control the user aimed at opens its own option list over the same band. MUI's own
 * hover lifecycle still drives `onOpen`/`onClose`.
 *
 * Inactive → nothing at all, so an ordinary card stays MUI-uncontrolled (its own hover/focus/touch
 * behaviour, not something worth reimplementing to share one code path).
 */
export function useCloseOnPointerDown(active = true): { open?: boolean; onOpen?: () => void; onClose?: () => void } {
  const [open, setOpen] = useState(false)
  const onClose = useCallback(() => {
    setOpen(false)
  }, [])
  const onOpen = useCallback(() => {
    setOpen(true)
  }, [])
  useEffect(() => {
    if (!active || !open) return
    window.addEventListener('pointerdown', onClose, true)
    return () => {
      window.removeEventListener('pointerdown', onClose, true)
    }
  }, [active, open, onClose])
  return active ? { open, onOpen, onClose } : {}
}
