// aa/AaView.tsx — the Alt. Advancement tab (owner, 2026-11-25; docs/community/requirements/
// alt-advancement.md), redesigned from mockup v4: the `/alt list` line first (owner, 2026-11-25: "the
// /alt list should be first above everything in the AA tab"), one header line, the class combo, the
// cards, then Summary / General / Archetype / Class / Special with a search across them.
//
// The table is shared/aaOfficial.ts `AA_ROWS`; ranks are shared/aaRanks.ts through useAaRanks (log,
// grants, the player's picks); the combo's view of them is shared/aaBoard.ts through useAaBoard.

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Box, Chip, IconButton, InputAdornment, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { AA_WIKI_ORDER, aaCantTell, aaJumpView, aaLeft, aaPlanDelta, aaSearchCount, aaSearchGroups, aaTabCount, aaTabGroups, type AaBoardRow, type AaScope, type AaSort } from '@shared/aaBoard'
import { aaCostSumText } from '@shared/aaCost'
import { aaRecommend, type AaRecs } from '@shared/aaRecommend'
import { aaUnplaced } from '@shared/aaRanks'
import type { AaSection } from '@shared/aaTable.generated'
import { CLASS_ABBRS, type ClassAbbr } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import type { LevelingSnap } from '@shared/types'
import type { View } from '../../appViews'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import OutputFileLine from '../../components/OutputFileLine'
import { LogReadInline } from '../../components/LogReadInline'
import type { TradeskillFocus } from '../../lib/tradeskillLink'
import { useModule } from '../../lib/useModule'
import { Tooltip } from '../../lib/Tooltip'
import { CantTellCard, PaceCard, PointsCard, SpendCard } from './AaCards'
import { AaList } from './AaList'
import { AaSpecial } from './AaSpecial'
import { AaSummary } from './AaSummary'
import { AaNavContext, aaRowId, type AaNav } from './aaNav'
import { useAaBoard, type AaBoardState } from './useAaBoard'
import { useSortPref } from '../../lib/useTableSort'
import { sanitizeColumnSort, TABLE_SORT_KEYS } from '@shared/tableSort'

/** The stored AA sort read back; anything else is the wiki's order. */
function sanitizeAaSort(raw: unknown): AaSort {
  return sanitizeColumnSort<AaSort['key']>(raw, ['wiki', 'name', 'level'], AA_WIKI_ORDER)
}

type AaTabId = 'summary' | AaSection

const SECTIONS: readonly { id: AaSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'archetype', label: 'Archetype' },
  { id: 'class', label: 'Class' },
  { id: 'special', label: 'Special' }
]

const ALT_LIST_STEPS = [
  'Type /alt list in game (the long form is /alternateadv list).',
  'Run it again after a class swap or a purchase: right after a purchase it can lag until you zone or swap loadouts.'
] as const

/** The command that feeds this tab its ranks, and when it last ran: the first thing on the tab. */
function AltListLine({ listTs }: { listTs: number | null }): JSX.Element {
  return (
    <OutputFileLine
      command="/alt list"
      why="reads every AA rank your class combo has"
      updatedAt={listTs === null ? undefined : new Date(listTs).toISOString()}
      steps={ALT_LIST_STEPS}
      testId="aa-alt-list"
    />
  )
}

const UNPLACED_TIP = 'Your log bought these, but no wiki AA row has the same name.'

/** Log names no row answers to, so the player is not left wondering where a purchase went. */
function Unplaced(): JSX.Element | null {
  const snap = useModule<LevelingSnap>('leveling')
  const spends = snap?.aaSpends
  const names = useMemo(() => aaUnplaced(spends ?? []), [spends])
  if (names.length === 0) return null
  return (
    <Tooltip title={UNPLACED_TIP}>
      <Typography variant="caption" sx={{ color: 'warning.main' }} data-testid="aa-unplaced">
        {`Not on the wiki's AA page: ${names.join(', ')}`}
      </Typography>
    </Tooltip>
  )
}

