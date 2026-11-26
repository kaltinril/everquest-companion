// The cursor overlay's PICTURE (owner, 2026-11-26: "user can upload an icon ... a simple quick NxN
// grid they can draw on like paint"). Pins:
//   1. Only a small, real PNG data URL is ever stored (the validator is the security boundary).
//   2. The drawing grid normalizes to an allowed N and exactly N*N clean cells.
//   3. `'image'` with no picture draws the circle; the defaults change nobody's overlay.
//   4. The overlay window takes images from data: only, and sets the picture once per config.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CURSOR_RING,
  DRAWING_SIZES,
  normalizeCursorRing,
  normalizeDrawing
} from '../src/shared/presencePrefs'
import {
  MAX_PICTURE_CHARS,
  drawingIsBlank,
  fitWithin,
  gridCellAt,
  normalizePictureDataUrl,
  pictureRendering,
  pngSizeOf,
  resizeDrawing
} from '../src/shared/cursorPicture'
import { ringGeometry, ringPicture, ringTransform } from '../src/shared/cursorRingShape'

const REPO = process.cwd()

/** A real 1x1 PNG, as canvas.toDataURL would hand it over. */
const TINY_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const TINY = `data:image/png;base64,${TINY_B64}`

/** The tiny PNG with its IHDR claiming `w` x `h` (the validator reads the header, not the CRC). */
function pngClaiming(w: number, h: number): string {
  const bytes = Buffer.from(TINY_B64, 'base64')
  bytes.writeUInt32BE(w, 16)
  bytes.writeUInt32BE(h, 20)
  return `data:image/png;base64,${bytes.toString('base64')}`
}

test('the validator keeps a real small PNG data URL and reads its size', () => {
  assert.equal(normalizePictureDataUrl(TINY), TINY)
  assert.deepEqual(pngSizeOf(TINY), { w: 1, h: 1 })
  assert.equal(normalizePictureDataUrl(pngClaiming(64, 40)), pngClaiming(64, 40))
  assert.equal(normalizePictureDataUrl(pngClaiming(128, 128)), pngClaiming(128, 128))
})

test('the validator refuses every other type, scheme and shape of string', () => {
  const junk: unknown[] = [
    `data:image/jpeg;base64,${TINY_B64}`,
    `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`,
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    `DATA:image/png;base64,${TINY_B64}`,
    ` ${TINY}`,
    `data:image/png,${TINY_B64}`,
    'http://example.com/a.png',
    'https://example.com/a.png',
    'file:///C:/Windows/win.ini',
    'blob:https://x/1',
    'javascript:alert(1)',
    `${TINY}"); background: url("http://x`,
    `${TINY}\n`,
    `${TINY.slice(0, -2)}*=`,
    `data:image/png;base64,${TINY_B64.slice(0, -1)}`,
    `data:image/png;base64,${Buffer.from('GIF89a not a png at all, padded out!!').toString('base64')}`,
    'data:image/png;base64,',
    '',
    null,
    42,
    {},
    [TINY]
  ]
  for (const j of junk) assert.equal(normalizePictureDataUrl(j), '', String(j).slice(0, 60))
})

test('the validator refuses an over-length string and an oversized or empty picture', () => {
  const padded = `${TINY.slice(0, -2)}${'A'.repeat(MAX_PICTURE_CHARS)}==`
  assert.ok(padded.length > MAX_PICTURE_CHARS)
  assert.equal(normalizePictureDataUrl(padded), '')
  assert.equal(normalizePictureDataUrl(pngClaiming(129, 10)), '')
  assert.equal(normalizePictureDataUrl(pngClaiming(10, 4096)), '')
  assert.equal(normalizePictureDataUrl(pngClaiming(0, 10)), '')
})

test('the normalizer runs the picture through the validator, and the default is no picture', () => {
  assert.equal(DEFAULT_CURSOR_RING.imageDataUrl, '')
  assert.equal(normalizeCursorRing({ imageDataUrl: TINY }).imageDataUrl, TINY)
  assert.equal(normalizeCursorRing({ imageDataUrl: 'javascript:alert(1)' }).imageDataUrl, '')
  assert.equal(normalizeCursorRing({ shape: 'image' }).shape, 'image')
})

test('the drawing grid: N from the allowed set, exactly N*N cells, bad colours become empty', () => {
  assert.deepEqual(DEFAULT_CURSOR_RING.drawing, { n: 16, cells: new Array(256).fill('') })
  assert.deepEqual([...DRAWING_SIZES], [8, 12, 16, 24, 32])
  for (const n of DRAWING_SIZES) assert.equal(normalizeDrawing({ n }).cells.length, n * n)
  for (const bad of [7, 0, 64, 1000, '16', null, 16.5]) assert.equal(normalizeDrawing({ n: bad }).n, 16)
  const short = normalizeDrawing({ n: 8, cells: ['#FF0000', '#0f0'] })
  assert.equal(short.cells.length, 64)
  assert.deepEqual(short.cells.slice(0, 3), ['#ff0000', '#00ff00', ''])
  assert.equal(normalizeDrawing({ n: 8, cells: new Array(500).fill('#123456') }).cells.length, 64)
  const dirty = normalizeDrawing({ n: 8, cells: ['red', 'url(x)', '#12345g', 7, null, {}, ' #abcdef ', 'rgb(1,2,3)'] })
  assert.deepEqual(dirty.cells.slice(0, 8), ['', '', '', '', '', '', '#abcdef', ''])
  for (const junk of [null, 'grid', [], { cells: 'abc' }]) assert.deepEqual(normalizeDrawing(junk), { n: 16, cells: new Array(256).fill('') })
  assert.deepEqual(normalizeCursorRing({ drawing: { n: 99 } }).drawing.n, 16)
})

