// prefsRailGroups — the headings that group the Preferences rail (owner, 2026-11-26: "can we
// maybe GROUP any of these preferences into categories"), drawn like the main nav's
// STATS/DATA, RESEARCH and CONFIG headings.
//
// A heading is keyed by the id of the FIRST section under it; `buildSections` lists the sections
// in group order. Searching still matches sections, not headings. Each heading folds
// (./PrefsRail.tsx).

import type { PrefSection } from './PreferencesView'

export const RAIL_GROUP_STARTS: Readonly<Record<string, string>> = {
  game: 'Game',
  textsize: 'Display',
  overlays: 'Overlays & alerts',
  profiles: 'App'
}

export interface RailGroup<S extends { id: string } = PrefSection> {
  /** The heading, or null for sections listed before the first heading. */
  heading: string | null
  /** The fold's key part: the id of the group's first section. */
  id: string
  sections: S[]
}

/** The sections cut into groups at each id `RAIL_GROUP_STARTS` names. Order is kept. */
export function railGroups<S extends { id: string }>(sections: S[]): RailGroup<S>[] {
  const out: RailGroup<S>[] = []
  for (const s of sections) {
    const heading = RAIL_GROUP_STARTS[s.id]
    const last = out[out.length - 1]
    if (heading !== undefined || !last) out.push({ heading: heading ?? null, id: s.id, sections: [s] })
    else last.sections.push(s)
  }
  return out
}