/** "Drywrought · WAR/SHM/MNK · 50 · everything your classes can buy is maxed · 20 points banked". */
function headerLine(s: AaBoardState): string {
  const who = [s.character ?? '', s.detected.join('/'), s.level === null ? '' : String(s.level)].filter((w) => w !== '').join(' · ')
  const left = aaLeft(s.ownBoard)
  const banked = s.unspent === null ? '' : ` · ${String(s.unspent)} points banked`
  const unsure = aaCantTell(s.ownBoard).length
  const cantTell = unsure === 0 ? '' : ` · ${String(unsure)} the log can't tell`
  if (left.count === 0) return `${who} · everything your classes can buy is maxed${cantTell}${banked}`
  const unspent = s.unspent === null ? '' : ` · ${String(s.unspent)} unspent`
  return `${who} · ${String(left.count)} AA${left.count === 1 ? '' : 's'} left to buy, ${String(left.points)}${left.unknown ? '+' : ''} pts${cantTell}${unspent}`
}

/** The header: the page's name and one line about the character. The unspent warning (aa-points-warn) sits beside it. */
function AaHeader({ s }: { s: AaBoardState }): JSX.Element {
  return (
    <Stack spacing={0.25} sx={{ mb: 1 }} data-testid="aa-header">
      <Typography variant="h6">Alternate Advancement</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="aa-header-line">
        {headerLine(s)}
      </Typography>
      <Unplaced />
    </Stack>
  )
}

function planningLine(s: AaBoardState): string {
  // Only what the combo adds: no "drop out" count (owner, 2026-11-25: no negatives on this tab).
  const d = aaPlanDelta(s.board, s.ownBoard)
  return `Planning ${s.classes.join('/')}: ${String(d.points)}${d.unknown ? '+' : ''} points to max what this combo adds (${String(d.adds)} AAs).`
}

const LEVEL_FILTER_TIP = 'Only AAs whose rank 1 asks for this level or lower, by the wiki. The wiki can be wrong: when the game says otherwise, fix the wiki.'

/** "Up to level [ ]": a level, or empty for no filter. */
function LevelBox({ maxLevel, setMaxLevel }: { maxLevel: number | null; setMaxLevel: (n: number | null) => void }): JSX.Element {
  return (
    <Tooltip title={LEVEL_FILTER_TIP}>
      <TextField
        size="small"
        label="Up to level"
        value={maxLevel === null ? '' : String(maxLevel)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 3)
          setMaxLevel(digits === '' ? null : Math.max(1, Number(digits)))
        }}
        sx={{ width: 120 }}
        slotProps={{
          input: {
            endAdornment:
              maxLevel === null ? undefined : (
                <IconButton size="small" onClick={() => setMaxLevel(null)} aria-label="Clear the level filter">
                  <CloseIcon fontSize="small" />
                </IconButton>
              ),
            inputProps: { inputMode: 'numeric', 'data-testid': 'aa-level-filter' }
          }
        }}
      />
    </Tooltip>
  )
}

function ClassBar({ s, scope, setScope, maxLevel, setMaxLevel }: { s: AaBoardState; scope: AaScope; setScope: (v: AaScope) => void; maxLevel: number | null; setMaxLevel: (n: number | null) => void }): JSX.Element {
  const { pick } = s
  return (
    <Stack spacing={0.5} sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <ChipMultiSelect<ClassAbbr> options={CLASS_ABBRS} value={pick.classes} onChange={pick.set} label="Classes" placeholder="your classes" max={3} optionLabel={classDisplayName} minWidth={260} testId="aa-classes" />
        {pick.offer !== null && (
          <Chip size="small" color="success" variant="outlined" label={`back to detected · ${pick.offer.join('/')}`} onClick={pick.adopt} data-testid="aa-class-offer" />
        )}
        <ToggleButtonGroup exclusive size="small" value={scope} onChange={(_e, v: AaScope | null) => v !== null && setScope(v)} data-testid="aa-scope">
          <ToggleButton value="usable" sx={{ textTransform: 'none', py: 0.25 }}>
            Usable by these classes
          </ToggleButton>
          <ToggleButton value="all" sx={{ textTransform: 'none', py: 0.25 }}>
            All AAs
          </ToggleButton>
        </ToggleButtonGroup>
        <LevelBox maxLevel={maxLevel} setMaxLevel={setMaxLevel} />
      </Stack>
      {s.planning && (
        <Typography variant="caption" sx={{ color: 'warning.main' }} data-testid="aa-planning">
          {planningLine(s)}
        </Typography>
      )}
      {s.classes.length === 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Your classes are not known yet: pick them to see your Archetype and Class AAs.
        </Typography>
      )}
    </Stack>
  )
}

