// MobCopyDialog — Copy on a Mobs or Merchants row (owner, 2026-11-10: "click copy ... it should do the
// fresh fetch of the page, compare and validate, and give me the updated full wiki to just copy/paste
// into place. I don't want to be doing surgery on the page if I don't have to"). The click reads the
// mob's page off the wiki once; with a page, only its empty fields take the draft's values and the
// whole page goes on the clipboard, what the page did not take set aside below ("Exceptions:
// individual currently EMPTY fields ... just give me that section and make sure I know that's the
// reason"); with none, the new page as before; with the wiki out of reach, the draft, said so.

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import type { GapRow } from '@shared/gaps'
import { fieldSection, mergeMobPage, type MobPageRead, type PageMerge } from '@shared/gapPageMerge'
import { wikiCreateUrl, wikiEditUrl } from '@shared/gapUrls'
import { hasMobTemplate } from '@shared/wikiTemplates'
import { copyText } from '../../lib/clipboard'
import { noteGapVerdict } from '../../lib/gapVerdicts'

/** What the dialog is showing: still reading, or the wiki's answer. */
export type MobRead = { state: 'reading' } | { state: 'read'; page: MobPageRead }

/** The one read, on the click: by the page title the row would make, else by the mob's name. */
export function readMobPage(row: GapRow, title: string, onRead: (r: MobRead) => void): void {
  onRead({ state: 'reading' })
  window.eq
    .gapMobPageRead(row.name, title === row.name ? undefined : title)
    .then((page) => {
      if ('found' in page) noteGapVerdict(row.domain, row.name, page.found ? 'hasPage' : 'noPage')
      onRead({ state: 'read', page })
    })
    .catch(() => onRead({ state: 'read', page: { offline: true } }))
}

/** The copy made of the read: the merged page, the draft as a new page, or the draft with the wiki out of reach. */
type MobCopy = { kind: 'merged'; title: string; merge: PageMerge; at: number } | { kind: 'draft'; title: string; text: string; at: number } | { kind: 'offline'; title: string; text: string } | { kind: 'freeText'; title: string; text: string }

/** When the page was read, as a clock time: a read answers the row's clicks for a while (mobLookup.ts READ_KEEP_MS). */
const clock = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function copyOf(read: MobRead, title: string, draft: string): MobCopy | undefined {
  if (read.state === 'reading') return undefined
  const page = read.page
  if ('offline' in page) return { kind: 'offline', title, text: draft }
  if (!page.found) return { kind: 'draft', title, text: draft, at: page.at }
  if (!hasMobTemplate(page.wikitext)) return { kind: 'freeText', title: page.title, text: draft }
  return { kind: 'merged', title: page.title, merge: mergeMobPage(page.wikitext, draft), at: page.at }
}

const clipboardText = (c: MobCopy): string => (c.kind === 'merged' ? c.merge.text : c.text)

const WHY: Record<PageMerge['leftover'][number]['why'], string> = {
  'has content': 'already has content, so the app did not touch it.',
  'no field': 'is not a field on this page, so the app did not add it.',
  'own words': "is the page's own words, so the app never writes it."
}

function Lead({ copy }: { copy: MobCopy }): JSX.Element {
  if (copy.kind === 'merged') {
    const n = copy.merge.filled.length
    const m = copy.merge.leftover.length
    return (
      <Stack spacing={0.5} sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(76, 175, 80, 0.14)' }} data-testid="mob-copy-lead">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Page found on the wiki as of {clock(copy.at)}. The whole page is on your clipboard with {n} {n === 1 ? 'field' : 'fields'} filled in
          {m > 0 ? `; ${String(m)} ${m === 1 ? 'field is' : 'fields are'} left for you below.` : '.'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {n > 0 ? `Filled because they were empty: ${copy.merge.filled.join(', ')}. ` : 'Nothing on the page was empty where your log has something. '}
          Everything else is word for word as the page had it. Paste over the page in Edit page; the wiki&apos;s own diff shows what moved.
        </Typography>
      </Stack>
    )
  }
  const words: Record<Exclude<MobCopy['kind'], 'merged'>, string> = {
    draft: `No page on the wiki as of ${copy.kind === 'draft' ? clock(copy.at) : ''}. The whole new page is on your clipboard. (A read is kept for half an hour, so the wiki is not asked on every click.)`,
    offline: "Couldn't reach the wiki: the page from your log alone is on your clipboard. Check the wiki before you make a page.",
    freeText: `The wiki's page ${copy.title} is free text with no mob box, so nothing could be filled: the page from your log is on your clipboard to take fields from by hand.`
  }
  return (
    <Typography variant="body2" sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(33, 150, 243, 0.12)' }} data-testid="mob-copy-lead">
      {words[copy.kind]}
    </Typography>
  )
}

function Leftover({ merge }: { merge: PageMerge }): JSX.Element | null {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  if (merge.leftover.length === 0) return null
  return (
    <Stack spacing={1} data-testid="mob-copy-leftover">
      <Typography variant="overline">Paste by hand</Typography>
      {merge.leftover.map((l) => (
        <Stack key={l.field} spacing={0.5} sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(255, 193, 7, 0.1)' }}>
          <Typography variant="body2">
            <strong>{l.field}</strong> {WHY[l.why]}
          </Typography>
          <Box component="pre" sx={{ m: 0, p: 1, fontSize: 12, whiteSpace: 'pre-wrap', bgcolor: 'background.default', borderRadius: 1 }}>
            {fieldSection(l.field, l.value)}
          </Box>
          <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => void copyText(fieldSection(l.field, l.value)).then((ok) => setCopiedField(ok ? l.field : null))}>
            {copiedField === l.field ? 'Copied' : 'Copy these lines'}
          </Button>
        </Stack>
      ))}
    </Stack>
  )
}

export function MobCopyDialog({ row, read, title, draft, onClose }: { row: GapRow; read: MobRead; title: string; draft: () => string; onClose: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false)
  // Merged once per answer, not on every render. `draft` is a new closure on every parent render, so
  // it is read through a ref: as a dependency it re-merged each render and the effect below put the
  // whole page back on the clipboard, over a field the player had just copied by hand.
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  })
  const copy = useMemo(() => copyOf(read, title, draftRef.current()), [read, title])
  // The click's promise: the text is on the clipboard as soon as the read answers.
  useEffect(() => {
    if (copy !== undefined) void copyText(clipboardText(copy)).then(setCopied)
  }, [copy])
  const exists = copy?.kind === 'merged' || copy?.kind === 'freeText'
  const shown = copy?.title ?? title
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth data-testid="mob-copy-dialog" onClick={(e) => e.stopPropagation()}>
      <DialogTitle>{shown}</DialogTitle>
      <DialogContent>
        {copy === undefined ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={16} />
            <Typography variant="body2">Reading the wiki page for {row.name}…</Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Lead copy={copy} />
            {copy.kind === 'merged' && <Leftover merge={copy.merge} />}
            <Box component="pre" data-testid="mob-copy-text" sx={{ m: 0, p: 1, maxHeight: '40vh', overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', bgcolor: 'background.default', borderRadius: 1 }}>
              {clipboardText(copy)}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button href={exists ? wikiEditUrl(shown) : wikiCreateUrl(shown)} target="_blank" rel="noreferrer" disabled={copy === undefined}>
          {exists ? 'Edit page' : 'Create page'}
        </Button>
        <Button
          variant="contained"
          disabled={copy === undefined}
          data-testid="mob-copy-copy"
          onClick={() => {
            if (copy !== undefined) void copyText(clipboardText(copy)).then(setCopied)
          }}
        >
          {copied ? 'Copied' : 'Copy again'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
