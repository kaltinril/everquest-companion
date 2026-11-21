// ============================================================================
// SHARED TEXT SANITIZER — one line of text with nothing in it that is not content.
// ============================================================================
//
// WHY THIS FILE EXISTS. Text the app did not write (a line of the game's log, an error message, a
// captured alert token) ends up in places that render it: a terminal, errors.log, a spoken or
// drawn alert. Two things must not survive the trip:
//
//   1. TERMINAL ESCAPE SEQUENCES. `ESC ] 0 ; ... BEL` retitles a terminal; `ESC [ 2 J` clears
//      it; the OSC 52 sequence WRITES THE CLIPBOARD. Text is DATA. It must never be able to
//      speak to the terminal that prints it.
//   2. INVISIBLE TEXT. Zero-width joiners, the BiDi overrides (the "Trojan Source" class) and
//      the BOM let one string RENDER as another.
//
// STRIPPING A CONTROL CHARACTER IS NORMALIZATION, NOT TRUNCATION. A NUL, an ESC or a BiDi
// override is not content, so removing it never shortens what was actually written.
//
// (Until 2026-11-20 this module also held the validators for the feedback and usage-analytics
// wire. Both services are removed; what is left is the one-line normalizer local code uses.)
//
// PURE, like every other module in `src/shared/**`: zero imports, no `node:`, no Electron, no
// DOM. It compiles under both tsconfigs.

/* eslint-disable no-control-regex -- control characters ARE this module's subject matter.
   Every class below is written in explicit hex escapes so the source stays plain ASCII and a
   reviewer can check the code points against the tables without a hex editor. */

/**
 * ANSI/VT escape sequences, matched WHOLE so the payload (`[31m`, `]0;title`) leaves with the
 * ESC instead of being left behind as visible litter.
 *
 * Four ORDERED arms, and the order is the design:
 *   1. CSI              ESC [ params intermediates final   — colors, cursor moves, erase-display
 *   2. string-openers   ESC ] P ^ _ X … BEL|ST             — OSC (window title, and OSC 52,
 *                                                            which WRITES THE CLIPBOARD), DCS,
 *                                                            PM, APC, SOS; payload eaten whole
 *   3. nF               ESC <0x20..0x2F>+ <0x30..0x7E>     — charset selection, e.g. `ESC ( B`
 *   4. anything else    ESC <one printable>                — Fe (0x40..0x5F, the C1 twins), Fs
 *                                                            (0x60..0x7E, incl. `ESC c` = full
 *                                                            terminal reset), Fp private forms
 *
 * Arm 4 is the catch-all ON PURPOSE: an ESC this file does not recognise must still lose its
 * ESC. A malformed CSI/OSC falls out of arms 1–2 into it and is defanged rather than passed
 * through. A trailing lone ESC matches nothing here and is deleted by the control class below,
 * as are the C1 single-byte equivalents (0x9B CSI, 0x9D OSC).
 */
const ANSI_RE =
  /\x1B(?:\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]|[\]P^_X][^\x07\x1B]*(?:\x07|\x1B\\)?|[\x20-\x2F]+[\x30-\x7E]|[\x20-\x7E])/g

/** Every C0 control, DEL, and every C1 control. Nothing in this class is content. */
const CONTROL_ANY_RE = /[\x00-\x1F\x7F-\x9F]/g

/** CR and CRLF, normalized to LF before anything else looks at the string. */
const NEWLINE_RE = /\x0D\x0A?/g

/* eslint-enable no-control-regex */

/**
 * Characters that render as nothing, or that reorder what renders around them:
 * ZWSP/ZWNJ/ZWJ and the LRM/RLM marks (200B-200F), LINE and PARAGRAPH SEPARATOR plus the BiDi
 * embeddings and OVERRIDES (2028-202E), the word joiner and the invisible operators (2060-2064),
 * the BiDi isolates (2066-2069), and the BOM/ZWNBSP (FEFF).
 */
const INVISIBLE_RE = /[\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** In a ONE-LINE rendering these three become a single space; every other control is deleted. */
const AS_SPACE = new Set(['\t', '\n', '\r'])

/** Strip ANSI/VT escape sequences whole. */
export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, '')
}

/**
 * The normalizer for anything that must occupy exactly one line: an error message on its way
 * to errors.log, a captured alert token.
 *
 * Newlines and tabs become a single space — text must not be able to forge extra lines —
 * and every other control and invisible character is deleted, ANSI sequences whole.
 */
export function sanitizeOneLine(raw: string): string {
  return stripAnsi(raw)
    .replace(NEWLINE_RE, '\n')
    .replace(CONTROL_ANY_RE, (c) => (AS_SPACE.has(c) ? ' ' : ''))
    .replace(INVISIBLE_RE, '')
}