function SearchBox({ query, setQuery }: { query: string; setQuery: (q: string) => void }): JSX.Element {
  return (
    <TextField
      size="small"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search every tab"
      sx={{ ml: 'auto', width: 240 }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment:
            query === '' ? undefined : (
              <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear the search">
                <CloseIcon fontSize="small" />
              </IconButton>
            ),
          inputProps: { 'data-testid': 'aa-search' }
        }
      }}
    />
  )
}

function TabRow({ s, tab, setTab, scope, query, setQuery, maxLevel }: { s: AaBoardState; tab: AaTabId; setTab: (t: AaTabId) => void; scope: AaScope; query: string; setQuery: (q: string) => void; maxLevel: number | null }): JSX.Element {
  const searching = query.trim() !== ''
  const label = (id: AaSection, name: string): string => {
    const c = aaTabCount(s.board, id, { scope, query, maxLevel })
    if (c.matches !== null) return `${name} ${String(c.matches)}`
    return id === 'special' ? name : `${name} ${String(c.maxed)}/${String(c.of)}`
  }
  const total = searching ? aaSearchCount(s.board, scope, query, maxLevel) : null
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', mb: 1 }}>
      <Tabs value={tab} onChange={(_e, v: AaTabId) => setTab(v)} sx={{ minHeight: 36 }} variant="scrollable" scrollButtons={false}>
        <Tab value="summary" label={total === null ? 'Summary' : `Summary ${String(total)}`} sx={{ minHeight: 36 }} data-testid="aa-tab-summary" />
        {SECTIONS.map((t) => (
          <Tab key={t.id} value={t.id} label={label(t.id, t.label)} sx={{ minHeight: 36 }} data-testid={`aa-tab-${t.id}`} />
        ))}
      </Tabs>
      <SearchBox query={query} setQuery={setQuery} />
    </Stack>
  )
}

/** One sub-tab's count line and list. */
function SectionTab({ s, section, scope, query, maxLevel, sort, setSort }: { s: AaBoardState; section: AaSection; scope: AaScope; query: string; maxLevel: number | null; sort: AaSort; setSort: (v: AaSort) => void }): JSX.Element {
  const groups = useMemo(() => aaTabGroups(s.board, section, s.classes, { scope, query, maxLevel }), [s.board, section, s.classes, scope, query, maxLevel])
  const c = aaTabCount(s.board, section, { scope, query, maxLevel })
  const filtered = maxLevel !== null
  const name = SECTIONS.find((x) => x.id === section)?.label ?? ''
  return (
    <>
      {section !== 'special' && (
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary', px: 1, mb: 0.5 }} data-testid="aa-tab-line">
          {`${name} ${String(c.maxed)}/${String(c.of)} · ${aaCostSumText(c.points)}${filtered ? ` · up to level ${String(maxLevel)}, by the wiki` : ''}`}
        </Typography>
      )}
      <AaList groups={groups} classes={s.classes} setPick={s.setPick} sort={sort} setSort={setSort} empty={query.trim() === '' && !filtered ? 'Nothing here for these classes.' : 'Nothing matches.'} />
    </>
  )
}

