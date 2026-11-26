// aa/AaView.tsx — the Alt. Advancement tab (owner, 2026-11-25; docs/community/requirements/
// alt-advancement.md): the wiki's four AA tables, each row with the rank the character holds.
//
// The table is shared/aaTable.generated.ts; which rank each row shows and why is shared/aaRanks.ts,
// read through useAaRanks. A rank the player picks is kept for this character only.

import { type JSX, useMemo, useState } from 'react'
import { Box, FormControlLabel, Stack, Switch, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { resolvedClasses, type ClassAbbr } from '@shared/classCombo'
import { archetypeRows } from '@shared/aaArchetypeClasses'
import { aaClassGroups, aaGroupRows, aaPointsSpent, aaSectionRows, aaUnplaced, type AaRanked } from '@shared/aaRanks'
import type { AaSection } from '@shared/aaTable.generated'
import { statCapOf } from '@shared/reincarnationCap'
import type { LevelingSnap } from '@shared/types'
import type { View } from '../../appViews'
import { LogReadInline } from '../../components/LogReadInline'
import { useModule } from '../../lib/useModule'
import { Tooltip } from '../../lib/Tooltip'
import { useComboSnap } from '../profiles/ClassComboData'
import { AaClassTable, AaTable, type SetPick } from './AaRows'
import { useAaRanks } from './useAaRanks'

const TABS: readonly { id: AaSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'archetype', label: 'Archetype' },
  { id: 'class', label: 'Class' },
  { id: 'special', label: 'Special' }
]

const CAPTION = 'Ranks come from your log; pick a rank where the log missed one.'
const POINTS_TIP = 'Points the shown ranks cost, at the wiki prices for each rank.'
const UNKNOWN_TIP = 'The wiki gives no price for some ranks, so they add nothing here.'
const ALL_CLASSES_TIP = 'Show the AAs of every class, not only the classes you play.'
const NO_CLASSES = 'Your classes are not known yet, so every class is shown.'
const CAP_TIP = 'Your base stat cap after reincarnations and the Human and Half Elf AAs.'
const UNPLACED_TIP = 'Your log bought these, but no wiki AA row has the same name.'
const MINE_TIP = "Which classes have each Archetype AA, from the game's /alternateadv list, 2026-11-25."
const MAY_APPLY = 'May apply: melee AAs not yet checked for your classes.'
const MAY_APPLY_TIP = 'Your classes were only listed beside Warrior and Monk, so these are unconfirmed.'

function Points({ rows }: { rows: AaRanked[] }): JSX.Element {
  const { points, unknown } = aaPointsSpent(rows)
  return (
    <Tooltip title={unknown > 0 ? UNKNOWN_TIP : POINTS_TIP}>
      <Typography variant="body2" data-testid="aa-points">
        {`Points spent: ${String(points)}${unknown > 0 ? '+' : ''}`}
      </Typography>
    </Tooltip>
  )
}

function StatCapLine({ ranked, reincarnations }: { ranked: AaRanked[]; reincarnations: number[] }): JSX.Element {
  const cap = statCapOf(ranked, reincarnations)
  const kind = cap.over > 0 ? `soft, ${String(cap.reincarnations)} reincarnation${cap.reincarnations === 1 ? '' : 's'}` : 'hard'
  return (
    <Tooltip title={CAP_TIP}>
      <Typography variant="body2" data-testid="aa-stat-cap">{`Base stat cap: ${String(cap.value)} (${kind})`}</Typography>
    </Tooltip>
  )
}

/** The character's classes, when the class combo is known; none before. */
function useMyClasses(): ClassAbbr[] {
  const current = useComboSnap().current
  return useMemo(() => (current === null ? [] : resolvedClasses(current)), [current])
}

