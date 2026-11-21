// macros/macroSection.ts — which of the tab's two sections is open, as it is remembered.

export const MACRO_SECTIONS = ['characters', 'library'] as const
export type MacroSection = (typeof MACRO_SECTIONS)[number]

/** The remembered section. Anything else (nothing yet, or the old "sets") opens Characters. */
export function macroSection(raw: string | null): MacroSection {
  return MACRO_SECTIONS.find((s) => s === raw) ?? 'characters'
}
