// spellIcons.ts — THE GAME'S OWN SPELL GEM ART, sliced out of the player's own client install.
//
// The owner's ask, verbatim (2026-09-10): *"spells need icons next to them"*.
//
// ── WHERE THE PIXELS COME FROM, AND WHY THERE IS NO NETWORK HERE ──────────────────────────────
//
// Item icons ride `eqimg://item/<id>`, which is a wiki fetch with a permanent disk cache behind a
// shipped bundle. NONE of that applies to spells and none of it is wanted: no wiki hosts these, and
// the standing rule on this fork is that a new wiki fetch is an owner-and-creator decision rather
// than a thing a feature helps itself to. It does not need one. The art is already on the machine,
// in the same install this app already reads `spells_us.txt` out of:
//
//     <eqRoot>/uifiles/default/Spells01.tga … Spells63.tga
//
// Each sheet is 256x256 and holds a 6x6 grid of 40px tiles, 36 icons to a sheet, so icon `n` is
// sheet `floor(n/36)+1` at grid position `n%36`. `SpellResistInfo.icon` (field 75) is that number.
// Measured against the game's own tooltips, 2026-09-10: Togor's Insects reads 17 and the tile at
// sheet 1 index 17 is the BOOT the client draws on its gem; Odium reads 165 and gets the skull.
//
// IT IS DAYBREAK'S ART AND IT IS NEVER REDISTRIBUTED. Nothing is written to disk, nothing is
// committed, and a machine with no EverQuest install simply has no spell icons - the same shape
// `spells_us.txt`'s absence already takes everywhere else in this app, and the callers draw a blank
// box rather than an error.
//
// ── WHY A DECODER LIVES HERE AT ALL ───────────────────────────────────────────────────────────
//
// ── IT TAKES THE INSTALL ROOT AS AN ARGUMENT, AND THAT IS NOT DECORATION ─────────────────────
//
// `effectiveEqRoot()` reaches the Electron `app` through the store, and this module is reached from
// `imageCache.ts`, which is NODE-TESTED (`tests/imageCache.test.mts` imports it with no Electron in
// the process). Importing the root here crashed four suites at module load. So the root arrives the
// way `ImageCacheOptions.userData` already arrives - injected by the one caller that has Electron -
// and both memos key on it, so a changed install path cannot serve stale pixels.
//
// `<img src="…tga">` is not a thing a browser can do, so the bytes have to become a PNG somewhere,
// and "somewhere" is main because that is where the filesystem is. Both halves are small and
// dependency-free: TGA is a header plus pixels (the only wrinkle is that five of the owner's 63
// sheets are RLE-compressed, type 10, and one of them holds Odium's skull), and a PNG is a
// zlib-deflated scanline stream with three CRC'd chunks, which `node:zlib` does all the work of.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

/** One tile, in pixels. The client's own gem size. */
const CELL = 40
/** Tiles across one sheet, and therefore per row of the grid. */
const PER_ROW = 6
/** 6x6. A sheet is 256px square and uses 240 of it; the last 16px are unused by the client too. */
const PER_SHEET = PER_ROW * PER_ROW
/** The highest icon id worth trying. 63 sheets on the owner's install; past that there is no file. */
const MAX_ICON_ID = 64 * PER_SHEET

/** Decoded sheets, kept because a table of spells hits the same handful over and over. */
const sheetCache = new Map<string, DecodedSheet | null>()
/** Encoded tiles. ~2 KB each and a spell list asks for the same ones every scroll. */
const tileCache = new Map<string, Buffer | null>()
/** Sheets are 256 KB decoded; a browsing session touches few, and this caps the damage if not. */
const MAX_SHEETS_CACHED = 8
const MAX_TILES_CACHED = 1024

interface DecodedSheet {
  width: number
  height: number
  /** Top-down RGBA, whatever the file's own origin was. */
  rgba: Buffer
}

/** The sheet a given icon id lives on, 1-based, as the client names its files. */
function sheetNumber(icon: number): number {
  return Math.floor(icon / PER_SHEET) + 1
}

function sheetPath(eqRoot: string, n: number): string {
  return join(eqRoot, 'uifiles', 'default', `Spells${String(n).padStart(2, '0')}.tga`)
}

/**
 * TGA -> top-down RGBA.
 *
 * Handles the two types the client ships: 2 (uncompressed) and 10 (run-length encoded). Anything
 * else returns null rather than guessing, because a wrong guess here is a screenful of noise -
 * which is exactly what the first cut of this produced on `Spells05.tga` before the RLE branch
 * existed, and the reason that branch is not "defensive" but measured.
 *
 * The image descriptor's bit 5 is the vertical origin: set means the file's first row is the TOP
 * row, clear means it is the BOTTOM one. Both occur in the owner's install - sheets 1 through 4 are
 * top-down and everything from 6 up is bottom-up - so the flip is not optional.
 */
