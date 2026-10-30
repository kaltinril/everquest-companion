// fontPick.ts — the player's overlay font, applied to this overlay window (shared/overlayFont.ts).
// No pick leaves the window exactly as it always drew: no custom property, no body font. A pick sets
// the property every panel's `OVERLAY_FONT` reads, and the body font for the cards that name none.

import { OVERLAY_FONT_KEY, OVERLAY_FONT_VAR, overlayFontStack } from '../../../shared/overlayFont'

function apply(): void {
  let stack = ''
  try {
    stack = overlayFontStack(localStorage.getItem(OVERLAY_FONT_KEY))
  } catch {
    // A blocked store is the default font.
  }
  if (stack) document.documentElement.style.setProperty(OVERLAY_FONT_VAR, stack)
  else document.documentElement.style.removeProperty(OVERLAY_FONT_VAR)
  document.body.style.fontFamily = stack
}

/** Apply the pick now and on every change Preferences makes. */
export function installOverlayFont(): void {
  apply()
  window.addEventListener('storage', (e) => {
    if (e.key === OVERLAY_FONT_KEY || e.key === null) apply()
  })
}
