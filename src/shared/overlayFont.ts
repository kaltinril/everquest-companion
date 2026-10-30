// overlayFont.ts — the overlays' typeface, picked from the fonts installed on this PC (overlay
// polish; owner, 2026-10-29). The list is Windows' own font table in the registry, read locally
// (main/installedFonts.ts); nothing is fetched. The pick lives in localStorage, which the main
// window and every overlay window share, so a change reaches open overlays by the `storage` event.
// It is main-window data (defined here, not under overlay/), so an overlay reset keeps it, as it
// keeps the Preferences-wide text size.

/** The stored family name; absent or empty means the default typeface. */
export const OVERLAY_FONT_KEY = 'eq.overlayFont'

/** The custom property an overlay window sets when the player picked a font. */
export const OVERLAY_FONT_VAR = '--eqc-overlay-font'

/** The panels' typeface as they have always drawn it. */
export const OVERLAY_DEFAULT_STACK = 'Inter, "Segoe UI", Roboto, system-ui, sans-serif'

/** What an overlay panel's `fontFamily` is: the pick when there is one, the default otherwise. */
export const OVERLAY_FONT = `var(${OVERLAY_FONT_VAR}, ${OVERLAY_DEFAULT_STACK})`

/** The registry value names' type suffixes Chromium can draw; bitmap and vector fonts are left out. */
const DRAWABLE = /\s*\((?:TrueType|OpenType)\)$/i
/** Style words a value name carries that are faces of a family, not families of their own. */
const STYLE_TAIL = /(?:\s+(?:Bold|Italic|Oblique|Regular))+$/i
/** Characters a family name may not carry into a CSS value. */
const UNSAFE = /["\\;{}<>\p{Cc}]/u

/** A family name safe to quote into CSS, or undefined. */
export function cleanFontFamily(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const t = name.trim()
  return t.length > 0 && t.length <= 80 && !UNSAFE.test(t) ? t : undefined
}

/**
 * Font family names from the registry's font table value names (`Arial Bold (TrueType)`,
 * `Cambria & Cambria Math (TrueType)`), deduplicated and sorted. Style faces fold into their family;
 * weights Windows names as families (`Arial Black`, `Segoe UI Semibold`) stay.
 */
export function fontFamiliesFromRegistry(valueNames: readonly string[]): string[] {
  const out = new Map<string, string>()
  for (const v of valueNames) {
    if (!DRAWABLE.test(v)) continue
    for (const part of v.replace(DRAWABLE, '').split(' & ')) {
      const family = cleanFontFamily(part.replace(STYLE_TAIL, ''))
      if (family !== undefined && !out.has(family.toLowerCase())) out.set(family.toLowerCase(), family)
    }
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b))
}

/** The CSS font-family a pick draws with, the default stack behind it; '' for no pick. */
export function overlayFontStack(family: unknown): string {
  const f = cleanFontFamily(family)
  return f === undefined ? '' : `"${f}", ${OVERLAY_DEFAULT_STACK}`
}
