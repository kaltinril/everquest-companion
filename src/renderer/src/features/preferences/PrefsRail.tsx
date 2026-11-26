// PrefsRail — the Preferences screen's left rail: its sections under GROUP HEADINGS that fold,
// the way the main nav's STATS/DATA, RESEARCH and CONFIG do (owner, 2026-11-26: "can we maybe
// GROUP any of these preferences into categories", then "make the preferences collapsable
// section categories, similar to the main side bar").
//
// THE FOLD IS THE USER'S, as in the main nav (NavDrawer.tsx NavGroupSection): it persists per
// group across restarts through `useBoolPref`, absent means OPEN, and navigation never forces a
// folded group open. While a folded group holds the section on screen, its heading reads
// `selected`, so the rail still agrees with the pane.

import type { JSX } from 'react'
import { Box, Collapse, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import type { PrefSection } from './PreferencesView'
import { RAIL_GROUP_STARTS } from './prefsRailGroups'
import { useBoolPref } from '../combat/useCombatPrefs'

const RAIL_WIDTH = 168

interface RailGroup {
  /** The heading, or null for sections listed before the first heading. */
  heading: string | null
  /** The fold's key part: the id of the group's first section. */
  id: string
  sections: PrefSection[]
}

/** The sections cut into groups at each id `RAIL_GROUP_STARTS` names. Order is kept. */
export function railGroups(sections: PrefSection[]): RailGroup[] {
  const out: RailGroup[] = []
  for (const s of sections) {
    const heading = RAIL_GROUP_STARTS[s.id]
    const last = out[out.length - 1]
    if (heading !== undefined || !last) out.push({ heading: heading ?? null, id: s.id, sections: [s] })
    else last.sections.push(s)
  }
  return out
}

/** The fold's key. '1'/'0' via `useBoolPref`; absent means OPEN. */
const foldKey = (id: string): string => `eq.prefs.open.${id}`

interface RowProps {
  active: string | null
  unmatched: ReadonlySet<string>
  onPick: (id: string) => void
}

function RailRow({ s, active, unmatched, onPick }: RowProps & { s: PrefSection }): JSX.Element {
  const dim = unmatched.has(s.id)
  return (
    <ListItemButton
      dense
      data-testid={`prefs-rail-${s.id}`}
      selected={active === s.id}
      aria-disabled={dim}
      onClick={() => onPick(s.id)}
      // Indented 4px under its group heading (owner, 2026-11-26).
      sx={{ borderRadius: 1, gap: 1, ml: '4px', opacity: dim ? 0.38 : 1 }}
    >
      <Box sx={{ display: 'flex', color: 'text.secondary' }}>{s.icon}</Box>
      <ListItemText slotProps={{ primary: { variant: 'body2' } }} primary={s.label} />
    </ListItemButton>
  )
}

function RailGroupBlock({ group, ...row }: RowProps & { group: RailGroup }): JSX.Element {
  const [open, setOpen] = useBoolPref(foldKey(group.id), true)
  const rows = group.sections.map((s) => <RailRow key={s.id} s={s} {...row} />)
  if (group.heading === null) return <>{rows}</>
  const holdsActive = group.sections.some((s) => s.id === row.active)
  return (
    <>
      <ListItemButton
        dense
        data-testid={`prefs-rail-group-${group.id}`}
        aria-expanded={open}
        selected={!open && holdsActive}
        onClick={() => setOpen(!open)}
        sx={{ minHeight: 28, mt: 0.5, py: 0, pr: 1, borderRadius: 1 }}
      >
        <Typography
          color="text.secondary"
          sx={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}
        >
          {group.heading}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', color: 'text.secondary' }}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </Box>
      </ListItemButton>
      <Collapse in={open}>
        <List component="div" dense disablePadding>
          {rows}
        </List>
      </Collapse>
    </>
  )
}

/**
 * Left rail: one row per section, ALWAYS all of them (folding is the player's choice, never the
 * query's) — it is the switcher, so it can never shrink out from under the user's pointer.
 * `active` is null while searching (there is no single active section in that mode, so nothing is
 * highlighted), and `unmatched` holds the sections the current query found nothing in — those rows
 * dim to say so. They stay clickable on purpose: a query that matches nothing would otherwise
 * disable every row and strand the user in search mode.
 */
export function SectionRail({
  sections,
  ...row
}: RowProps & { sections: PrefSection[] }): JSX.Element {
  return (
    // The rail scrolls WITHIN the split rather than growing the page: a rail that stretches the
    // document makes the whole page scroll — the exact thing the whats-new pane's "the LIST
    // scrolls, never the page" contract forbids. minHeight: 0 lets a flex child shrink.
    <List dense disablePadding sx={{ width: RAIL_WIDTH, flexShrink: 0, minHeight: 0, overflowY: 'auto' }}>
      {railGroups(sections).map((g) => (
        <RailGroupBlock key={g.id} group={g} {...row} />
      ))}
    </List>
  )
}
