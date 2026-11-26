// cursorPicture.ts — the cursor overlay's PICTURE: the player's own icon or drawing (owner,
// 2026-11-26: "user can upload an icon ... a simple quick NxN grid they can draw on like paint").
//
// ONE PICTURE, TWO WAYS TO MAKE IT. The upload (downsized in Preferences) and the drawing grid
// (rendered one pixel per cell) both end as a small PNG data URL in `CursorRingPrefs.imageDataUrl`,
// so the overlay window draws one <img> and never knows which made it.
//
// THE VALIDATOR IS THE SECURITY BOUNDARY. The string arrives from a renderer, the store file or a
// hand edit, and it ends up as an <img>.src in the overlay window, whose CSP allows `img-src data:`
// and nothing else. `normalizePictureDataUrl` lets through ONLY `data:image/png;base64,` + base64
// characters, under a hard length cap, whose decoded head is a real PNG signature and IHDR of a
// small picture. Anything else becomes '' (no picture: the circle is drawn). No SVG (it can carry
// script and external references), no other MIME type, no URL of any scheme.
//
// No DOM: the canvas work lives in the Preferences components; this is numbers and strings so the
// node tests can hold every rule. It imports nothing at runtime, so presencePrefs.ts (which the
// store migrations load before electron-store exists) can reach it without a cycle.

import type { CursorDrawing } from './presencePrefs'

/** The one prefix a stored picture may have. */
export const PICTURE_DATA_URL_PREFIX = 'data:image/png;base64,'
/** Hard cap on the whole data URL, in characters. A 64x64 PNG is a few KB; this is headroom, not a
 *  target, and it keeps a hand-edited store from pushing megabytes to the overlay on every config. */
export const MAX_PICTURE_CHARS = 64 * 1024
/** The largest picture side the validator accepts, px. The upload stores 64 at most and the grid
 *  32; a hand-made PNG up to this still draws, anything bigger is refused. */
export const MAX_PICTURE_SIDE_PX = 128
/** The upload's downsize target: the longest side, px, aspect ratio kept, never upscaled. */
export const ICON_MAX_SIDE_PX = 64
/** The biggest file the upload will even open, bytes. */
export const MAX_ICON_FILE_BYTES = 5 * 1024 * 1024
/** A picture this small or smaller (the drawing grid's 8 to 32, a tiny icon) is drawn with
 *  `image-rendering: pixelated`, so its cells stay crisp blocks instead of a blur. */
export const PIXEL_ART_MAX_SIDE_PX = 32

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** PNG signature, then the IHDR chunk's length (13) and type. */
const PNG_HEAD = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]

/** The first `quads` * 3 bytes of a base64 string already checked against BASE64_BODY. */
function decodeHead(body: string, quads: number): number[] {
  const out: number[] = []
  for (let q = 0; q < quads; q++) {
    let n = 0
    for (let k = 0; k < 4; k++) n = (n << 6) | Math.max(0, B64.indexOf(body[q * 4 + k]))
    out.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  return out
}

const u32 = (b: number[], at: number): number =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

/** Width and height from a PNG data URL's IHDR, or null when it is not one this module accepts
 *  the shape of (prefix, charset, padding, signature). Does not check the length cap. */
export function pngSizeOf(dataUrl: string): { w: number; h: number } | null {
  if (!dataUrl.startsWith(PICTURE_DATA_URL_PREFIX)) return null
  const body = dataUrl.slice(PICTURE_DATA_URL_PREFIX.length)
  // 32 characters = 24 bytes: the signature, the IHDR header, width and height.
  if (body.length < 32 || body.length % 4 !== 0 || !BASE64_BODY.test(body)) return null
  const head = decodeHead(body, 8)
  if (PNG_HEAD.some((byte, i) => head[i] !== byte)) return null
  return { w: u32(head, 16), h: u32(head, 20) }
}

/**
 * A stored picture, or '' for none. STRICT ON PURPOSE (the header says why): the exact PNG data URL
 * prefix, base64 characters only, at most MAX_PICTURE_CHARS, a PNG signature, and a picture of 1 to
 * MAX_PICTURE_SIDE_PX on each side. Takes `unknown`: a store file may carry anything.
 */
export function normalizePictureDataUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_PICTURE_CHARS) return ''
  const size = pngSizeOf(value)
  if (!size) return ''
  const ok = (side: number): boolean => side >= 1 && side <= MAX_PICTURE_SIDE_PX
  return ok(size.w) && ok(size.h) ? value : ''
}

/** How the overlay scales a picture: tiny pixel art stays crisp, a downsized photo stays smooth. */
export function pictureRendering(dataUrl: string): 'pixelated' | 'auto' {
  const size = pngSizeOf(dataUrl)
  return size && Math.max(size.w, size.h) <= PIXEL_ART_MAX_SIDE_PX ? 'pixelated' : 'auto'
}

/** The upload's canvas size: the picture fitted inside `max` x `max`, aspect ratio kept, never
 *  upscaled, whole px of at least 1. Null for an image with no size (a broken file). */
export function fitWithin(w: number, h: number, max = ICON_MAX_SIDE_PX): { w: number; h: number } | null {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** No painted cell at all: saving it stores no picture (the circle is drawn). */
export function drawingIsBlank(d: CursorDrawing): boolean {
  return d.cells.every((c) => c === '')
}

/** The drawing on a new grid size: the top-left of the old one is kept where it fits, the rest is
 *  blank. `n` is already one of DRAWING_SIZES (the picker offers nothing else). */
export function resizeDrawing(d: CursorDrawing, n: number): CursorDrawing {
  const cells: string[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) cells.push(x < d.n && y < d.n ? (d.cells[y * d.n + x] ?? '') : '')
  }
  return { n, cells }
}

/** The cell under a point given as a fraction (0 to 1) of the grid's width and height, as an index
 *  into `cells`, or null off the grid. The editor's pointer maths, held here so node can test it. */
export function gridCellAt(fx: number, fy: number, n: number): number | null {
  if (!(fx >= 0 && fx < 1 && fy >= 0 && fy < 1)) return null
  return Math.floor(fy * n) * n + Math.floor(fx * n)
}
