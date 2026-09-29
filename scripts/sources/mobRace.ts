// mobRace.ts — the wiki mob page's `|race` field, read the one way every reader reads it.
//
// `{{Namedmobpage}}` states a race on most pages (`| race = Gargoyle`), sometimes linked
// (`[[Human]]`, `[[Dark Elf|Teir'Dal]]`) and sometimes italicised (`''Undead''`). The value is
// kept as the wiki wrote it with only that markup taken off; folding it onto what an achievement
// counts is `slayerKinds.ts`'s job, not this one's.

import { templateField } from '../../src/main/itemLookupParse'

/** The `|race` value with its markup taken off, or '' when the page states none. */
export function statedRace(wikitext: string): string {
  const raw = templateField(wikitext, 'race') ?? ''
  return raw
    .split('\n')[0]
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[\[|\]\]|''+/g, '')
    .trim()
}
