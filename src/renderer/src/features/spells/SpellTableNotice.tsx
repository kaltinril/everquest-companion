// spells/SpellTableNotice.tsx — the notice above every Spells view when the client's spell file is
// missing (owner, 2026-11-23: "sure show notice and look for alternative").
//
// IT STAYS UP. No close button: it is there for as long as there is no spell file, and it goes by
// itself once there is one (it asks again every half minute while it is up, so picking the folder
// in Preferences clears it without a restart). When another language's file is read instead, one
// quiet line says which. What it says is decided in `shared/spellTableNotice.ts`; this draws it.
//
// THE VIEW FILLS WHAT IS LEFT. The Spellbook is `height: 100%` of the scrolling content box with its
// own windowed scroll inside; a line simply stacked above it would push it past the bottom and give
// the page a second scrollbar. So the view sits in a column under the notice and fills the rest; a
// taller view (Upgrades, Loadout) still overflows into the content box's own scroll as before.

import { type JSX, type ReactNode, useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import { spellTableNotice, type SpellTableNotice as Notice, type SpellTableReport } from '@shared/spellTableNotice'

/** How often the notice asks again while it is up. */
const RECHECK_MS = 30_000

function useSpellTableReport(): SpellTableReport | null {
  const [report, setReport] = useState<SpellTableReport | null>(null)
  const up = report !== null && (report.state === 'missing' || report.state === 'unloadable')
  useEffect(() => {
    let alive = true
    const ask = (): void => {
      window.eq.spellTableReport().then(
        (r) => {
          if (alive) setReport(r)
        },
        () => {
          /* a failed ask leaves what is shown alone */
        }
      )
    }
    ask()
    const timer = up ? setInterval(ask, RECHECK_MS) : undefined
    return () => {
      alive = false
      if (timer !== undefined) clearInterval(timer)
    }
  }, [up])
  return report
}

function MissingNotice({ notice }: { notice: Extract<Notice, { kind: 'missing' | 'unloadable' }> }): JSX.Element {
  const headline =
    notice.kind === 'missing'
      ? 'No spell file found. Looked for spells_us.txt, or another spells_*.txt, in:'
      : `The spell file ${notice.file} could not be read. It is in:`
  return (
    <Alert severity="warning" data-testid="spell-table-notice" data-kind={notice.kind} sx={{ mb: 1 }}>
      <Typography variant="body2">{headline}</Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {notice.folder}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        Without it, these are missing: {notice.lacks.join('; ')}.
      </Typography>
    </Alert>
  )
}

function NoticeLine({ notice }: { notice: Notice }): JSX.Element {
  if (notice.kind !== 'fallback') return <MissingNotice notice={notice} />
  return (
    <Typography variant="caption" color="text.secondary" component="div" data-testid="spell-table-fallback" sx={{ mb: 0.5 }}>
      Spell data is read from {notice.file} (no spells_us.txt in your EverQuest folder).
    </Typography>
  )
}

/** A Spells view, with the spell-file notice above it when there is one. */
export default function SpellTableNoticeFrame({ children }: { children: ReactNode }): JSX.Element {
  const notice = spellTableNotice(useSpellTableReport())
  // ONE TREE EITHER WAY: the view stays mounted when the notice comes or goes (a fallback file's
  // answer can arrive seconds in, after its parse), and only the boxes' styles change.
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {notice !== null && <NoticeLine notice={notice} />}
      <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
    </Box>
  )
}
