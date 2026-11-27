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
import { Box, Collapse, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import type { PrefSection } from './PreferencesView'
import { type RailGroup, railGroups } from './prefsRailGroups'
import { useBoolPref } from '../combat/useCombatPrefs'
import { useNavMenu } from '../../components/useNavMenu'
import {
  GROUP_HEADING_SX,
  GROUP_HEADING_TEXT_SX,
  NAV_GROUP_INDENT,
  NAV_ICON_SX,
  NAV_ROW_SX,
  NAV_TEXT_SX,
  NAV_WIDTH,
  navVars
} from '../../components/navSx'

// THE SAME SIZES AS THE MAIN NAV (owner, 2026-11-26): its width, and the row, text and icon sizes
// the player sets for the left menu (./navSx.ts reads them as CSS variables on the rail's root).
const RAIL_WIDTH = NAV_WIDTH

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
      data-testid={`prefs-rail-${s.id}`}
      selected={active === s.id}
      aria-disabled={dim}
      onClick={() => onPick(s.id)}
      sx={{ ...NAV_ROW_SX, opacity: dim ? 0.38 : 1 }}
    >
      <ListItemIcon sx={NAV_ICON_SX}>{s.icon}</ListItemIcon>
      <ListItemText primary={s.label} sx={NAV_TEXT_SX} />
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
        sx={GROUP_HEADING_SX}
      >
        <Typography sx={{ color: 'text.secondary', ...GROUP_HEADING_TEXT_SX }}>
          {group.heading}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', color: 'text.secondary' }}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </Box>
      </ListItemButton>
      <Collapse in={open}>
        <List component="div" disablePadding sx={{ pl: NAV_GROUP_INDENT }}>
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
  const menu = useNavMenu()
  return (
    // The rail scrolls WITHIN the split rather than growing the page: a rail that stretches the
    // document makes the whole page scroll — the exact thing the whats-new pane's "the LIST
    // scrolls, never the page" contract forbids. minHeight: 0 lets a flex child shrink.
    <List
      disablePadding
      sx={{ width: RAIL_WIDTH, flexShrink: 0, minHeight: 0, overflowY: 'auto', ...navVars(menu) }}
    >
      {railGroups(sections).map((g) => (
        <RailGroupBlock key={g.id} group={g} {...row} />
      ))}
    </List>
  )
}
