// DEATH RECAP - the Incoming card's third tab, offered only when the segment holds one of your
// deaths: who hit you and with what in the seconds before, the killing blow, and the heals you got.
// The grouping is shared/deathRecap.ts; the window is the engine's (`deathrecap.rs`).

import { Box, Stack, Typography } from '@mui/material'
import { Bar, KIND_COLOR } from './combatShared'
import { formatNum as fmt } from '../../lib/formatRate'
import { formatTime } from '../../lib/formatDate'
import { summarizeDeaths, type DeathRecapSummary } from '@shared/deathRecap'
import type { DeathRecap } from '@shared/combat'

const HEAL_COLOR = '#7fd1a0'

const CAPTION_SX = { fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }

function Heading({ left, right }: { left: string; right: string }): React.JSX.Element {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mt: 1, mb: 0.5 }}>
      <Typography variant="caption" noWrap sx={CAPTION_SX}>
        {left}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {right}
      </Typography>
    </Stack>
  )
}

function OneDeath({ d }: { d: DeathRecapSummary }): React.JSX.Element {
  const top = d.sources[0]?.total ?? 0
  const kb = d.killingBlow
  return (
    <Box data-testid="death-recap" sx={{ mb: 1.5 }}>
      <Heading left={`Killed by ${d.killer ?? 'unknown'}`} right={formatTime(d.ts)} />
      {kb && (
        <Typography variant="caption" sx={{ display: 'block', color: KIND_COLOR.enemy }}>
          Killing blow: {kb.ability} {fmt(kb.amount)} from {kb.source}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Last {d.windowSec}s: {fmt(d.taken)} taken · {fmt(d.healed)} healed
      </Typography>
      {d.sources.map((s) => (
        <Box key={s.source} data-testid="death-recap-source">
          <Bar color={KIND_COLOR.enemy} pct={top > 0 ? (s.total / top) * 100 : 0} name={s.source} right={fmt(s.total)} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 1, mt: '-2px', mb: '3px' }}>
            {s.abilities.map((a) => `${a.ability} ${fmt(a.total)} (${a.hits})`).join(' · ')}
          </Typography>
        </Box>
      ))}
      {d.heals.length > 0 && <Heading left="Heals" right={fmt(d.healed)} />}
      {d.heals.map((h) => (
        <Bar
          key={`${h.source}|${h.spell ?? ''}`}
          color={HEAL_COLOR}
          pct={d.healed > 0 ? (h.total / d.healed) * 100 : 0}
          name={h.spell ? `${h.source} · ${h.spell}` : h.source}
          right={`${fmt(h.total)} (${h.count})`}
        />
      ))}
    </Box>
  )
}

export function DeathRecapPanel({ deaths }: { deaths: readonly DeathRecap[] | undefined }): React.JSX.Element {
  return (
    <Box data-testid="death-recap-panel">
      {summarizeDeaths(deaths).map((d) => (
        <OneDeath key={d.ts} d={d} />
      ))}
    </Box>
  )
}
