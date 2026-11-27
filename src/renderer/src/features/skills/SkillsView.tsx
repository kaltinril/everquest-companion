// skills/SkillsView.tsx — the Skills tab (fork #6): every skill the log has seen go up, at the
// newest level it stated, with this session's raises and pace.
//
// The rows are the engine's `skills` module, joined across archived logs in main. The order and
// the tradeskill filter are shared/skills.ts. The list is its own scroller.

import { type JSX, useMemo } from 'react'
import {
  Box,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import {
  SKILLS_MODULE,
  SKILL_RATE_TIP,
  skillRateCell,
  skillRows,
  skillsEmptyText,
  type SkillRow,
  type SkillsSnap
} from '@shared/skills'
import { tradeskillOf } from '@shared/tradeskills'
import type { View } from '../../appViews'
import { LogReadInline } from '../../components/LogReadInline'
import { useModule } from '../../lib/useModule'
import { formatDateTime } from '../../lib/formatDate'
import { formatSkillRate } from '../../lib/formatRate'
import { CellLink } from '../../lib/CellLink'
import { Tooltip } from '../../lib/Tooltip'
import { useTradeskillLink } from '../../lib/tradeskillLink'
import { useBoolPref } from '../combat/useCombatPrefs'

const TRADESKILLS_ONLY_KEY = 'eq.skills.tradeskills'

const LEVEL_TIP = 'The newest level your log stated for this skill.'

const OPEN_TRADESKILLS_TIP = 'Recipes, what to make next, materials, routes and your combines are in the Tradeskills section.'

/**
 * The door to the Tradeskills section, beside the title: someone who looks for tradeskills on
 * this tab finds the section from here (owner, 2026-11-20). It opens the section where the
 * player left it. Nothing where no app published the opener.
 */
function OpenTradeskills(): JSX.Element | null {
  const open = useTradeskillLink()
  if (open === null) return null
  return (
    <Tooltip title={OPEN_TRADESKILLS_TIP}>
      <Button
        size="small"
        variant="outlined"
        onClick={() => {
          open()
        }}
        data-testid="skills-open-tradeskills"
      >
        Open Tradeskills
      </Button>
    </Tooltip>
  )
}

/** The pace, a dash with the reason on hover when it is withheld, or nothing with no raise this session. */
function RateCell({ row }: { row: SkillRow }): JSX.Element | null {
  const { rate, why } = skillRateCell(row)
  if (rate !== null) return <>{formatSkillRate(rate)}</>
  if (why === null) return null
  return (
    <Tooltip title={why}>
      <span data-testid="skill-rate-withheld">-</span>
    </Tooltip>
  )
}

/** The skill's name. A tradeskill's is a link to its workbench in the Tradeskills section. */
function SkillName({ skill }: { skill: string }): JSX.Element {
  const open = useTradeskillLink()
  const tradeskill = tradeskillOf(skill)
  if (open === null || tradeskill === undefined) return <>{skill}</>
  return (
    <span data-testid="skill-tradeskill-link">
      <CellLink
        text={skill}
        onOpen={() => {
          open({ tradeskill })
        }}
      />
    </span>
  )
}

function SkillRowLine({ row }: { row: SkillRow }): JSX.Element {
  return (
    <TableRow hover data-testid="skill-row">
      <TableCell>
        <SkillName skill={row.skill} />
      </TableCell>
      <TableCell align="right">{row.value}</TableCell>
      <TableCell align="right">{row.sessionUps > 0 ? `+${String(row.sessionUps)}` : ''}</TableCell>
      <TableCell align="right">
        <RateCell row={row} />
      </TableCell>
      <TableCell align="right" sx={{ opacity: 0.7 }}>
        {formatDateTime(row.lastTs)}
      </TableCell>
    </TableRow>
  )
}

function SkillsTable({ rows }: { rows: SkillRow[] }): JSX.Element {
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
      <Table size="small" stickyHeader data-testid="skills-table">
        <TableHead>
          <TableRow>
            <TableCell>Skill</TableCell>
            <TableCell align="right">
              <Tooltip title={LEVEL_TIP}>
                <span>Level</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">This session</TableCell>
            <TableCell align="right">
              <Tooltip title={SKILL_RATE_TIP}>
                <span>Per hour</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">Last raised</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <SkillRowLine key={r.skill} row={r} />
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

function SkillsView(): JSX.Element {
  const snap = useModule<SkillsSnap>(SKILLS_MODULE)
  const [tradeskillsOnly, setTradeskillsOnly] = useBoolPref(TRADESKILLS_ONLY_KEY, false)
  const rows = useMemo(() => skillRows(snap?.rows ?? [], tradeskillsOnly), [snap, tradeskillsOnly])
  const empty = skillsEmptyText(snap, rows.length)
  return (
    <Box data-testid="skills-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
      <Stack direction="row" sx={{ alignItems: 'center' }} spacing={2}>
        <Typography variant="h6">Skills</Typography>
        <OpenTradeskills />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={tradeskillsOnly}
              onChange={(_e, on) => {
                setTradeskillsOnly(on)
              }}
              data-testid="skills-tradeskills-only"
            />
          }
          label="Tradeskills only"
        />
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>
        Skills appear here once the log shows them going up.
      </Typography>
      {rows.length > 0 && <SkillsTable rows={rows} />}
      {/* With no snapshot the list is empty because nothing was served: the line says what the app waits on. */}
      {rows.length === 0 && (
        <LogReadInline module={SKILLS_MODULE} served={snap !== null} sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" data-testid="skills-empty" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
            {empty}
          </Typography>
        </LogReadInline>
      )}
    </Box>
  )
}

/** The Skills tab: nothing on any other view. The check lives here for App.tsx's SpellDrill reason. */
export function SkillsTab({ view, viewKey }: { view: View; viewKey: string }): JSX.Element | null {
  return view === 'skills' ? <SkillsView key={viewKey} /> : null
}
