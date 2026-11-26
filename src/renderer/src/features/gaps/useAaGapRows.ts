// useAaGapRows — Wiki Gaps' AAs rows (owner, 2026-11-25; shared/gapAas.ts): the attached character's
// AA purchase lines from the `leveling` snapshot against the wiki's AA page, plus the corrections of
// shared/aaOfficial.ts, which stand without any log. No engine module and no wiki request.

import { useMemo } from 'react'
import { aaGapRows } from '@shared/gapAas'
import type { AASpendEvent, LevelingSnap } from '@shared/types'
import type { GapRow } from '@shared/gaps'
import { useModule } from '../../lib/useModule'

const NO_SPENDS: readonly AASpendEvent[] = []

export function useAaGapRows(): readonly GapRow[] {
  const spends = useModule<LevelingSnap>('leveling')?.aaSpends ?? NO_SPENDS
  return useMemo(() => aaGapRows(spends), [spends])
}
