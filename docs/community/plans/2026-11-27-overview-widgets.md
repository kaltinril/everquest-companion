# Overview widgets: a personal dashboard built from every tab

Status: PLAN. Nothing is built yet. Owner ask, 2026-11-27:

> "i think we need the overview section to get some love. we haven't really added anything we've
> built since the original author. Perhaps we need overview to contain "widgets" from each of the
> tabs/sections and they can checkmark/chose which sections go on their personal overlay? and with
> what settings on their filters (like bazaar they could put a specific item or search with
> specific settings?) for now, just document it, and, identify the quick wins to put on the
> overview that don't require the extra filters saving functionality"

## Where Overview stands

The page is still the original author's design (`docs/plans/overview-tab.md`, built
2026-08): a zone strip, then a NOW row (Damage, Leveling, Target), the DPS curve, then two feeds
(Recent drops, Recent kills). `src/renderer/src/features/overview/OverviewView.tsx` is already a
composition: each card owns its own hook and asks for its own data, so "a future card is one file
plus one grid cell" (the file's own header). Nothing the fork built since (buffs timers, respawn
timers, healing meter, motes, AA pace, wiki gaps, Plane of Sky, factions, tradeskills, wish list,
alerts feed) has a card there.

## The idea, in two phases

**Phase 1: cards the player can show or hide.** A fixed set of cards, each one a small read of a
tab, and a "Customize" checklist on Overview that turns each card on or off and orders them.
That is one stored list of card ids. No per-card settings. This is what the quick wins below need.

**Phase 2: widgets with their own settings.** A card can carry the settings of the tab it came
from, frozen at the moment the player pinned it: Bazaar with a saved search ("Fine Steel Rapier,
under 500pp"), Loot filtered to one zone, Factions narrowed to the ones being worked, Timers for a
chosen list of mobs. This needs:
- a saved-filter format per tab: today each tab keeps its filters in its own storage hook, with
  different shapes (the 2026-11-27 sort-store merge found the same for sort state);
- "Pin to Overview" on each tab, which snapshots the tab's current filters into a widget;
- a widget renderer per tab that takes those filters as props instead of reading the tab's live
  state;
- per-character or machine-wide storage (decide once; the class filter went per character).

Phase 2 is a project of its own. Phase 1 stands alone and is useful without it.

## Quick wins (Phase 1, no saved filters)

Effort: **S** = the data hook already feeds a compact surface (mostly an overlay) and the card is
a new view over it; **M** = the data exists but needs a small new selector or join.

| # | Card | What it shows | Data it reuses | Effort |
|---|---|---|---|---|
| 1 | Buffs running out | The 3 to 5 buffs ending soonest, with time left | the Buffs overlay's hooks (`overlay/BuffsOverlay.tsx`: `useBuffAllow`, timer dismissals, `buffTimerBars`) | S |
| 2 | Respawns here | Mobs in this zone that are UP or due soon (the Timers tab's words) | `overlay/RespawnOverlay.tsx` (`useFolds`, `respawnOverlayRows`), the respawn clock labels | S |
| 3 | Healing | Heal meter beside Damage, for a healer | `overlay/HealMeter.tsx` (`useOverlayCombat`, `useGlobalFight`) | S |
| 4 | Recent events | The last few alerts and log events | `overlay/EventLogOverlay.tsx` (`useEventFeed`) | S |
| 5 | Motes | Motes this session and per hour, by tier, and in this zone | the zone history extras the Leveling and Maps tables already read (`ZoneExtra.motes`, mote rows in Loot) | S |
| 6 | AA | Points banked, AA per hour, the next AA on the plan | Leveling's AA pace (`aaRateText`) and the AA tab's plan | S |
| 7 | Wiki gaps here | Gaps in the current zone the player can fill | `overlay/GapsOverlay.tsx` (`useGapsOverlayRows`) | S |
| 8 | Plane of Sky | Active Sky quests and what they still need | `overlay/SkyQuestsOverlay.tsx` (`useSkyOverlayRows`) | S |
| 9 | Coin | Platinum this session and per hour, and in this zone | the coin rates the Leveling zone table shows (`coinPerHour`, `coinPeak`) | S |
| 10 | Wish list here | Wish-list items that drop in this zone, and from which mob | the wish list plus the zone's mob drops (`lookupMob`) | M |
| 11 | Skill-ups | Skills raised this session | the Skills tab's module | M |
| 12 | Faction changes | Factions moved this session, up or down | the faction ledger the Factions tab reads | M |
| 13 | Tradeskills | "Pick up where you left off": the last recipe and the next step | the Tradeskills home tile | M |
| 14 | Next unlocks | What the next level or AA unlocks | the Unlocks tab's rows | M |

Plus the Phase 1 control itself, **S**: a Customize button with one checkbox per card (and
order). It is stored as one list in the app's preferences; new cards default off, so the page
does not change for anyone until they pick.

## Suggested first batch

Cards 1, 2, 5 and 9, plus the Customize checklist. They answer "what is happening right now"
(the page's own test, see the OverviewView header), they reuse hooks that already run, and they
match what the owner checks while farming (buffs, respawns, motes, coin).

## Rules carried over

- One card per tab at most in Phase 1; a card links to its tab (the existing "Open in Combat"
  pattern) and never navigates on its own (OverviewView: "it routes, it never navigates").
- The NOW row's hydration rule holds for every new live card: during the startup replay a live
  card shows its quiet placeholder.
- No card may resize the grid (the `minmax(0, 1fr)` rule in the OverviewView header).
- e2e checks the wiring only (a card mounts and shows engine data); the values stay unit-tested
  (WORKFLOW.md, Gate, 2026-11-27 ruling).

## Questions for the owner (before Phase 1 is built)

1. Should the existing cards (Damage, Leveling, Target, DPS curve, drops, kills) be hideable too,
   or always on?
2. Per character, or the same Overview for every character?
3. Is the first batch (buffs, respawns, motes, coin) the right start?
