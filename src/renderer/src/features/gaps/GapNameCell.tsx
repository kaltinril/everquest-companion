// The Name cell of a Gaps row: two lines inside GapsTable's one fixed row height.
//
// THE NAME AND WHAT TO DO EACH GET A LINE (owner, 2026-11-21: "i can't read what i need to do because
// the name is so long it cuts off the reason chips", then, of one line shared between them, "things
// are cut off still"). The job tags and the name are the first line; what the row still needs, who
// holds it and any other note are the second, which a row with none of them does not draw. A name
// too long for its whole line still has its hover and the details pane.

import { type JSX } from 'react'
import { Box, Chip, Typography } from '@mui/material'
import { charactersOff, factionOf, onMobPage, type GapActionContext, type GapRow, type GapSuggest, type GapVerdict } from '@shared/gaps'
import { otherPageTitle } from '@shared/gapImages'
import { heldChipLabel, heldTitle, type GapHeld } from '@shared/gapHeld'
import { heldPlain } from '@shared/gapHeldTier'
import { GAP_JOB_LABEL, GAP_JOB_TIP, gapJob, type GapJob } from '@shared/gapJob'
import { shownName } from '@shared/gapEdits'
import { updateWhy } from '@shared/gapUpdateWhy'
import { wikiPageUrl } from '@shared/wiki'
import { Tooltip } from '../../lib/Tooltip'
import { ForcedChip } from './ForcedQuests'
import { EditedChip } from './GapRowEdit'

const ONE_LINE = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

/** Beside an image row named by the game: its page's title when that is spelled otherwise (owner, 2026-10-21). */
function PageTitleCaption({ row }: { row: GapRow }): JSX.Element | null {
  const title = otherPageTitle(row)
  if (title === undefined) return null
  return (
    <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1, fontWeight: 400 }} data-testid="gaps-page-title">
      (wiki page: {title})
    </Typography>
  )
}

/** Beside the name: the one known name within reach, linked to its page so the owner can fix it. */
export function SuggestCaption({ s }: { s: GapSuggest }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1, fontWeight: 400 }} data-testid="gaps-suggest">
      Probably{' '}
      <Box
        component="a"
        href={wikiPageUrl(s.page)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        sx={{ color: 'inherit', textDecoration: 'underline dotted' }}
      >
        {s.name}
      </Box>{' '}
      ({charactersOff(s.distance)})
    </Typography>
  )
}

/** The theme colour of each job's tag: two that no other chip on a row wears. */
const JOB_COLOR: Record<GapJob, 'secondary' | 'primary'> = { new: 'secondary', update: 'primary' }

/** Beside an Items row's name: who holds it right now (review C6), the counts and places in the tooltip. */
function HeldChip({ held }: { held: readonly GapHeld[] }): JSX.Element {
  // No +0 copy held: the Update tag's colour, and the tier in the label (owner, 2026-10-25).
  return (
    <Tooltip title={heldTitle(held)}>
      <Chip label={heldChipLabel(held)} size="small" color={heldPlain(held) ? 'success' : JOB_COLOR.update} variant="outlined" sx={{ ml: 1 }} data-testid="gaps-held" />
    </Tooltip>
  )
}

/**
 * Before the name (owner, 2026-10-21): "New page" or "Update page", the row's job (shared/gapJob.ts);
 * an update's tooltip says what its page lacks (`why`, shared/gapUpdateWhy.ts; owner, 2026-10-25).
 */
function JobChip({ job, why = [] }: { job: GapJob; why?: readonly string[] }): JSX.Element {
  return (
    <Tooltip title={why.length > 0 ? why.join(' ') : GAP_JOB_TIP[job]}>
      <Chip label={GAP_JOB_LABEL[job]} size="small" color={JOB_COLOR[job]} variant="outlined" sx={{ mr: 1, height: 20 }} data-testid={`gaps-job-${job}`} />
    </Tooltip>
  )
}

/** After the job tag (owner, 2026-10-21): Ready when nothing is left to capture (shared/gapReady.ts). */
function ReadyChip({ need }: { need: string }): JSX.Element | null {
  if (need !== '') return null
  return (
    <Tooltip title="Nothing left to capture in game: copy the page and post it.">
      <Chip label="Ready" size="small" color="success" sx={{ mr: 1, height: 20 }} data-testid="gaps-ready" />
    </Tooltip>
  )
}

/** After the name of a row not yet Ready: what is left to capture, a word each (`needs: lore`). */
function NeedsHint({ need }: { need: string }): JSX.Element | null {
  if (need === '') return null
  return (
    <Tooltip title="Capture these in game and the row turns Ready.">
      <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1, fontWeight: 400 }} data-testid="gaps-needs">
        needs: {need}
      </Typography>
    </Tooltip>
  )
}

/** The name, with all of it on its hover. */
function RowName({ name }: { name: string }): JSX.Element {
  return (
    <Box
      component="span"
      title={name}
      data-testid="gaps-row-name"
      sx={{ ...ONE_LINE, flex: '0 1 auto', minWidth: 0 }}
    >
      {name}
    </Box>
  )
}

export interface GapNameCellProps {
  row: GapRow
  verdict: GapVerdict
  /** what is left to capture, a word each; '' when the row is Ready */
  need: string
  chipContext?: GapActionContext
  held?: readonly GapHeld[]
  /** grouped: 1 under a zone, 2 under a mob, bulleted below its heading */
  depth: number
}

/** The second line: its first item sits flush left, its chips fit the line, and with nothing in it it takes no room. */
const REASONS_SX = {
  ...ONE_LINE,
  display: 'block',
  height: 18,
  lineHeight: '18px',
  '&:empty': { display: 'none' },
  '& > *:first-of-type': { ml: 0 },
  '& .MuiChip-root': { height: 18, fontSize: 11, verticalAlign: 'top' }
} as const

/** The cell: job tags and the name, then what the row still asks for. */
export function GapNameCell({ row, verdict, need, chipContext, held, depth }: GapNameCellProps): JSX.Element {
  // Under its mob's heading a faction or drop row is the faction or item alone.
  const name = depth === 2 && onMobPage(row) ? factionOf(row) : shownName(row)
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, height: 22 }}>
        <Box component="span" sx={{ flex: 'none', display: 'inline-flex', alignItems: 'center' }}>
          {depth > 0 && (
            <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
              •
            </Box>
          )}
          <JobChip job={gapJob(row, chipContext)} why={updateWhy(row, verdict, chipContext)} />
          <ReadyChip need={need} />
        </Box>
        <RowName name={name} />
      </Box>
      <Box sx={REASONS_SX} data-testid="gaps-row-reasons">
        <NeedsHint need={need} />
        <ForcedChip row={row} />
        <EditedChip row={row} />
        {row.suggest !== undefined && <SuggestCaption s={row.suggest} />}
        <PageTitleCaption row={row} />
        {row.maybePlayer === true && <Chip label="may be a player" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} data-testid="gaps-maybe-player" />}
        {held !== undefined && held.length > 0 && <HeldChip held={held} />}
      </Box>
    </Box>
  )
}
