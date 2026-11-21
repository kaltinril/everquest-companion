// useMasteryRank - the Crafting Mastery rank the log shows bought, for the level bars' cap note
// (shared/tradeskillLevelBar.levelBar). 0 until the leveling module is served or when it shows none.

import { craftingMasteryRank } from '@shared/tradeskillAa'
import { useAaFacts } from './AaPanel'

export function useMasteryRank(): number {
  return craftingMasteryRank(useAaFacts().spends)
}