function Body({ s, recs, tab, setTab, scope, query, maxLevel, sort, setSort }: { s: AaBoardState; recs: AaRecs; tab: AaTabId; setTab: (t: AaTabId) => void; scope: AaScope; query: string; maxLevel: number | null; sort: AaSort; setSort: (v: AaSort) => void }): JSX.Element {
  // Special rows come from reincarnating and achievements, not a level: the level filter leaves them be.
  if (tab === 'special') return <AaSpecial board={s.board} ranked={s.ranked} reincarnations={s.reincarnations} classes={s.classes} setPick={s.setPick} query={query} />
  if (tab !== 'summary') return <SectionTab s={s} section={tab} scope={scope} query={query} maxLevel={maxLevel} sort={sort} setSort={setSort} />
  if (query.trim() !== '') {
    return <AaList groups={aaSearchGroups(s.board, scope, query, maxLevel)} classes={s.classes} setPick={s.setPick} showClass sort={sort} setSort={setSort} empty="Nothing matches." />
  }
  return <AaSummary board={s.board} planning={s.planning} recs={recs} unspent={s.unspent} classes={s.classes} onSpecial={() => setTab('special')} />
}

export interface AaLinksProps {
  onGo: (v: View) => void
  onOpenTradeskill: (f: TradeskillFocus) => void
}

function AaView({ onGo, onOpenTradeskill }: AaLinksProps): JSX.Element {
  const s = useAaBoard()
  const [tab, setTab] = useState<AaTabId>('summary')
  const [scope, setScope] = useState<AaScope>('usable')
  const [query, setQuery] = useState('')
  const [maxLevel, setMaxLevel] = useState<number | null>(null)
  // Remembered across tab switches and restarts (the shared table-sort store).
  const [sort, setSort] = useSortPref<AaSort>(TABLE_SORT_KEYS.aa, sanitizeAaSort)
  const [open, setOpen] = useState<string | null>(null)
  const toggle = useCallback((id: string) => setOpen((o) => (o === id ? null : id)), [])
  const jump = useCallback(
    (b: AaBoardRow) => {
      // A row the level filter or the scope hides would open nothing: widen just enough to show it.
      const v = aaJumpView(s.board, b, s.classes, { scope, maxLevel })
      setScope(v.scope)
      setMaxLevel(v.maxLevel)
      setQuery('')
      setTab(b.r.row.section)
      setOpen(aaRowId(b))
    },
    [s.board, s.classes, scope, maxLevel]
  )
  const nav = useMemo<AaNav>(() => ({ go: onGo, openTradeskill: onOpenTradeskill, open, toggle, jump }), [onGo, onOpenTradeskill, open, toggle, jump])
  const recs = useMemo(() => aaRecommend(s.board, s.unspent ?? 0), [s.board, s.unspent])
  const ready = s.served && s.character !== null
  return (
    <AaNavContext.Provider value={nav}>
      <Box data-testid="aa-view" sx={{ height: '100%', overflow: 'auto', overscrollBehavior: 'contain', p: 2, minHeight: 0 }}>
        <AltListLine listTs={s.listTs} />
        {!ready && (
          <LogReadInline module="leveling" served={s.served} sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" data-testid="aa-empty" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
              No character yet. Ranks show once your log names the character you play.
            </Typography>
          </LogReadInline>
        )}
        {ready && (
          <>
            <AaHeader s={s} />
            <ClassBar s={s} scope={scope} setScope={setScope} maxLevel={maxLevel} setMaxLevel={setMaxLevel} />
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', mb: 1.5 }} useFlexGap>
              <PointsCard unspent={s.unspent} ownBoard={s.ownBoard} planning={s.planning} />
              <PaceCard />
              <SpendCard recs={recs} unspent={s.unspent} />
              <CantTellCard board={s.ownBoard} setPick={s.setPick} />
            </Stack>
            <TabRow s={s} tab={tab} setTab={setTab} scope={scope} query={query} setQuery={setQuery} maxLevel={maxLevel} />
            <Body s={s} recs={recs} tab={tab} setTab={setTab} scope={scope} query={query} maxLevel={maxLevel} sort={sort} setSort={setSort} />
          </>
        )}
      </Box>
    </AaNavContext.Provider>
  )
}

/** The Alt. Advancement tab: nothing on any other view. The check lives here, as the Skills tab's does. */
export function AaTab({ view, viewKey, ...links }: { view: View; viewKey: string } & AaLinksProps): JSX.Element | null {
  return view === 'aa' ? <AaView key={viewKey} {...links} /> : null
}