function decodeTga(buf: Buffer): DecodedSheet | null {
  if (buf.length < 18) return null
  const idLength = buf[0]
  const imageType = buf[2]
  const width = buf.readUInt16LE(12)
  const height = buf.readUInt16LE(14)
  const depth = buf[16]
  const descriptor = buf[17]
  if (width <= 0 || height <= 0 || (depth !== 24 && depth !== 32)) return null
  const bpp = depth / 8
  const start = 18 + idLength
  const pixels = readPixels(buf, { start, imageType, need: width * height * bpp, bpp })
  if (pixels === null) return null
  const topDown = (descriptor & 0x20) !== 0
  const rgba = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceRow = topDown ? y : height - 1 - y
    for (let x = 0; x < width; x++) {
      const s = (sourceRow * width + x) * bpp
      const o = (y * width + x) * 4
      // TGA stores BGR(A).
      rgba[o] = pixels[s + 2]
      rgba[o + 1] = pixels[s + 1]
      rgba[o + 2] = pixels[s]
      rgba[o + 3] = bpp === 4 ? pixels[s + 3] : 255
    }
  }
  return { width, height, rgba }
}

/** The raw BGRA plane, un-RLE'd where the file was compressed. Null when the bytes run out. */
function readPixels(buf: Buffer, plane: PixelPlane): Buffer | null {
  const { start, imageType, need, bpp } = plane
  if (imageType === 2) {
    return buf.length - start >= need ? buf.subarray(start, start + need) : null
  }
  if (imageType !== 10) return null
  return readRle(buf, start, Buffer.alloc(need), bpp)
}

/** Where the pixels begin and what shape they are - four facts that never travel apart. */
interface PixelPlane {
  /** Byte offset of the first pixel, past the header and any id field. */
  start: number
  /** TGA image type: 2 uncompressed, 10 run-length encoded. */
  imageType: number
  /** How many bytes the decoded plane must come to. */
  need: number
  /** Bytes per pixel: 3 or 4. */
  bpp: number
}

/** The type-10 run-length stream: a packet header byte, then either one pixel or `n` of them. */
function readRle(buf: Buffer, start: number, out: Buffer, bpp: number): Buffer | null {
  let p = start
  let o = 0
  while (o < out.length) {
    if (p >= buf.length) return null
    const packet = buf[p++]
    const count = (packet & 0x7f) + 1
    if ((packet & 0x80) !== 0) {
      if (p + bpp > buf.length) return null
      for (let k = 0; k < count && o < out.length; k++) {
        buf.copy(out, o, p, p + bpp)
        o += bpp
      }
      p += bpp
    } else {
      const span = Math.min(count * bpp, out.length - o)
      if (p + span > buf.length) return null
      buf.copy(out, o, p, p + span)
      o += span
      p += count * bpp
    }
  }
  return out
}

// =================================================================================================
// PNG OUT - three chunks and a deflate, which is all a truecolour-alpha PNG is
// =================================================================================================

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/** RGBA -> PNG. Filter byte 0 on every scanline: these are 40x40 tiles, so nothing needs filtering. */
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour with alpha
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// =================================================================================================
// THE DOOR
// =================================================================================================

/** Read and decode one sheet, remembering the answer - including a NO, so a miss is asked once. */
function sheet(eqRoot: string, n: number): DecodedSheet | null {
  const key = `${eqRoot} ${String(n)}`
  const hit = sheetCache.get(key)
  if (hit !== undefined) return hit
  let decoded: DecodedSheet | null = null
  try {
    decoded = decodeTga(readFileSync(sheetPath(eqRoot, n)))
  } catch {
    // No install, no such sheet, or an unreadable file. All three are "this machine has no icon
    // for that", which is a supported state everywhere this is called from.
    decoded = null
  }
  if (sheetCache.size >= MAX_SHEETS_CACHED) sheetCache.clear()
  sheetCache.set(key, decoded)
  return decoded
}

/**
 * ONE SPELL GEM ICON as PNG bytes, or null when this machine cannot produce it.
 *
 * Null is a first-class answer and the callers draw nothing rather than a broken image: no
 * EverQuest install, an install whose `uifiles` were replaced by a custom UI that does not ship
 * these sheets, or an icon id past the last sheet the client has.
 */
export function spellIconPng(eqRoot: string, icon: number): Buffer | null {
  if (eqRoot === '' || !Number.isInteger(icon) || icon < 0 || icon >= MAX_ICON_ID) return null
  const key = `${eqRoot} ${String(icon)}`
  const cached = tileCache.get(key)
  if (cached !== undefined) return cached
  const png = cutTile(eqRoot, icon)
  if (tileCache.size >= MAX_TILES_CACHED) tileCache.clear()
  tileCache.set(key, png)
  return png
}

/** The tile itself, uncached. Split out so `spellIconPng` reads as the memo it is. */
function cutTile(eqRoot: string, icon: number): Buffer | null {
  const source = sheet(eqRoot, sheetNumber(icon))
  if (source === null) return null
  const index = icon % PER_SHEET
  const left = (index % PER_ROW) * CELL
  const top = Math.floor(index / PER_ROW) * CELL
  if (left + CELL > source.width || top + CELL > source.height) return null
  const tile = Buffer.alloc(CELL * CELL * 4)
  for (let y = 0; y < CELL; y++) {
    const from = ((top + y) * source.width + left) * 4
    source.rgba.copy(tile, y * CELL * 4, from, from + CELL * 4)
  }
  return encodePng(CELL, CELL, tile)
}

/** Test seam: forget both memos so a test can swap the install under them. */
export function resetSpellIconCache(): void {
  sheetCache.clear()
  tileCache.clear()
}
