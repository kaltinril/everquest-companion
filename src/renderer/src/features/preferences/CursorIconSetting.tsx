// CursorIconSetting — the "My icon / drawing" row of Preferences → Cursor overlay (owner,
// 2026-11-26: "user can upload an icon (it can either be auto downsized if it's not a lot of code
// bloat, or, require it be a small icon) 2. a simple quick NxN grid they can draw on like paint").
//
// Shown while the Shape is "My icon / drawing". Two ways to make ONE picture:
//   * Upload: any png / jpg / gif / webp / bmp / ico up to 5 MB, decoded with createImageBitmap
//     (no blob: URL, so index.html's CSP is not involved) and AUTO DOWNSIZED on a canvas to fit
//     64 x 64, aspect ratio kept, then exported as a PNG data URL. A few lines, no library.
//   * Draw: the grid editor (CursorDrawingGrid.tsx), whose Save renders a PNG data URL too.
// Both store through the card's one `update`; main re-runs the strict validator
// (shared/cursorPicture.ts) on every write, so a renderer cannot store anything but a small PNG.

import { type JSX, useRef, useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import type { CursorDrawing, CursorRingPrefs } from '@shared/presencePrefs'
import {
  ICON_MAX_SIDE_PX,
  MAX_ICON_FILE_BYTES,
  fitWithin,
  normalizePictureDataUrl
} from '@shared/cursorPicture'
import { CursorDrawingGrid } from './CursorDrawingGrid'

type OnChange = (patch: Partial<CursorRingPrefs>) => void

/** What the file dialog offers. SVG is left out on purpose: it is a document, not a bitmap. */
const ICON_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.ico,image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon,image/vnd.microsoft.icon'

/** The file downsized to fit ICON_MAX_SIDE_PX as a validated PNG data URL, or an error line. */
async function downsizeIcon(file: File): Promise<{ url: string } | { error: string }> {
  if (file.size > MAX_ICON_FILE_BYTES) return { error: 'That file is over 5 MB. Pick a smaller picture.' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { error: 'That file is not a picture this can read (png, jpg, gif, webp, bmp or ico).' }
  }
  const size = fitWithin(bitmap.width, bitmap.height, ICON_MAX_SIDE_PX)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!size || !ctx) {
    bitmap.close()
    return { error: 'That picture has no size to draw.' }
  }
  canvas.width = size.w
  canvas.height = size.h
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, size.w, size.h)
  bitmap.close()
  const url = normalizePictureDataUrl(canvas.toDataURL('image/png'))
  return url === '' ? { error: 'That picture is too detailed to store. Try a simpler one.' } : { url }
}

export function PictureRow({ prefs, onChange }: { prefs: CursorRingPrefs; onChange: OnChange }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [drawing, setDrawing] = useState(false)

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const r = await downsizeIcon(file)
    if ('error' in r) {
      setError(r.error)
      return
    }
    setError('')
    onChange({ imageDataUrl: r.url, shape: 'image' })
  }

  const onSave = (d: CursorDrawing, png: string): void => {
    setDrawing(false)
    onChange({ drawing: d, imageDataUrl: png, shape: 'image' })
  }

  const has = prefs.imageDataUrl !== ''
  return (
    <Stack spacing={1} data-testid="pref-cursor-picture">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <Button size="small" variant="outlined" data-testid="pref-cursor-icon-upload" onClick={() => fileRef.current?.click()}>
          Upload icon…
        </Button>
        <Button size="small" variant="outlined" data-testid="pref-cursor-draw-open" onClick={() => setDrawing(true)} disabled={drawing}>
          {prefs.drawing.cells.some((c) => c !== '') ? 'Edit drawing' : 'Draw one'}
        </Button>
        {has && (
          <Button size="small" data-testid="pref-cursor-picture-remove" onClick={() => onChange({ imageDataUrl: '' })}>
            Remove picture
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ICON_ACCEPT}
          hidden
          data-testid="pref-cursor-icon-file"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </Stack>
      {error !== '' && (
        <Typography variant="caption" color="error" data-testid="pref-cursor-icon-error">
          {error}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {has
          ? 'Your picture is drawn at the Size above, with the offset applied. Color and thickness do not change it (the color still tints the trail).'
          : 'No picture yet, so the circle is drawn. Upload one (shrunk to fit 64 x 64) or draw one.'}
      </Typography>
      {drawing && <CursorDrawingGrid initial={prefs.drawing} onSave={onSave} onClose={() => setDrawing(false)} />}
    </Stack>
  )
}
