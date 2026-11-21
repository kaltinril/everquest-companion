// macros/colors.ts — what the game's twenty macro colour numbers look like, and how each is drawn
// readably in the app. The stored number is never changed by any of this.

type Rgb = readonly [number, number, number]

/** MEASURED (2026-11-20) from the game's edit window: the index is the stored colour number. */
export const MACRO_COLORS: readonly Rgb[] = [
  [240, 240, 240],
  [240, 180, 0],
  [0, 128, 0],
  [180, 100, 0],
  [0, 0, 128],
  [240, 0, 240],
  [128, 128, 128],
  [224, 224, 224],
  [130, 130, 0],
  [96, 96, 96],
  [0, 0, 0],
  [140, 0, 0],
  [160, 160, 160],
  [240, 0, 0],
  [0, 240, 0],
  [240, 240, 0],
  [0, 0, 240],
  [0, 100, 240],
  [0, 240, 240],
  [128, 0, 128]
]

/**
 * MEASURED against the twenty colours: no single grey keeps them all readable (the best reaches a
 * contrast of 1.27), and each colour on the better of these two reaches at least 3.
 */
const DARK_BACK: Rgb = [40, 40, 40]
const LIGHT_BACK: Rgb = [200, 200, 200]

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function css(rgb: Rgb): string {
  return `rgb(${rgb.join(', ')})`
}

export interface MacroSwatch {
  /** The colour itself. */
  color: string
  /** The grey it is readable on. */
  back: string
}

/** The grey a game colour is most readable on. */
export function swatchBack(rgb: Rgb): Rgb {
  return contrast(rgb, DARK_BACK) >= contrast(rgb, LIGHT_BACK) ? DARK_BACK : LIGHT_BACK
}

/** How a stored colour number is drawn; null for a number the game has no colour for. */
export function macroSwatch(color: number): MacroSwatch | null {
  const rgb = Number.isInteger(color) ? MACRO_COLORS.at(color < 0 ? MACRO_COLORS.length : color) : undefined
  return rgb === undefined ? null : { color: css(rgb), back: css(swatchBack(rgb)) }
}
