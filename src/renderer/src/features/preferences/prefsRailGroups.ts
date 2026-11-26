// prefsRailGroups — the headings that group the Preferences rail (owner, 2026-11-26: "can we
// maybe GROUP any of these preferences into categories"), drawn like the main nav's
// STATS/DATA, RESEARCH and CONFIG headings.
//
// A heading is keyed by the id of the FIRST section under it; `buildSections` lists the sections
// in group order. Searching still matches sections, not headings.

export const RAIL_GROUP_STARTS: Readonly<Record<string, string>> = {
  game: 'Game',
  textsize: 'Display',
  overlays: 'Overlays & alerts',
  profiles: 'App'
}
