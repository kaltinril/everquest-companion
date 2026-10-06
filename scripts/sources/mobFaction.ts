// mobFaction.ts — the wiki mob page's `|factions` field: the factions a kill of this mob lowers.
//
// `{{Namedmobpage}}` lists them as bullets, most with the hit beside them
// (`* [[Merchants of Kaladim]] <span class='profac'>(-30)</span>`), some bare (`* [[DeepPockets]]`)
// or with a guess (`(-?)`). A page that knows of none says `* None`; one that has not been worked
// out says `* Unknown` or leaves the field empty. A bullet marked `oppfac` is a faction the kill
// RAISES, which the field occasionally carries (14 pages of 7,926, measured 2026-10-05).

import { templateField } from '../../src/main/itemLookupParse'

/** The factions a kill lowers, as the page links them; none when it states none or does not know. */
export function factionHits(wikitext: string): string[] {
  const raw = templateField(wikitext, 'factions') ?? ''
  const hits: string[] = []
  for (const line of raw.split('\n')) {
    if (line.includes('oppfac')) continue
    const link = /\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/.exec(line)
    const name = link?.[1].trim() ?? ''
    if (name !== '' && !hits.includes(name)) hits.push(name)
  }
  return hits
}
