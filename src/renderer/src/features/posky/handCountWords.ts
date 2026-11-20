// handCountWords.ts - what the "By hand" chip's hover says (ItemOverrides.tsx draws it).
//
// Pure and import-free so the node suite can pin the words: the sentence used to end "go back to
// counting from the log and the export", which is true under one of the five "Count items from"
// settings. Under Export only the log is not counted, and under Log only the export is not. The
// hover now names the setting instead of the witnesses, so it is true under every one.

/** The name of the setting that decides what a count is made from (QuestFilterBar's label). */
export const COUNT_SOURCE_LABEL = 'Count items from'

/** The chip's hover: what was stated and when, what still moves the count, and what removing it does. */
export function handCountChipTitle(count: number, statedOn: string): string {
  return (
    `You stated ${String(count)} of these on ${statedOn}. ` +
    'Anything looted since then is counted on top, and any turn-in recorded since then is taken off. ' +
    `Remove this to go back to the count your "${COUNT_SOURCE_LABEL}" setting gives.`
  )
}
