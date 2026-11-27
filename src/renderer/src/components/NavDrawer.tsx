import type { JSX } from 'react'
import {
  Box,
  Chip,
  Collapse,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SettingsIcon from '@mui/icons-material/Settings'
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon'
import BarChartIcon from '@mui/icons-material/BarChart'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import StorefrontIcon from '@mui/icons-material/Storefront'
import FindInPageIcon from '@mui/icons-material/FindInPage'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import HandymanIcon from '@mui/icons-material/Handyman'
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium'
import ConstructionIcon from '@mui/icons-material/Construction'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import TimerIcon from '@mui/icons-material/Timer'
import TerminalIcon from '@mui/icons-material/Terminal'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import PetsIcon from '@mui/icons-material/Pets'
import MapIcon from '@mui/icons-material/Map'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import GitHubIcon from '@mui/icons-material/GitHub'
import HandshakeIcon from '@mui/icons-material/Handshake'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import UpdateChip from './UpdateChip'
import AaNavBadge from '../features/aa/AaNavBadge'
import { useNavMenu } from './useNavMenu'
import {
  GROUP_HEADING_SX,
  GROUP_HEADING_TEXT_SX,
  NAV_GROUP_INDENT,
  NAV_ICON_SX,
  NAV_ROW_SX,
  NAV_TEXT_SX,
  NAV_WIDTH,
  navVars
} from './navSx'
import { useBoolPref } from '../features/combat/useCombatPrefs'
import { NEW_ISSUE_URL } from '@shared/issueLink'
import type { PrefsRouting } from '../appRouting'
import {
  GEAR_AREA_VIEWS,
  SPELL_AREA_LABEL,
  SPELL_AREA_VIEWS,
  VIEW_LABELS,
  loadGearTab,
  loadSpellTab,
  type View
} from '../appViews'

export const DRAWER_WIDTH = NAV_WIDTH

/** A row is a view + an icon. The LABEL is not a field: it comes from `VIEW_LABELS`, the one
 *  place a tab is named, because a drill's Back button now says those names too (navOrigin.ts). */
interface NavRow {
  view: View
  icon: JSX.Element
  /** trailing state chip, when a row has one to state */
  badge?: JSX.Element
  /**
   * ONE ROW, SEVERAL VIEWS (JOS-324). A row whose destination is an AREA rather than a single
   * view lists every view drawn inside it here, and reads `selected` while ANY of them is up —
   * so the drawer keeps agreeing with the screen when the in-area tab bar moves you sideways.
   * Absent ⇒ the ordinary rule, and the ordinary rule is still the one nearly every row follows.
   */
  area?: readonly View[]
  /**
   * Which view the row OPENS, when that is not simply `view`. The gear row opens the area at the
   * tab you last stood on (appViews.ts `loadGearTab`) — a function rather than a value because
   * that answer is read from localStorage at CLICK time, not at module load.
   */
  opens?: () => View
  /**
   * What the ROW is called, when that is not what its landing view is called.
   *
   * Absent for every row but one, and the exception earns it: the Spells area's first tab is the
   * Spellbook, so `VIEW_LABELS.spells` reads "Spellbook" — the right word for a tab and the wrong
   * one for a row that also leads to Upgrades and Loadout. The gear row does not need this because
   * its area and its first tab happen to share a word.
   *
   * It is NOT a licence to rename tabs from here: `VIEW_LABELS` is still the one place a VIEW is
   * named, and this names an AREA, which is a different thing that had no home until now.
   */
  label?: string
}

/* State, not process: this tab is newer than the rest, and the chip says exactly how much.
 * "beta" replaced "in dev" for the release-hardening pass (owner directive 2026-08-13): Timers,
 * Buffs and Exaltations graduated with no chip at all, and Gear — the youngest tab — wears the
 * one remaining caveat. Since JOS-324 that row is the whole gear AREA, and the chip stays on it:
 * two of the four tabs behind it are younger than the chip was, and one of them is a placeholder.
 * A chip comes OFF by deleting the badge from its row, never by softening the word. */
const BETA = (
  <Chip
    size="small"
    label="beta"
    variant="outlined"
    sx={{ height: 18, fontSize: 10, color: 'text.secondary', '& .MuiChip-label': { px: 0.75 } }}
  />
)

/** A heading over a run of rows. `id` is the testid suffix (`nav-group-<id>`) and the tail of the
 *  fold's storage key, stable while the heading copy is free to change. */
interface NavGroup {
  id: string
  heading: string
  rows: NavRow[]
}

// Row ORDER is the nav's order. Overview leads, ungrouped: it is the at-a-glance landing surface.
//
// THE REST SIT UNDER THREE HEADINGS (owner ask, 2026-09-12): Stats/Data is what your own log says,
// Research is what the game holds, Config is what the app does for you - in that order, the log
// first (owner, same day: "put stats/data first"). The headings are
// presentational only - no routing, gating or testid changes - and exist because a dozen rows in
// one column read as one undifferentiated list. Where a tab could go either way it follows the
// question it answers: Loot is what YOU got, so it is data; Mobs is what the game HAS, so it is
// research. That separates the two rows an earlier decision (2026-08-04) put side by side; the
// links between them are unchanged, and each is now the first row under its own heading.
//
// AND ONE ROW IS NOT ONE VIEW ANY MORE (JOS-324, owner ruling 2026-08-13). The drawer's old law —
// exactly one row per view, no exceptions — held right up until three of the rows turned out to be
// three faces of a single question: what should I be wearing (Gear), what am I farming for
// (Exaltations) and what am I wearing right now (the dev-only Character sheet). Two of them sat
// consecutively here and the third hung off the bottom behind a flag, and nothing in a vertical
// list said any of them had anything to do with the others. They are now ONE row — Gear — over an
// in-area tab bar (components/AreaTabs.tsx) that also carries the fourth face the list had no
// room to grow, a Wish list. The row reads `selected` while any of the four is on screen, and it
// opens the one you last used. The law that survives is the one that mattered: a row is a
// DESTINATION, and clicking it takes you somewhere real.
const OVERVIEW: NavRow = { view: 'overview', icon: <SpaceDashboardIcon /> }

const GROUPS: NavGroup[] = [
{
    id: 'stats',
    heading: 'Stats/Data',
    rows: [
      { view: 'combat', icon: <BarChartIcon /> },
      { view: 'loot', icon: <ReceiptLongIcon /> },
      // BAZAAR sits under Loot: what you got, then what it is worth to other players.
      { view: 'bazaar', icon: <StorefrontIcon /> },
      // GAPS sits under Loot: what the log named that the app's data does not know.
      { view: 'gaps', icon: <FindInPageIcon /> },
      { view: 'buffs', icon: <AutoFixHighIcon /> },
      { view: 'leveling', icon: <TrendingUpIcon /> },
      // SKILLS sits under Leveling: the other thing your log watches go up.
      { view: 'skills', icon: <HandymanIcon /> },
      // ALT. ADVANCEMENT sits under Skills: the AA ranks the log has seen bought. Its '!' is 45+ unspent points.
      { view: 'aa', icon: <WorkspacePremiumIcon />, badge: <AaNavBadge /> }
    ]
  },
{
    id: 'research',
    heading: 'Research',
    rows: [
      { view: 'mobs', icon: <PetsIcon /> },
      // THE GEAR AREA follows Mobs: what drops it, and then what should I wear, farm for and want.
      // It reads the same committed corpus and links back into the Loot drill-down. The row keeps
      // Gear's icon, Gear's testid (`nav-gear`) and Gear's beta chip; the tabs behind it are named
      // by `VIEW_LABELS`, the one place any of this app's tabs is named.
      {
        view: 'gear',
        icon: <CheckroomIcon />,
        badge: BETA,
        area: GEAR_AREA_VIEWS,
        opens: loadGearTab
      },
      { view: 'maps', icon: <MapIcon /> },
      // TRADESKILLS sits under Maps: the wiki's recipes, and where their materials come from.
      { view: 'tradeskills', icon: <ConstructionIcon /> },
      { view: 'bosses', icon: <EmojiEventsIcon /> },
      // SLAYER sits under Raid Targets: both are lists of things to go and kill.
      { view: 'slayer', icon: <MilitaryTechIcon /> },
      // UNLOCKS sits under it: the same dump, read for what is still closed.
      { view: 'unlocks', icon: <LockOpenIcon /> },
      { view: 'posky', icon: <ShieldMoonIcon /> },
      // THE SPELLS AREA is research too: what exists, what a mote buys and what you ought to have
      // up. Its log-side counterpart, Buffs, is what is on you RIGHT NOW and sits under Stats/Data.
      // The row is named for the AREA rather than for its landing view — see `NavRow.label`.
      {
        view: 'spells',
        icon: <AutoStoriesIcon />,
        badge: BETA,
        label: SPELL_AREA_LABEL,
        area: SPELL_AREA_VIEWS,
        opens: loadSpellTab
      },
      // The Factions tab draws the `/outputfile faction` dump's standings.
      { view: 'factions', icon: <HandshakeIcon /> }
    ]
  },
{
    id: 'config',
    heading: 'Config',
    rows: [
      { view: 'alerts', icon: <NotificationsActiveIcon /> },
      // MACROS sits under Alerts: the other thing you set up here for the game to use.
      { view: 'macros', icon: <TerminalIcon /> },
      // Respawn clocks (JOS-194): a list of things counting down, like Buffs, but it is the tab
      // where you SET them, so it sits with the app's other configuration rather than the data.
      { view: 'timers', icon: <TimerIcon /> }
    ]
  }
]


/** The fold's key. '1'/'0' via `useBoolPref`; absent means OPEN, the state a new user starts in. */
const groupOpenKey = (id: string): string => `eq.nav.open.${id}`

/** Bottom-aligned, outside GROUPS — it is not a feature view and never moves. */
const PREFERENCES: NavRow = { view: 'preferences', icon: <SettingsIcon /> }

/** One nav row. `data-testid="nav-<view>"` is the stable handle the e2e clicks. */
function NavRowButton({
  row,
  view,
  onSelect
}: {
  row: NavRow
  view: View
  onSelect: (v: View) => void
}): JSX.Element {
  return (
    <ListItemButton
      data-testid={`nav-${row.view}`}
      selected={row.area ? row.area.includes(view) : view === row.view}
      onClick={() => onSelect(row.opens ? row.opens() : row.view)}
      sx={NAV_ROW_SX}
    >
      <ListItemIcon sx={NAV_ICON_SX}>{row.icon}</ListItemIcon>
      <ListItemText primary={row.label ?? VIEW_LABELS[row.view]} sx={NAV_TEXT_SX} />
      {row.badge}
    </ListItemButton>
  )
}

/**
 * One heading and the rows it folds. THE FOLD IS THE USER'S (owner ask, 2026-09-12: "maybe I
 * don't care about stats or config so I don't want to see it"): it persists per group across
 * restarts and, through `useBoolPref`, across windows. A collapsed group is never forced open by
 * navigation - a deep link into a hidden row would otherwise undo a choice the user made on
 * purpose - so instead the heading itself reads `selected` while one of its hidden rows is the
 * view on screen, and the drawer still agrees with the screen.
 *
 * `Collapse` keeps the rows mounted, so every `nav-<view>` testid exists whether or not it is
 * visible; the e2e clicks land on a fresh userData where every group is open.
 */
function NavGroupSection({
  group,
  view,
  onSelect
}: {
  group: NavGroup
  view: View
  onSelect: (v: View) => void
}): JSX.Element {
  const [open, setOpen] = useBoolPref(groupOpenKey(group.id), true)
  const holdsView = group.rows.some((r) => (r.area ? r.area.includes(view) : r.view === view))
  return (
    <>
      <ListItemButton
        dense
        data-testid={`nav-group-${group.id}`}
        aria-expanded={open}
        selected={!open && holdsView}
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
        {/* Indented 4px under the heading (owner, 2026-11-26); Overview and Preferences, which
            sit under no heading, are not. */}
        <List component="div" disablePadding sx={{ pl: NAV_GROUP_INDENT }}>
          {group.rows.map((row) => (
            <NavRowButton key={row.view} row={row} view={view} onSelect={onSelect} />
          ))}
        </List>
      </Collapse>
    </>
  )
}

/**
 * The permanent left nav: one row per destination — usually a view, and since JOS-324 once an
 * AREA of four (see `GROUPS`) — with Preferences bottom-aligned and the ambient update chip beneath
 * it.
 *
 * Frameless: the drawer is a normal in-flow child (no fixed OS bar above it), so it fills
 * the space under the title bar — `position: relative` + `height: 100%` keeps it inside
 * the flex row.
 */
export default function NavDrawer({
  view,
  onSelect,
  prefs
}: {
  view: View
  onSelect: (v: View) => void
  /** The Preferences SECTION router (JOS-254), for the patch-notes icon beside the version
   *  number in the chip below. A section is not a view, so it cannot travel through `onSelect`
   *  — and the drawer names its own destination the way `BottomStrips` does in App.tsx rather
   *  than taking one opaque callback per section a future row might want. */
  prefs: PrefsRouting
}): JSX.Element {
  const menu = useNavMenu()
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          position: 'relative',
          height: '100%',
          borderTop: 'none',
          ...navVars(menu)
        }
      }}
    >
      <List>
        <NavRowButton row={OVERVIEW} view={view} onSelect={onSelect} />
        {GROUPS.map((group) => (
          <NavGroupSection key={group.id} group={group} view={view} onSelect={onSelect} />
        ))}
        {/* THE CHARACTER SHEET (JOS-45) USED TO HAVE A ROW HERE, and JOS-324 moved it INTO the gear
            area: it is now the area's last TAB. */}
      </List>

      {/* Bottom-aligned Preferences (Task #55) — replaces the old update-channel block. */}
      <Box sx={{ mt: 'auto' }}>
        <Divider />
        <List disablePadding>
          {/* Reports go to this project's GitHub issues (RULES.md rule 20). A link, not a view, so
              the row has no `selected` state; it opens in the player's browser. */}
          <ListItemButton
            component="a"
            href={NEW_ISSUE_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="nav-feedback"
            sx={NAV_ROW_SX}
          >
            <ListItemIcon sx={NAV_ICON_SX}>
              <GitHubIcon />
            </ListItemIcon>
            <ListItemText primary="Open GitHub issue" sx={NAV_TEXT_SX} />
          </ListItemButton>
          <NavRowButton row={PREFERENCES} view={view} onSelect={onSelect} />
        </List>
        {/* …and directly beneath it, the AMBIENT update affordance (Task #60):
            a gold "Restart to update" chip when a build is downloaded and
            staged, otherwise a muted "checked 2h ago" line. Never a nag —
            ignoring it just means apply-on-quit does the work silently.
            That muted line is also where the app states the version you are
            running, so it carries the patch-notes icon (JOS-254). */}
        <UpdateChip onWhatsNew={() => prefs.openSection('whatsnew')} />
      </Box>
    </Drawer>
  )
}