/** The Archetype tab: the AAs the character's classes have, or all (game list, 2026-11-25). */
function ArchetypeTab({ ranked, setPick }: { ranked: AaRanked[]; setPick: SetPick }): JSX.Element {
  const mine = useMyClasses()
  const [all, setAll] = useState(false)
  const rows = useMemo(() => aaSectionRows(ranked, 'archetype'), [ranked])
  const shown = useMemo(() => (all || mine.length === 0 ? { mine: rows, mayApply: [] } : archetypeRows(rows, mine)), [rows, mine, all])
  return (
    <>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Points rows={[...shown.mine, ...shown.mayApply]} />
        {mine.length > 0 ? (
          <Tooltip title={MINE_TIP}>
            <ToggleButtonGroup exclusive size="small" value={all ? 'all' : 'mine'} onChange={(_e, v: string | null) => {
              if (v !== null) setAll(v === 'all')
            }} data-testid="aa-archetype-filter">
              <ToggleButton value="mine" sx={{ textTransform: 'none', py: 0.25 }}>My classes</ToggleButton>
              <ToggleButton value="all" sx={{ textTransform: 'none', py: 0.25 }}>All</ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {NO_CLASSES}
          </Typography>
        )}
      </Stack>
      <AaTable rows={shown.mine} setPick={setPick} tail={{ note: MAY_APPLY, tip: MAY_APPLY_TIP, rows: shown.mayApply }} />
    </>
  )
}

function ClassTab({ ranked, setPick }: { ranked: AaRanked[]; setPick: SetPick }): JSX.Element {
  const mine = useMyClasses()
  const [all, setAll] = useState(false)
  const groups = useMemo(() => aaClassGroups(ranked, mine, all || mine.length === 0), [ranked, mine, all])
  return (
    <>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Points rows={aaGroupRows(groups)} />
        {mine.length > 0 ? (
          <Tooltip title={ALL_CLASSES_TIP}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={all}
                  onChange={(_e, on) => {
                    setAll(on)
                  }}
                  data-testid="aa-all-classes"
                />
              }
              label="All classes"
            />
          </Tooltip>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {NO_CLASSES}
          </Typography>
        )}
      </Stack>
      <AaClassTable groups={groups} setPick={setPick} />
    </>
  )
}

function SectionTab(p: { section: AaSection; ranked: AaRanked[]; reincarnations: number[]; setPick: SetPick }): JSX.Element {
  const rows = useMemo(() => aaSectionRows(p.ranked, p.section), [p.ranked, p.section])
  const special = p.section === 'special'
  return (
    <>
      <Box sx={{ mb: 1 }}>
        {special ? <StatCapLine ranked={p.ranked} reincarnations={p.reincarnations} /> : <Points rows={rows} />}
      </Box>
      <AaTable rows={rows} setPick={p.setPick} special={special} />
    </>
  )
}

/** Log names no row answers to, so the player is not left wondering where a purchase went. */
function Unplaced(): JSX.Element | null {
  const snap = useModule<LevelingSnap>('leveling')
  const spends = snap?.aaSpends
  const names = useMemo(() => aaUnplaced(spends ?? []), [spends])
  if (names.length === 0) return null
  return (
    <Tooltip title={UNPLACED_TIP}>
      <Typography variant="caption" color="warning.main" data-testid="aa-unplaced">
        {`Not on the wiki's AA page: ${names.join(', ')}`}
      </Typography>
    </Tooltip>
  )
}

function AaView(): JSX.Element {
  const { character, served, ranked, reincarnations, setPick } = useAaRanks()
  const [tab, setTab] = useState<AaSection>('general')
  const ready = served && character !== null
  return (
    <Box data-testid="aa-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
      <Typography variant="h6">Alt. Advancement</Typography>
      <Typography variant="caption" color="text.secondary">
        {CAPTION}
      </Typography>
      {ready && <Unplaced />}
      <Tabs
        value={tab}
        onChange={(_e, v: AaSection) => {
          setTab(v)
        }}
        sx={{ minHeight: 36, mb: 1 }}
      >
        {TABS.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} sx={{ minHeight: 36 }} data-testid={`aa-tab-${t.id}`} />
        ))}
      </Tabs>
      {!ready && (
        <LogReadInline module="leveling" served={served} sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" data-testid="aa-empty" sx={{ py: 4, textAlign: 'center' }}>
            No character yet. Ranks show once your log names the character you play.
          </Typography>
        </LogReadInline>
      )}
      {ready && (
        <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
          {tab === 'class' ? (
            <ClassTab ranked={ranked} setPick={setPick} />
          ) : tab === 'archetype' ? (
            <ArchetypeTab ranked={ranked} setPick={setPick} />
          ) : (
            <SectionTab section={tab} ranked={ranked} reincarnations={reincarnations} setPick={setPick} />
          )}
        </Box>
      )}
    </Box>
  )
}

/** The Alt. Advancement tab: nothing on any other view. The check lives here, as the Skills tab's does. */
export function AaTab({ view, viewKey }: { view: View; viewKey: string }): JSX.Element | null {
  return view === 'aa' ? <AaView key={viewKey} /> : null
}
