// unlocks/UnlockChips.tsx — "ON THE WAY TO": the unlocks a thing serves, as chips that open the
// Unlocks tab on that unlock. Drawn wherever the graph (shared/unlocks/unlockGraph.ts) answers:
// a faction row, an item's knowledge section, a mob page.
//
// One chip per unlock, whatever the number of lines the thing satisfies; the hover names the
// game's own line. Inert text where the app publishes no opener (lib/unlockLink.tsx).

import { type JSX } from 'react'
import { Chip, Stack, Tooltip, Typography } from '@mui/material'
import type { UnlockPath, UnlockRef } from '@shared/unlocks/unlockGraph'
import { useUnlockLink } from '../../lib/unlockLink'

const CHIP_SX = { height: 20, fontSize: 11, '& .MuiChip-label': { px: 0.75 } }

const KIND_WORD = { race: 'race', class: 'class', deity: 'deity' } as const

/** One chip per unlock, the lines it satisfies folded into the hover. */
function distinct(paths: readonly UnlockPath[]): { ref: UnlockRef; lines: string[] }[] {
  const out = new Map<string, { ref: UnlockRef; lines: string[] }>()
  for (const p of paths) {
    const key = `${p.unlock.kind}:${p.unlock.name}`
    const entry = out.get(key) ?? { ref: p.unlock, lines: [] }
    entry.lines.push(p.need.text)
    out.set(key, entry)
  }
  return [...out.values()]
}

export default function UnlockChips({
  paths,
  lead = 'On the way to',
  testId = 'unlock-chip'
}: {
  paths: readonly UnlockPath[]
  /** the words before the chips; empty for none */
  lead?: string
  testId?: string
}): JSX.Element | null {
  const open = useUnlockLink()
  if (paths.length === 0) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
      {lead !== '' && (
        <Typography variant="caption" color="text.secondary">
          {lead}
        </Typography>
      )}
      {distinct(paths).map(({ ref, lines }) => (
        <Tooltip key={`${ref.kind}:${ref.name}`} title={lines.join(' ')}>
          <Chip
            size="small"
            variant="outlined"
            color="info"
            label={`${ref.name} (${KIND_WORD[ref.kind]})`}
            data-testid={testId}
            onClick={
              open === null
                ? undefined
                : () => {
                    open(ref)
                  }
            }
            sx={CHIP_SX}
          />
        </Tooltip>
      ))}
    </Stack>
  )
}