test('resizing keeps the top-left, a blank grid is blank, and the pointer maps to a cell', () => {
  const d = normalizeDrawing({ n: 8, cells: ['#ffffff', ...new Array(8).fill(''), '#000000'] })
  const big = resizeDrawing(d, 12)
  assert.equal(big.cells.length, 144)
  assert.equal(big.cells[0], '#ffffff')
  assert.equal(big.cells[12 + 1], '#000000', 'row 1 col 1 stays row 1 col 1')
  assert.deepEqual(resizeDrawing(big, 8), d)
  assert.equal(drawingIsBlank(DEFAULT_CURSOR_RING.drawing), true)
  assert.equal(drawingIsBlank(d), false)
  assert.equal(gridCellAt(0, 0, 16), 0)
  assert.equal(gridCellAt(0.999, 0.999, 16), 255)
  assert.equal(gridCellAt(0.5, 0.25, 8), 2 * 8 + 4)
  for (const [x, y] of [[-0.01, 0], [1, 0], [0, 1], [NaN, 0]]) assert.equal(gridCellAt(x, y, 8), null)
})

test('the upload fits inside 64 px keeping its aspect ratio and never upscales', () => {
  assert.deepEqual(fitWithin(640, 480), { w: 64, h: 48 })
  assert.deepEqual(fitWithin(100, 1000), { w: 6, h: 64 })
  assert.deepEqual(fitWithin(16, 16), { w: 16, h: 16 })
  assert.deepEqual(fitWithin(5000, 1), { w: 64, h: 1 })
  for (const [w, h] of [[0, 10], [10, 0], [NaN, 5], [Infinity, 5]]) assert.equal(fitWithin(w, h), null)
})

test('pixel art is drawn crisp, a downsized picture smooth', () => {
  assert.equal(pictureRendering(pngClaiming(16, 16)), 'pixelated')
  assert.equal(pictureRendering(pngClaiming(32, 32)), 'pixelated')
  assert.equal(pictureRendering(pngClaiming(64, 48)), 'auto')
  assert.equal(pictureRendering('junk'), 'auto')
})

test("'image' with no picture draws the circle; with one, a strokeless box at the size footprint", () => {
  const circle = ringGeometry({ sizePx: 44, thicknessPx: 4, shape: 'circle' })
  assert.equal(ringPicture({ shape: 'image', imageDataUrl: '' }), null)
  assert.deepEqual(ringGeometry({ sizePx: 44, thicknessPx: 4, shape: 'image' }), circle)
  assert.deepEqual(ringGeometry({ sizePx: 44, thicknessPx: 4, shape: 'image', imageDataUrl: 'http://x/a.png' }), circle)
  // A picture stored while another shape is picked is not drawn.
  assert.equal(ringPicture({ shape: 'square', imageDataUrl: TINY }), null)
  const g = ringGeometry({ sizePx: 60, thicknessPx: 4, shape: 'image', imageDataUrl: TINY })
  assert.equal(ringPicture({ shape: 'image', imageDataUrl: TINY }), TINY)
  assert.deepEqual(g, { widthPx: 60, heightPx: 60, strokePx: 0, borderRadius: '0', rotateDeg: 0, inner: null })
  // The offset applies like every shape.
  assert.equal(ringTransform(g, { x: 100, y: 100 }, { x: 10, y: -5 }), 'translate3d(80px, 65px, 0)')
})

test('the defaults leave every existing overlay as it was', () => {
  const before = { enabled: true, sizePx: 80, thicknessPx: 6, colorHex: '#ff0000', shape: 'diamond', offsetXPx: 4 }
  const v = normalizeCursorRing(before)
  assert.equal(v.imageDataUrl, '')
  assert.equal(ringPicture(v), null)
  assert.deepEqual(ringGeometry(v), ringGeometry({ sizePx: 80, thicknessPx: 6, shape: 'diamond' }))
  assert.deepEqual(ringGeometry(DEFAULT_CURSOR_RING), ringGeometry({ sizePx: 44, thicknessPx: 4 }))
})

test('the overlay window loads images from data: only and sets the picture once per config', () => {
  const html = readFileSync(join(REPO, 'src/renderer/cursor.html'), 'utf8')
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
  assert.match(csp, /(^|; )img-src data:;/)
  assert.doesNotMatch(csp, /img-src[^;]*(https?:|file:|blob:|\*|'self')/)
  assert.match(html, /<div id="ring"><div id="ring-inner"><\/div><img id="ring-img" alt="" \/><\/div>/)
  const ring = readFileSync(join(REPO, 'src/renderer/src/overlay/cursorRing.ts'), 'utf8')
  assert.doesNotMatch(ring, /innerHTML|insertAdjacentHTML|outerHTML/)
  assert.match(ring, /applyPicture\(ringPicture\(cfg\)\)/)
  assert.match(ring, /pic\.src = picture/)
  // The hot path never touches the picture.
  const paint = ring.slice(ring.indexOf('function paint()'), ring.indexOf('function schedulePaint()'))
  assert.doesNotMatch(paint, /pic\b|applyPicture/)
})
