// achievements/AchievementList.tsx — THE ACHIEVEMENTS of whatever the rail has picked, under the
// game's own group headings, with the window's two Show switches and a search over names and
// requirement lines.
//
// ITS OWN SCROLLER (AGENTS.md UI conventions). The whole file is under five hundred rows and a
// row draws its lines only when opened, so the list is not windowed.

import { type JSX } from 'react'
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import AchievementRow from './AchievementRow'
import type { BookSection, SortOrder } from '@shared/achievements/bookRows'
import type { ListBundle, RowContext } from './useAchievementsController'

function Show({
  label,
  checked,
  onChange,
  testId
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  testId: string
}): JSX.Element {
  return (
    <FormControlLabel
      sx={{ mr: 0 }}
      control={
        <Checkbox
          size="small"
          checked={checked}
          data-testid={testId}
          onChange={(e) => {
            onChange(e.target.checked)
          }}
          sx={{ p: 0.5 }}
        />
      }
      label={<Typography variant="caption">{label}</Typography>}
    />
  )
}

function Controls(props: ListBundle): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ pb: 0.5 }}>
      <TextField
        size="small"
        placeholder="Search achievements and what they require"
        value={props.query}
        onChange={(e) => {
          props.onQuery(e.target.value)
        }}
        sx={{ flex: '1 1 220px' }}
        slotProps={{ htmlInput: { 'data-testid': 'achievements-search' } }}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Show
        </Typography>
        <Show label="Open" checked={props.open} onChange={props.onOpen} testId="achievements-show-open" />
        <Show
          label="Complete"
          checked={props.complete}
          onChange={props.onComplete}
          testId="achievements-show-complete"
        />
        <Tooltip
          title={
            props.zoneName === null
              ? 'The log has not named a zone yet. Zone once and this fills in.'
              : `Only what can be worked on in ${props.zoneName}: kill counters with a mob here, named mobs here, and this zone's Hunter, Conqueror and Traveler.`
          }
        >
          <span>
            <Show
              label={props.zoneName === null ? "Zone I'm in" : `Zone I'm in (${props.zoneName})`}
              checked={props.zoneOnly}
              onChange={props.onZoneOnly}
              testId="achievements-zone-here"
            />
          </span>
        </Tooltip>
      </Stack>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={props.sort}
        onChange={(_e, next: SortOrder | null) => {
          if (next !== null) props.onSort(next)
        }}
      >
        <ToggleButton value="game" sx={{ py: 0.25 }}>
          Game order
        </ToggleButton>
        <ToggleButton value="closest" data-testid="achievements-sort-closest" sx={{ py: 0.25 }}>
          Closest first
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}

/** What a file of open achievements cannot say, and how to get one that can. */
function OpenOnlyNote(): JSX.Element {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      data-testid="achievements-open-only"
      sx={{ display: 'block', pb: 0.5 }}
    >
      This file lists open achievements only. To list the finished ones too, tick Complete in the
      game&apos;s Achievements window and press Output To File.
    </Typography>
  )
}

function Section({ section, ctx }: { section: BookSection; ctx: RowContext }): JSX.Element {
  const { group, achievements } = section
  return (
    <Box data-testid="achievements-section">
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{
          display: 'block',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.default',
          lineHeight: 2,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        {group.category}
      </Typography>
      {achievements.map((achievement) => (
        <AchievementRow key={achievement.name} group={group} achievement={achievement} ctx={ctx} />
      ))}
    </Box>
  )
}

export default function AchievementList(props: ListBundle): JSX.Element {
  const { sections, shown, ctx } = props
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Typography variant="subtitle2" data-testid="achievements-title" sx={{ pb: 0.5 }}>
        Achievements - {shown.toLocaleString('en-US')} shown
      </Typography>
      <Controls {...props} />
      {!props.hasComplete && <OpenOnlyNote />}
      <Box data-testid="achievements-list" sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        {sections.map((section) => (
          <Section key={section.group.category} section={section} ctx={ctx} />
        ))}
        {sections.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No achievement matches that.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
