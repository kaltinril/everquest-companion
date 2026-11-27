// tradeskills/AaPanel.tsx — "AAs for this tradeskill" on a workbench (owner, 2026-11-20: "I think
// there are AA's that pertain to crafting, we should somehow show stuff related to that").
//
// One line under the workbench's head: each AA that bears on the open tradeskill (its own mastery,
// then the ones for every tradeskill) with the rank the log shows bought. "Show what they do"
// opens the rest in place: what the AA does in the wiki's own words, its ranks and cost, the
// wiki's figure for the bought rank, and beside Crafting Mastery the wiki's 200 rule with the
// tradeskills the log puts past 200. Closed by default, so the workbench keeps its height; the
// choice is remembered across restarts (the section's rule for a choice).
//
// Self-contained: it reads the `leveling` module's AA purchases and the `skills` module's levels
// itself. Which AAs, every figure and every word are shared/tradeskillAa.ts. With no AA for the
// tradeskill the panel draws nothing.

import { type JSX, useMemo } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import {
  AA_HIDE_TEXT,
  AA_NO_PURCHASE_TIP,
  AA_PANEL_HEADING,
  AA_RULE_LABEL,
  AA_SHOW_TEXT,
  AA_SOURCE_TEXT,
  AA_WIKI_LABEL,
  AA_WIKI_URL,
  tradeskillAaLines,
  type AaCapLines,
  type AaFacts,
  type AaLine
} from '@shared/tradeskillAa'
import type { Tradeskill } from '@shared/tradeskills'
import type { LevelingSnap } from '@shared/types'
import { WIKI_LINK_TIP } from '@shared/tradeskillWiki'
import { CellLink } from '../../lib/CellLink'
import { Tooltip } from '../../lib/Tooltip'
import { useModule } from '../../lib/useModule'
import { useBoolPref } from '../combat/useCombatPrefs'
import { useSkillLevels } from './tradeskillData'

const LEVELING_MODULE = 'leveling'
const OPEN_KEY = 'eq.tradeskills.aaOpen'

/** What the log has said of AA purchases and skill levels; a side is null until its module is served. */
export function useAaFacts(): AaFacts {
  const leveling = useModule<LevelingSnap>(LEVELING_MODULE)
  const levels = useSkillLevels()
  return useMemo(() => ({ spends: leveling?.aaSpends ?? null, skills: levels.served ? levels.rows : null }), [leveling, levels])
}

/** What the log shows bought. "No purchase" carries why that is not "you lack it". */
function BoughtWords({ line, text }: { line: AaLine; text: string }): JSX.Element | null {
  if (text === '') return null
  const words = (
    <Typography variant="caption" color={line.bought ? 'success.main' : 'text.secondary'} noWrap data-testid="tradeskill-aa-bought">
      {text}
    </Typography>
  )
  return line.bought ? words : <Tooltip title={AA_NO_PURCHASE_TIP}>{words}</Tooltip>
}

/** One AA on the closed line: its name (the wiki's words on hover) and the rank the log shows. */
function AaEntry({ line }: { line: AaLine }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', minWidth: 0 }} data-testid="tradeskill-aa-item">
      <Tooltip title={line.aa.text}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap data-testid="tradeskill-aa-name">
          {line.aa.name}
        </Typography>
      </Tooltip>
      <BoughtWords line={line} text={line.boughtShort} />
    </Stack>
  )
}

/** Beside Crafting Mastery: the wiki's rule, the tradeskills the log puts past 200, the wiki's list. */
function CapLines({ cap }: { cap: AaCapLines }): JSX.Element {
  return (
    <Box data-testid="tradeskill-aa-cap">
      {cap.rules.map((rule) => (
        <Typography key={rule} variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-aa-rule">
          {AA_RULE_LABEL} {rule}
        </Typography>
      ))}
      {cap.past !== '' && (
        <Typography variant="caption" sx={{ display: 'block' }} data-testid="tradeskill-aa-past">
          {cap.past}
        </Typography>
      )}
      {cap.named !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-aa-named">
          {cap.named}
        </Typography>
      )}
    </Box>
  )
}

/** One AA in full: name, ranks and cost, the wiki's words, what the log shows bought. */
export function AaDetail({ line }: { line: AaLine }): JSX.Element {
  return (
    <Box sx={{ minWidth: 0 }} data-testid="tradeskill-aa-detail">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {line.aa.name}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-aa-cost">
          {line.costText}
        </Typography>
        <BoughtWords line={line} text={line.boughtText} />
        {line.atRankText !== '' && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-aa-at-rank">
            {line.atRankText}
          </Typography>
        )}
      </Stack>
      {/* The wiki's own words, set off as a quote. */}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', borderLeft: 2, borderColor: 'divider', pl: 1, my: 0.25 }} data-testid="tradeskill-aa-text">
        {line.aa.text}
      </Typography>
      {line.cap !== null && <CapLines cap={line.cap} />}
    </Box>
  )
}

/** Where the descriptions come from, with the app's standard wiki link to the page. */
function SourceLine(): JSX.Element {
  return (
    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }} data-testid="tradeskill-aa-source">
      {AA_SOURCE_TEXT}{' '}
      {AA_WIKI_URL !== undefined && (
        <a href={AA_WIKI_URL} target="_blank" rel="noreferrer" title={WIKI_LINK_TIP} style={{ color: 'inherit' }} data-testid="tradeskill-aa-wiki-link">
          {AA_WIKI_LABEL}
        </a>
      )}
    </Typography>
  )
}

export function AaPanel({ tradeskill }: { tradeskill: Tradeskill }): JSX.Element | null {
  const facts = useAaFacts()
  const [open, setOpen] = useBoolPref(OPEN_KEY, false)
  const lines = useMemo(() => tradeskillAaLines(tradeskill, facts), [tradeskill, facts])
  if (lines.length === 0) return null
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.75, flexShrink: 0 }} data-testid="tradeskill-aa">
      <Stack direction="row" sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.5 }}>
        <Typography variant="subtitle2">{AA_PANEL_HEADING}</Typography>
        {lines.map((line) => (
          <AaEntry key={line.aa.name} line={line} />
        ))}
        <Box component="span" sx={{ typography: 'caption' }} data-testid="tradeskill-aa-toggle">
          <CellLink
            text={open ? AA_HIDE_TEXT : AA_SHOW_TEXT}
            onOpen={() => {
              setOpen(!open)
            }}
          />
        </Box>
      </Stack>
      {open && (
        <Stack spacing={0.75} sx={{ mt: 0.75, maxHeight: 220, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="tradeskill-aa-details">
          {lines.map((line) => (
            <AaDetail key={line.aa.name} line={line} />
          ))}
          <SourceLine />
        </Stack>
      )}
    </Paper>
  )
}
