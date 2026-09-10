# Spells — a tab area for what a spell DOES, what upgrading it BUYS, and which set to keep up

Design doc. Library-first, in this tree's usual shape: pure models in `src/shared`, the joins in
`src/main`, one new renderer AREA behind one nav row, and the spell page that already exists gaining
the three sections it was always missing. Status: **PLANNED — not started.**

Directed by the fork user (kaltinril). The ask, near-verbatim (2026-09-10):

> *Spells can be upgraded, certain spell lines are good, but others are better. Certain spells
> conflict with each other like Spirit of Wolf and the shaman Spirit of Bih\`Li and other attack
> speed modification spells. It should help multiple ways: (1) know the best set of buff spells I
> can use given my combined classes to maximize stats/resists/hp/atk; (2) know which spells are
> important to upgrade — some upgraded spells don't give a benefit beyond reduced mana cost and cast
> time, like Bear Form: it doesn't increase the regen rate or amount, nor the wisdom; (3) visualize
> the real upgrades for a spell, similar to the gear slider 0 to +10; (4) recommend a BUFF set and
> which upgrades to take; (5) recommend a DMG/"combat" set. Allow spells to be looked at, because
> right now spells and exaltations don't really tell me WHAT it does, it just says the name, which
> isn't helpful.*

Named source: <https://amerzel.github.io/eql-info/#/upgrades> (§0.4 reads it in full and records
exactly what is taken from it and under what label).

---

## 0. What is actually stated, measured before designing

Nine findings. Six of them mean this feature is mostly a **join and a surface**, not a new corpus;
three of them are the genuinely new work.

### 0.1 The mote-rank arithmetic already exists, and it already agrees with the named source

`src/shared/spellScale.ts` (JOS-447) holds `SPELL_MAX_RANK = 10`,
`SPELL_DAMAGE_RANK_PERCENT = 6`, `SPELL_HEAL_RANK_PERCENT = 3`, and it was **fitted to the owner's
own 2.4M-line combat log** on ratios between two ranks of one spell, where worn gear cancels — six
independent same-level pairs of Garrison's Mighty Mana Shock, every one `floor(base x 1.48)` exactly
at rank VIII, which is `1 + 8 x 0.06`.

The named source states the same three numbers from an entirely independent method (88-94 community
tooltip captures, `spell-upgrades/STATUS.md`, 2026-07-20): tier cap 10, nuke damage
`floor(base x (1 + 0.06t))`, heal `~+3%/t`. **Two methods, one answer.** That is corroboration worth
recording and it is the reason the rest of the source's model is worth taking seriously at all.

`src/renderer/src/features/leveling/SpellRankSlider.tsx` is already the gear slider's metaphor for
spells, and its own header says what it deliberately does not simulate: *"mana and cast time stay at
base, which the tooltip states."* This plan is largely the removal of that sentence.

### 0.2 The named source states SEVEN things this repo models NOWHERE, and they are CATEGORY-scoped

Read off `docs/static/js/upgrades.js` in the source repo. Rates are **per tier**, linear, applied to
base:

| category | cast | mana | duration | damage / healing | source confidence (theirs) |
|---|---|---|---|---|---|
| nuke / lifetap | −2% | −2% | — | **+6%** damage | solid; damage combat-observed |
| DoT (incl. DD+DoT hybrids) | −4% | −2% | **+5%** | **+3%**/tick, +6% on the direct hit | solid; hybrid hit inferred |
| heal (instant) | −4% | −2% | — | ~+3% | solid; healing single-report |
| heal over time | −4% | −2% | **+5%** | ~+3%/tick | duration inferred |
| debuff (Tash, slow, snare) | −4% | −4% | **+10%** | **— magnitudes do not scale** | duration assumed |
| charm / mez (and lull) | −4% | −4% | **+10%** | — (**max target level +1/tier** instead) | solid; charm rule in-game observed |
| buff (incl. self-only, damage shields) | −4% | −4% | **+10%** | **— stat and DS values do not scale** | solid |
| pet summon | −4% | −4% | — | **+1 pet level/tier**, capped at your level −1 | inferred |

Universal, every category: **recovery −2%/t** (nearest 0.1s, exact halves round DOWN), **reuse −2%/t**
(display truncates fractions, hard floor 1s), **resist modifier −15 flat per tier** on resistable
offensive spells, **proc potency at `floor(tier/2)`** for combat-innate buffs (caps at proc rank V).
Instant and Permanent durations never scale. Zero-mana spells have no mana row to reduce.

**Mote cost: `2^(t-1)` motes to reach tier t; `2^t − 1` spent cumulatively.** Tier 10 therefore
costs 1,023 motes total, and 512 of them buy the last tier alone. That number is the whole reason
question (2) is worth a surface.

Also stated, mostly tooltip-invisible: 10% chance per tier to skip reagent costs (100% at tier 10);
summon-item spells summon matching-tier items; Spellblade / Quickbuff / Symphonic Aura trigger the
upgraded version; songs reportedly follow the same categories (unverified).

### 0.3 The owner's Bear Form example is EXACTLY RIGHT, and it is checkable from committed bytes

`src/main/data/spells.json`:

```
Form of the Bear        Beneficial  100 mana  ["Increase Hit points by 1 per tick", "Increase Wisdom by 5"]
Form of the Great Bear  Beneficial  135 mana  ["Illusion: 43", "Increase Hitpoints by 2 per tick", "Increase WIS by 10"]
```

Both are `buff` category. Under §0.2 an upgrade buys **cast time, mana and duration and nothing
else** — the 1 hp/tick stays 1 hp/tick and the 5 WIS stays 5 WIS, at every tier. The owner has
described the defect precisely, and the app can state the verdict as a *fact about the category*
rather than as an opinion about the spell. That sentence is the feature.

(Note the two spellings — `Hit points` / `Hitpoints`, `Wisdom` / `WIS`. §0.6 measures the alias
problem.)

### 0.4 The Spirit of Wolf / Spirit of Bih\`Li conflict is a MOVEMENT-SPEED conflict, not a haste one

```
Spirit of Wolf     Movement Buff  Single Friendly (or Self)  ["Increase Movement Speed by 30% (L1) to 55% (L50)"]
Spirit of Bih`Li   Buff           Group                      ["Increase Movement Speed by 55%", "Increase Attack by 15"]
```

They collide on the movement-speed slot, not on attack speed. Stated plainly because it changes what
the surface must say: the two are not interchangeable — **Bih\`Li carries a second effect (ATK +15)
that SoW does not, and casting SoW over it costs you that ATK silently.** "These conflict" is the
boring half of the answer; "and here is what you lose" is the half a player cannot get anywhere else.

The attack-speed family the owner was reaching for is real and large: **58 spells** in the committed
catalog carry `Increase Attack Speed` or `Increase Melee Haste`, of which the player-castable
single-target line is Quickness (28-30%) → Alacrity (34-40%) → Celerity (47-50%) → Swift Like The
Wind (60%) → Aanya's Quickening (64%), split across ENC and SHM at different levels. A trio holding
two of those has a real question about which to keep memorized, and today the app answers none of it.

### 0.5 A real stacking engine exists, is open source, and needs data this app ALREADY READS

The named source ships `docs/static/js/stacking.js` + `stacking_rules.js`: a browser port of EQEmu's
`CheckStackConflict` (`zone/spells.cpp`, tables generated from `common/spdat.h`/`.cpp`), returning
`0` unrelated / `1` the cast spell overwrites / `−1` the cast spell is blocked. It is ~120 lines. It
needs, per spell: the twelve effect slots as `(effectId, base, limit, formula, max)`, `good_effect`,
`target_type`, `buff_duration_formula`, `buff_duration`, the bard class level, and `unstackable_dot`.

**This app already reads the file those come from.** `src/main/resist/spellsUsParse.ts` (JOS-382)
parses the player's own `<eqRoot>/spells_us.txt` at runtime — 38 MB, ~74k rows — for the resist
table, with a measured field map (0 id, 1 name, 8 cast, 10 recast, 11/12 buff duration formula+cap,
14 mana, 29 resist type, 30 target type, 36..51 class levels, 78 resist adjust, 143 aemaxtargets,
172 the `$`-separated effect slots as `slot|effectId|base|limit|calc|max`). The engine has a
parity-gated Rust twin (`engine/crates/fold/src/spells_us.rs`) and already serves `spells.search`
over it. `spellTable.ts` caches the parse per install keyed on size+mtime.

What it does **not** keep today is the general effect slots: it retains effect-0 (hitpoints), the
HoT/bard-pulse spellings, resist-debuff slots and charm/mez level caps, and drops the rest. So the
stacking engine costs a **parser widening plus a cache-version bump**, not a new data source, and
**nothing derived from that file is ever committed** — the standing rule (`spellsUsParse.ts` header,
protocol schema `resist.spell`) — so every test on both sides stays hand-authored.

### 0.6 Buff stat MAGNITUDES are not parsed anywhere, and the effect lines are regular enough to parse

`spellEffectClass.ts` classifies effect lines and its own header says it *"deliberately reads no
MAGNITUDES."* `spellMetrics.ts` reads hitpoint lines only (`parseHpLine`). So "how much STR does this
give" is answerable by no module in the tree, which is exactly the owner's *"it just says the name."*

Measured over the committed catalog (2,006 spells, 1,078 `Beneficial`, 2,066 beneficial effect lines):

* **727 lines (35%)** match `(Increase|Decrease) <stat> by <N>[%]` or its ramp form
  `… by <N>[%] (L<a>) to <M>[%] (L<b>)` — the *same two shapes* `parseHpLine` already handles.
* **58 distinct stat names**, led by AC 84, STR 52, Attack Speed 46, Damage Shield 46, Hitpoints 40,
  HP when cast 38, Max Hitpoints 34, ATK 27, AGI 24, Fire Resist 23.
* The misses are overwhelmingly **not stat lines at all**: `Limit …` focus qualifiers (the largest
  group — already owned by `wornFocus.ts`), `… per tick` regen lines (owned by `spellMetrics.ts`),
  `Summon Item:`, `Illusion:`, `Ultravision(N)`, `Cancel Magic(N)`, `Add Melee Proc:`.
* **Aliases are real and must be folded**: STR/Strength, AC/Armor Class, Max Hitpoints/Max HP,
  Attack Speed/Melee Haste, Hitpoints/Hit points, WIS/Wisdom.

### 0.7 The spell drilldown already exists and is already linked from everywhere

`features/spells/SpellPage.tsx` (JOS-508) draws three sections — the record, the research LINE with
per-rung "when your combo gets it", and every class with its level — and `lib/spellLink.tsx` makes
**every spell name in the main window** a link into it through one context. The `spell` view is
deliberately absent from `KNOWN_VIEWS` (a spell page with no spell must not be restorable on launch)
and absent from `TELEMETRY_VIEWS` (that enum is validated by the ingest Lambda; widening it is a
server deploy before it is a client change).

The protocol schema states the remaining gap **by name**, and names its owner:

> *"A NAMED GAP RIDES THIS OP AND IS STATED HERE RATHER THAN DISCOVERED … no derived effect classes,
> no rank lineage, and none of the metrics `spellMetricsAt` reads at a gain level, at a mote rank or
> with worn focus … **The spell-surface ticket owns the rest.**"*
> — `protocol/schema/messages.schema.json`, `knowledge.spell`

This is that ticket.

### 0.8 Item→spell joins, observed ranks, memorized sets and role weights are all already built

* **Items that carry a spell.** `src/main/planner/effectIndex.ts` builds donor rows keyed
  `(item, effect, socket)` with `SocketType = 'focus' | 'click' | 'worn' | 'proc'`, plus the item
  page's own `|dropsfrom` witnesses and its era banner. It is indexed by item; the spell page needs
  it **inverted by spell name**. No new data, one new index and one op.
* **What rank you actually hold.** `shared/spellRanks.ts` + `main/modules/observedSpellRanks.ts`
  fold merge lines and rank-suffixed casts into "highest rank of this LINE this character has been
  observed to hold", keyed by `spellLineKey`, distinguishing `mergedRank` (watched you level it)
  from `castRank` (watched you cast it).
* **What is in your gems.** `shared/spellSets.ts` — memorized spells and named sets, presence-only
  (rule 1: it never claims a gem is empty).
* **What a stat is worth to how you play.** `shared/planner/roleWeights.ts` — two layers, the FOCUS
  (`GearRole`: tank, healer, 1h/2h/dual dps, DD, DOT, balanced …) and the CLASS gate (which mana
  stat is live, whether CHA does anything, whether BACKSTAB exists). Rebuilt on the owner's own
  rulings 2026-08-22.
* **What your gear does to your casts.** `shared/wornFocus.ts` — the worn focus overlay with the
  level-decay arithmetic and the per-cast roll histogram.
* **Which castable set to pick.** `features/character/socketOptimize.ts` already solves the
  structurally identical problem for the exaltation board: maximum-weight selection under
  slot/class rules, incumbents winning ties.

### 0.9 THE MODEL WAS PUT TO THE OWNER'S OWN LOG, AND THREE OF ITS RATES SURVIVE

The named source's rates are reverse-engineered from community tooltip captures. Before adopting any
of them this repo did what it did for `spellScale.ts`: measured them against
`…\EverQuest Legends\Logs\eqlog_Drywrought_oggok.txt` (**2,007,769 lines**, read-only, 2026-09-10).

**The measurement is possible at all because the log states the rank on its own DoT ticks.** Nuke
hits do not carry it (`You hit X for N points of magic damage by Odium.`), which is why
`spellScale.ts` had to infer rank from time windows — but a DoT tick does:
`<mob> has taken N damage from your Odium VII.` So rank, level and damage arrive on one line and the
worn-focus factor cancels in a same-level, same-day ratio.

#### DoT damage: the source's **+3%/tier is CONFIRMED and the repo's flat 6% is EXCLUDED**

Max tick per (spell, rank, level). The maximum is a *ceiling*, not an outlier — it repeats (Odium
rank VII reads 468 on 4 of its top 4 ticks) and no crit-shaped 2x values exist anywhere in the
histogram, so the AA "Critical Affliction" is not contaminating it.

| spell | base ceiling | ranked | ratio | **per tier** | 6%/tier would predict |
|---|---|---|---|---|---|
| **Odium** (L20-29, n=239) | 387 | **V** 445 | 1.1499 | **3.00%** | 503 |
| **Odium** | 387 | **VII** 468 | 1.2093 | **2.99%** | 549 |
| **Envenomed Bolt** (L38-39, n=123) | 422 | **IV** 473 | 1.1209 | **3.02%** | 523 |
| **Plague** (L38-39, n=80) | 180 | **IV** 199 | 1.1056 | **2.64%** | 223 |

`floor(387 x (1 + 0.03 x 5)) = 445` and `floor(387 x (1 + 0.03 x 7)) = 468` — **both exact.** Three
independent spells land between 2.6% and 3.0%; the 6% rate is 10-15% high on every one of them, far
outside the sampling noise. **Owner ruling §7.1 is now a measurement, not an adoption**, and
`spellUpgrade.ts` marks the DoT damage rate `'measured'`.

(Odium's base ceiling drops to 309 for the L43-45 window — `309 / 387 = 0.80`, a damage focus coming
off and going back on, exactly the effect `wornFocus.ts` models. It is why every row above is a
same-window comparison.)

#### DoT duration: **+5%/tier CONFIRMED** (2 of 3, the third under-sampled)

Ticks per application, runs split on a >12s gap, mode rather than max. A base application produces
**one initial hit plus its DoT ticks**, which is the SPA-79 hybrid the source calls out.

| spell | base | ranked | model predicts | observed |
|---|---|---|---|---|
| **Odium** (5 ticks + 1 initial) | 6 lines (mode, n=180) | **VII** | `round(5 x 1.35) + 1 = 8` | **8** ✓ |
| **Plague** (13 ticks + 1) | 14 lines (mode, n=36) | **IV** | `round(13 x 1.20) + 1 = 17` | **17** ✓ |
| **Envenomed Bolt** (6 ticks + 1) | 7 lines (mode, n=97) | **IV** | 8 | 7 ✗ (only 7 applications) |

#### Buff duration: **+10%/tier CONSISTENT, not measured**

Landing emote → wears-off emote, per rank and per level, outliers over 3x the median dropped (a log
gap is not a duration). **Spirit of the Puma is the only clean instrument in the set** — a unique
landing emote, a short duration so a whole cycle fits inside one fight, and three rungs at one level:

| rank | level | n | max duration | vs base | per tier |
|---|---|---|---|---|---|
| base | 38 | 9 | 1.20 min | — | — |
| **IV** | 38 | 11 | 1.58 min | 1.317 | **7.9%** |
| **VI** | 38 | 48 | 2.00 min | 1.667 | **11.1%** |

Both **bracket** the claimed 10% without pinning it, and it ships marked `'reported'`, not
`'measured'`. One spell, single-digit samples on two of three rungs, and - the reason that matters -
a landing-to-wears-off gap is the one measurement in this section that a MISSED line inflates rather
than truncates. See §0.9.1.

**Alacrity is unusable and law 3 is why.** `Your speed returns to normal.` is shared by nine haste
spells (AGENTS.md world-model law 3), and this log proves it live: Alacrity's "base" durations read
13.8 min at L20-29 and 2-3 min at L42-46, which is not one spell. Chloroplast is likewise polluted by
overwrites. Neither is quoted above.

### 0.9.1 What the log cannot be trusted about, and why the two DoT rates survive anyway

The owner's caution, verbatim (2026-09-10): *"in practice many things can affect buff cast time and
duration. Dying, cancel magic stuff, pillage spells, accidental clicking off, noticing a buff is
getting low and manually recasting it. Different AA can affect cast time etc. Different stances or
whatever they are called also. So the logs can't be 100% trusted."*

Correct, and **this log names three of those confounds out loud**:

* **1,928 stance changes** - `You assume an offensive stance.` x760, evasive x529, balanced x578,
  channeler x30, plus four more. A stance moves cast time; anything read off this log about cast time
  is measuring the stance as much as the tier.
* **Two cast-time AAs land inside the comparison windows**: `Spell Casting Deftness` (Sep 06) and
  `Quick Damage` (**Sep 09 - the very day of the Odium base/V/VII comparison**).
* **Two DoT crit AAs** - `Critical Affliction` and `Destructive Cascade`, both Sep 08 - fall between
  the older base window and the ranked one.

**Why the two DoT rates survive it and the buff rate does not:**

| | tick magnitude (damage rate) | tick count (duration rate) | buff landing→wears-off |
|---|---|---|---|
| death / dispel / click-off / manual recast | decides *whether* a tick happens, never its **number** | **truncates only** - a run reads short, never long | truncates |
| stance change, cast-time AA | no effect on a landed tick's value | no effect | no effect |
| DoT crit AA | *would* inflate - **ruled out by shape**: no 2x values anywhere; Odium at VII reads 468 on 4 of its top 4, a repeating ceiling, not an outlier | no effect | no effect |
| caster level, worn focus | controlled: same level, same day | no effect | no effect |
| **a MISSED wears-off line** (zone, camp, log gap) | no effect | no effect | **inflates** - the one direction that flatters a rate |
| estimator used | max (a repeating ceiling) | **mode** over many applications (n=180 for Odium base) | max, over n=9-48 |

The tick-count estimator is the mode rather than the max precisely because the censoring is one-way,
which is AGENTS.md's own duration rule (*"recency-weighted MAX (median biases low via censored
samples)"*) applied to a distribution dense enough to have a mode. The buff row has neither
protection, so it stays `'reported'`.

No buff-duration AA was purchased anywhere in this log, so at least that confound is absent from the
Spirit of the Puma numbers.

#### What this log CANNOT settle, stated rather than fudged

* **Cast time and reuse (−2% / −4% per tier).** Ruled out three times over: 1,928 stance changes, two
  cast-time AAs inside the windows (§0.9.1), 1-second timestamp resolution, and a cast-begin to
  first-tick gap that also carries the DoT's own tick phase. The direction is right — Odium's base
  gap modes are 5s/4s/3s against rank VII's 3s/1s/2s, the whole distribution shifted left — but that
  is a **direction, not a magnitude**, and it is not quoted as one.
* **Mana (−2% / −4% per tier).** The log never prints a mana cost, and stances move it as well.
  Nothing here can test it.
* **Resist modifier (−15/tier).** Needs a large per-rank resist-rate sample against known mobs; not
  attempted.
* **Everything about buff magnitudes.** The log prints no stat values, so the Bear Form claim of
  §0.3 — that a buff's numbers do not move — is **model-derived and not yet measured.** It is the
  single most load-bearing unmeasured claim in this design.

#### The screenshots that would close the gaps (owner offered, 2026-09-10)

One in-game tooltip pair per row settles a rate outright, because the tooltip prints the number:

1. **Any buff at two ranks, side by side** — e.g. Form of the Bear at base and at IV. Settles the
   mana rate, the cast rate, the duration rate **and** the §0.3 magnitude claim in one pair. Highest
   value by a distance.
2. **A nuke at two ranks** — settles mana/cast for the `nuke` category, whose rates (−2%/−2%) differ
   from every other category's.
3. **A debuff at two ranks** (Malosi, Incapacitate) — the `debuff` duration rate is the source's own
   *"assumed"*, and nothing in this log tests it.

Until then those rates ship marked `'reported'`, and the UI says so.

### 0.10 There is a no-bulk-frame ruling, and it binds this feature

Protocol schema, `spells.search`: the parsed client table is **48,256 entries and 6.13 MiB of JSON
against an 8 MiB frame ceiling**, on one machine, against a table that grows with every client patch.
So there is a per-spell `resist.spell` op and a windowed `spells.search`, and **there will never be a
bulk one**. Every stacking query in this design is therefore over a **bounded candidate set** (the
buffs a trio can actually cast — §3.3 measures it) fetched by a batched op, never a table read.

---

## 1. What the surface answers

Five questions, in the owner's order, each mapped to where it gets answered.

| # | The question | Where it lands |
|---|---|---|
| 1 | *What is the best set of buffs my combo can keep up?* | **Loadout** tab, Buffs side |
| 2 | *Which spells are worth spending motes on?* | **Upgrades** tab, and one verdict line on every spell page |
| 3 | *What does upgrading THIS spell actually do?* | Spell page's tier slider + per-tier table |
| 4 | *Recommend a buff set and the upgrades to take* | **Loadout** Buffs side + its "and upgrade these" tail |
| 5 | *Recommend a combat set and the upgrades to take* | **Loadout** Combat side + the same tail |
| — | *What does this spell even DO?* | **Spellbook** tab (browse) and the spell page (drill) |

---

## 2. The shape: one nav row, three tabs, and the page that already exists

The **gear area** pattern, verbatim (`appViews.ts` `GEAR_AREA_VIEWS`, `components/GearAreaTabs.tsx`):
one nav row over an in-area tab bar, where every tab click goes through the app's own `selectView`.
That is what makes the collapse cost no semantics — the Back stack treats a tab click as manual
navigation, the outgoing view unmounts on `viewKey`, and a deep link into any tab lands with the bar
already reading right.

```
Nav row:  Spells                     (icon: AutoStoriesIcon; badge: beta)
  ├─ Spellbook   view id `spells`         search / list / compare, the whole catalog
  ├─ Upgrades    view id `spellUpgrades`  what motes buy, ranked by return
  ├─ Loadout     view id `spellLoadout`   the recommended buff set and combat set
  └─ (Spell)     view id `spell`          the existing drill — NOT a tab, no nav row, reached by clicking any spell name
```

`VIEW_LABELS` gains three rows (a `Record<View, string>`, so forgetting one is a type error).
`KNOWN_VIEWS` gains the three ids **inside the `UNRELEASED` splice** — the review gate the Factions
tab is standing in today, and the exact path the Character sheet took to release (JOS-45 → JOS-327).
`spell` stays out of `KNOWN_VIEWS`, unchanged and for its stated reason.

`SPELL_AREA_VIEWS` is filtered by `KNOWN_VIEWS` the way `GEAR_AREA_VIEWS` is, so a tab appears exactly
when the build can draw the view behind it. `SPELL_TAB_KEY = 'eq.spells.tab'` remembers the last tab;
`DEFAULT_SPELL_TAB = 'spells'`.

`GearAreaTabs.tsx` becomes `AreaTabs.tsx`, taking `views` and a `testId` — one component, two areas,
no second opinion about how an in-area bar behaves. The gear testids (`gear-area-tabs`, `tab-<view>`)
are preserved exactly; the spells bar is `spell-area-tabs`.

### 2.1 Overlap with what already ships, decided rather than discovered

Three existing surfaces are about spells, and none of them is replaced.

* **Buffs tab** — what is on you *right now*, observed from the log. Untouched. It gains one thing:
  a conflict chip on a row whose spell is being outranked by another buff you also hold.
* **Leveling → Best Spells** (`bestSpells.ts`, five tabs, search, rank slider, worn focus) — the
  **efficiency ranking at your level, over what you own**. Untouched, and deliberately not moved.
  The Spellbook tab is the *corpus browser* — every spell, every class, columns the 260px-floor
  readout has already measured itself as unable to fit. They answer different questions and the docs
  for each will say which. Where they touch, Spellbook rows link into the spell page, same as
  everything else.
  * **Owner decision to make at wave 6, not now:** whether the Best Spells readout eventually *moves*
    into the Spells area. Recommendation: **no** — it is level-scoped and belongs beside the level
    stepper that scopes it. Revisit only if the owner finds himself hunting for it.
* **Exaltations tab** — the owner's *"exaltations don't really tell me WHAT it does"* is answered by
  the spell page, not by a second card: exaltation effect names are already spell names, and
  `lib/spellLink.tsx` already makes them links. Wave 3 checks that every exaltation effect chip
  actually routes (it should; if one does not, that is a one-line fix, not a feature).

---

## 3. Data model

Four new pure modules and two widenings. Every one of them is deletable without taking a scrape with
it — the `spellScale.ts` / `wornFocus.ts` / `aoeSpells.ts` family rule.

### 3.1 `src/shared/spellUpgrade.ts` — what a tier buys

Pure, no imports beyond `spellScale.ts`. Holds:

```ts
export type UpgradeCategory = 'nuke' | 'dot' | 'heal' | 'hot' | 'debuff' | 'cc' | 'buff' | 'pet' | 'other'
export interface UpgradeRates { cast: number; mana: number; duration: number | null; magnitude: MagnitudeRule }
export const UPGRADE_RATES: Record<UpgradeCategory, UpgradeRates>
export function classifyUpgrade(facts: UpgradeFacts): UpgradeCategory
export function spellAtTier(base: SpellTierBase, tier: number): SpellTierReading
export function motesToReach(tier: number): number      // 2^(t-1)
export function motesSpentAt(tier: number): number      // 2^t - 1
export function upgradePayoff(reading: SpellTierReading[]): UpgradePayoff
```

Four rules this module is the only place to state:

1. **`upgradePayoff` is the Bear Form answer.** It returns which quantities actually MOVE across the
   ladder — `{ magnitude: false, duration: true, mana: true, cast: true, resist: false, … }` — plus a
   one-sentence verdict built from the category, never from the spell. A `buff` reads *"upgrading
   buys duration, mana and cast time - the numbers it grants do not change."* That is a claim about
   the model and it is labeled as one.
2. **Rounding is the source's measured rounding, not ours.** Recovery to the nearest 0.1s with exact
   halves rounding DOWN (`Math.ceil(x - 0.5)`); reuse floor-truncated with a hard 1s floor; mana
   `Math.round`; damage `Math.floor`; heal `Math.round`; duration `Math.round` on ticks. Pinned by
   fixture, because a display that disagrees with the game's own tooltip by one is worse than no
   display.
3. **Confidence rides every number.** `'measured'` (this repo's own log fit — nuke damage, heal),
   `'reported'` (the source's tooltip captures — cast, mana, duration, recovery, reuse, resist,
   motes), `'inferred'` (the source's own extrapolations — HoT/debuff duration, pet, hybrid initial
   hit). The UI marks anything not `measured`. World-model law 1: **anything inferred is LABELED
   inferred.**
4. **Instant and Permanent never scale**, and a zero-mana spell has no mana row. Absent, not zero.

**The one reconciliation this module forces — owner ruling 2026-09-10, since CONFIRMED by §0.9.**
`spellScale.ts scaleSpellDamage` applies 6%/rank to *all* damage. The source states DoT damage at
**3%/tick** with 6% only on a hybrid's direct hit. The repo's 6% was fitted on nukes (Garrison's,
Discordant Mind); **no DoT ladder was in the sample**, so 6% for a DoT was never a measurement — it
was the one rate the fit had, applied everywhere. The source's category split is the more specific
claim and it is adopted **tree-wide, not just in the new area**: two surfaces stating different
numbers for one spell is the defect, not the safety.

Mechanically: `scaleSpellDamage` grows an optional `UpgradeCategory` argument. A caller that states
none keeps 6% (so nothing outside this branch moves by accident), and every caller in the tree is
walked in wave 1 and given the category — which for the Leveling tab's `dot` and `hot` tables means
its per-rank figures drop to +3%/rank. That is a visible change to a shipped number and it is
deliberate. **It is marked `'measured'`, not `'reported'`**: §0.9 put it to the owner's own log and
three independent DoT ladders read 2.6-3.0%/tier while the 6% rate missed every one of them by
10-15%. Odium is exact to the unit at two separate ranks.

### 3.2 `src/shared/spellStats.ts` — what a beneficial spell GRANTS

The magnitude reader `spellEffectClass.ts` declined to be, built the way `parseHpLine` was: two
shapes, a flat value and a level ramp, clamped at the ends and never extrapolated.

```ts
export type StatKey = 'ac' | 'str' | 'sta' | 'agi' | 'dex' | 'wis' | 'int' | 'cha'
  | 'hp' | 'maxHp' | 'mana' | 'maxMana' | 'atk' | 'attackSpeed' | 'movementSpeed'
  | 'damageShield' | 'resistFire' | 'resistCold' | 'resistMagic' | 'resistPoison'
  | 'resistDisease' | 'resistAll' | 'hpRegen' | 'manaRegen' | 'spellHaste' | ...
export interface SpellStatGrant { key: StatKey; amount: number; percent: boolean; ramp?: StatRamp; spa?: number }
export function parseStatLine(line: string): SpellStatGrant | null
export function spellStatGrants(effects: readonly string[], level: number): SpellStatGrant[]
```

Rules:

* **The alias fold is a table, not a matcher** (law 12's spirit: a rename is knowledge). `Strength`
  and `STR` are one key because they are one stat, verified by reading both spells; a name nobody has
  checked yields `null` and the line is simply not a stat grant. Silence is not zero.
* **The `GearStatKey` vocabulary is reused where the two overlap** (`shared/planner/gear.ts`), so a
  buff's +20 STR and a bracer's +8 STR are the same key and can be added. Where the spell vocabulary
  is wider (movement speed, spell haste, damage shield, counters) the key is new and the gear side
  simply never carries it.
* **A percentage is not a point.** `Increase Attack Speed by 47%` and `Increase STR by 20` are not
  summable and the type says so (`percent: boolean`). Nothing in this tree will ever add them.
* Coverage is stated in the header as a measurement (§0.6: 727 of 2,066 beneficial lines, 58 names)
  and pinned by a test that re-measures the committed corpus, so a scrape that changes shape fails
  loudly instead of quietly parsing less.

### 3.3 `src/shared/spellStack.ts` — the conflict verdict

The `CheckStackConflict` port. Pure over two spell views and two levels; no Electron, no catalog, no
network. Ported from EQEmu's own source with the named source's JS as a second reading, and
**parity-fixtured**: `tests/spellStack.test.mts` drives hand-authored slot rows (never client bytes)
through cases whose expected verdict is stated by the algorithm rather than by us.

```ts
export type StackVerdict = 'stacks' | 'overwrites' | 'blocked'
export interface StackSpellView { id, name, goodEffect, targetType, buffDurationFormula, buffDuration,
                                  isBardSong, unstackableDot, effects: readonly StackSlot[] }
export function checkStackConflict(worn: StackSpellView, cast: StackSpellView, wornLevel: number, castLevel: number): StackVerdict
export function conflictComponents(views: readonly StackSpellView[], level: number): StackComponent[]
```

`conflictComponents` is the piece §3.5 needs: the candidate set partitioned into connected components
of the conflict graph. **IMPLEMENTED AND PINNED (wave 4).** `conflictComponents` partitions a candidate set and reports,
per component, whether it is a CLIQUE - which is the property the optimizer's exactness rests on: in
a clique the best subset is trivially the best single member, exact and linear. `tests/spellStack.
test.mts` pins both shapes on hand-authored rows: a haste family is one clique, and a CHAIN
(A contests B, B contests C, A and C never meet) is one component that is NOT a clique - the case
§3.5's optimizer must not assume away. The real per-trio component sizes are measured in wave 6,
where a real candidate set exists to measure.

**Three degradation tiers, because most of the world has no `spells_us.txt` open.**

| tier | condition | what the surface says |
|---|---|---|
| **exact** | client table read, both spells present | the verdict, with the losing spell's *unshared* effects named ("you lose ATK +15") |
| **flagged** | no client table, both spells state the same stat in the committed catalog | *"both of these grant Movement Speed - only one will stand. Which one needs your EverQuest spell file."* Labeled. |
| **silent** | no client table, no shared stat | nothing at all. Never a guessed verdict. |

The **flagged** tier is a statement about the wiki's own words and is true; it is not a stacking
verdict and the copy never lets it read as one. This is the whole of law 1 applied to a feature that
would be very easy to fake.

### 3.4 Widening `spellsUsParse.ts` (and its Rust twin) to keep every slot

Today the parser keeps effect-0 slots, the HoT/bard spellings, resist-debuff slots and level caps.
It gains `slots?: StackSlot[]` — all twelve, `(effectId, base, limit, formula, max)` at their exact
slot index — plus `goodEffect`, `bardLevel` (already read as part of fields 36..51) and
`unstackableDot`.

* `SPELL_RESIST_CACHE_VERSION` **5 → 6**. Same argument as versions 2, 3 and 4 before it: a v5 cache
  was written before anything read these columns, so the only way to get them is the re-parse the
  bump forces — one launch's worth of worker time per install, once. (JOS-449's lesson is on the
  record: a parser change shipped without the bump and the owner's machine silently kept reading the
  old cache. Do not repeat it.)
* Cache size is the thing to measure before merging. Twelve slots on ~74k rows is not free. If the
  measured cache crosses what `spellTable.ts` is comfortable writing, **store slots only for rows a
  player class can cast** — the same corpus rule `spells.search` already applies ("a row no class can
  cast is a mob's or an item's copy") — and record the measured before/after in the file header.
* **CORRECTED AT IMPLEMENTATION TIME (2026-09-10): the Rust twin is NOT parity-gated.** This
  section originally claimed it was. Checked: `engine/crates/parity/src/main.rs` gates the LOG FOLD,
  and `engine/crates/fold/src/spells_us.rs` is the engine's own reader serving its `resist.spell`
  and `spells.search` ops - nothing compares it against `spellsUsParse.ts`. So widening the TS
  parser breaks nothing on the Rust side and no wave is blocked on it.
  **The Rust twin is therefore DEFERRED, deliberately and on the record.** The stacking engine runs
  APP-SIDE off the app's own parsed table, so nothing in this feature needs the engine to know about
  effect slots. The twin becomes necessary the day the engine is asked to serve a stacking verdict,
  and that is a separate ticket with its own reason to exist.

### 3.5 `src/shared/spellLoadout.ts` — the recommended sets

The optimizer. Given: the trio's castable spells (from `spellLevels.ts` class/level pairs, the
loadout rules `bestSpells.ts` already obeys), a `GearRole`, a viewed level, an upgrade-tier
assumption, and the conflict components from §3.3 — choose the subset that maximizes role-weighted
value.

* **Value comes from `roleWeights.ts`, not from a second table.** A buff's grants are scored through
  the same two-layer FOCUS × CLASS-gate arithmetic the Gear area scores an item with. That is the
  interconnectivity the owner asked for by implication: **one opinion in this app about what a stat
  is worth, and gear and spells both read it.** A tank sees AC and HP buffs rise; a nuker sees mana
  and spell haste rise; nobody sees a stat their classes cannot use.
* **The selection is exact, and here is why.** Maximum-weight independent set is NP-hard in general.
  The conflict graph here decomposes into components (§3.3); within a component that is a clique, the
  answer is "the best single member", which is exact and O(n). For a component that is not a clique,
  the module does exhaustive search up to a stated node cap and, past it, **says it could not prove
  optimality** rather than printing a maybe-best set as a best set. The cap and the measured
  component sizes go in the header.
* **Slot pressure is a real constraint and is stated, not modeled away.** You have eight gems.
  `spellSets.ts` knows which spells you have been watched memorizing. The Buffs side reports the
  recommended set *and* how many gems it wants, marks which of them you already hold memorized, and
  never silently drops a good buff to fit eight.
* **The Combat side is `bestSpells.ts`'s ranking, not a new one.** `spellMetricsAt` already produces
  recast-aware sustained dps/hps with worn focus applied. The Combat side asks it the same question
  at the chosen tier and adds exactly one thing the ranking cannot: which of your damage spells
  *share a debuff slot or a DoT identity* and therefore cannot all be running at once.
* **The upgrade tail is the join between the two halves of the ask.** Having chosen a set, rank its
  members by `Δvalue / motes` using §3.1's cost curve — *"your next 8 motes buy the most here."*
  Ranks you already hold come from `observedSpellRanks`, so this is a statement about your character
  and not about a hypothetical one.

---

## 4. Renderer

### 4.1 Spellbook (`spells`)

The Gear tab's shape, over the spell corpus. Filter bar (class from the combo or any class, level
band, category from §3.1, era toggle, "castable by my trio only"), a virtualized table, and one
**global tier slider** — the gear area's `UpgradeSlider` law: *every number in the table, at tier N*,
with a permanent label saying what is being simulated, and `useDeferredValue` so the thumb never
waits on the table.

Columns: name (→ spell page), classes+levels, category, mana, cast, the headline magnitude from
§3.2, and **payoff** — a compact glyph row for what a tier actually moves on this spell, which is
question (2) answered at a glance across a whole list.

Reuses `bestSpellsSearch.ts`'s query vocabulary and `spellSearch.ts`'s apostrophe fold. One search
grammar in this app, not two.

### 4.2 Upgrades (`spellUpgrades`)

Three stacked panels:

1. **Your ladder.** Every line `observedSpellRanks` has watched you hold, with its current rank, the
   motes to the next tier, and what that tier buys. Sorted by return per mote.
2. **The dead ends.** Lines whose category buys no magnitude at all — the Bear Form list. Not hidden
   behind a filter; it is the answer to a question the owner asked out loud, so it is a panel.
3. **What-if.** Pick a spell, drag the tier, read the whole per-tier table (mana, cast, recovery,
   reuse, duration, resist, damage/heal) against the base column, with confidence marks. The named
   source's own layout, in this app's components.

### 4.3 Loadout (`spellLoadout`)

Two sides behind one role picker (the Gear area's `GearRole`, read from the same preference so the
two areas agree about how you play).

* **Buffs.** The recommended set as cards, each with its grants, its gem cost, its stacking verdicts
  against everything else in the set, and a "you lose X" line where a conflict is real. Rejected
  candidates stay visible with the reason — *"blocked by Celerity (47% > 30%)"* — because a
  recommender that silently drops things teaches nobody anything. The exaltation advisor's shape
  (effect-led chips with reasons on hover; red cards for what a better copy outclasses) is the
  precedent and the vocabulary.
* **Combat.** The ranked damage/heal set at the chosen tier, with the shared-slot warnings.
* **And upgrade these.** The `Δvalue / motes` tail from §3.5, under both sides.

### 4.4 The spell page (`spell`) — three new sections

Existing sections (record, line ladder, classes) are untouched. Added, in order:

5. **What it grants** — §3.2's rows at your level, with the ramp's endpoints stated.
6. **Upgrades** — the tier slider and the per-tier table, plus the payoff verdict sentence, plus
   your observed rank marked on the ladder.
7. **Where it comes from** — the inverted donor index (§0.8): every item that carries this spell as
   worn / click / focus / proc, each linking into the Loot drill the app already has; and the item
   pages' own `|dropsfrom` witnesses for a scroll of it.

On **"where to get a spell if not from a standard merchant"**: the committed catalog states no vendor
for any spell — measured, not assumed. What the app can honestly answer is the item-corpus half above.
The surface will say what it knows and stay quiet about the rest rather than shipping an empty
"Vendor:" row. If the owner wants merchant data it is a scrape, and per the standing rule that is an
owner-and-creator decision, not a thing this feature helps itself to.

### 4.5 Interconnectivity — the links that must exist when this lands

* Every spell name everywhere already routes (`lib/spellLink.tsx`). Verify: Buffs rows, alert
  suggestions, Best Spells rows, New-at-level rows, exaltation effect chips, item click/proc/focus
  lines on the Loot drill.
* **New:** the spell page's item rows → Loot drill. The Loadout cards → spell page. The Upgrades
  rows → spell page. The Buffs tab's conflict chip → Loadout.
* Every one of those is a **drill**, so every one takes the app's one `NavBack` contract and nothing
  bespoke (`appRouting.ts`). "Back to Loadout" comes free from `VIEW_LABELS`.

---

## 5. Waves

Each wave is mergeable and leaves the app working. Branch `spell-upgrades`, worktree
`C:/git/eqc-spell-upgrades`, based on **`origin/main`** — verified current: `origin/main` and
`upstream/main` are both at `af7a938a` today, so no stale-base dance is needed. Fixes land on this
branch and merge into `local_all_changes_testing`, never the reverse. **This branch never touches
`shared/releaseNotes.ts`.**

| wave | what lands | gate |
|---|---|---|
| **0** | This doc. | — |
| **1** | `spellUpgrade.ts` + `spellStats.ts`, pure, fully tested. No UI. The §3.1 DoT-rate question put to the owner. | `npm test` |
| **2** | The area shell: `AreaTabs` generalization, three view ids in the `UNRELEASED` splice, nav row, labels, tab memory. Spellbook tab with search + tier slider, no payoff column yet. | e2e: nav → area → each tab mounts |
| **3** | Spell page sections 5 and 6 (grants, upgrades). Donor-index inversion + planner op → section 7. Link audit (§4.5). | e2e: spell page states a grant and a tier |
| **4** | `spellsUsParse.ts` slot widening, cache **v6**, `spellStack.ts` + fixtures. Component-size measurement written into §3.3. **No UI.** Rust twin deferred (§3.4). | cache size measured and recorded |
| **5** | Upgrades tab, all three panels. Payoff column joins Spellbook. | e2e: the dead-ends panel names a `buff`-category spell |
| **6** | Loadout tab, both sides, upgrade tail. Buffs-tab conflict chip. | e2e: a conflict is stated with its reason |
| **7** | Graduation, owner-sequenced: `TELEMETRY_VIEWS` widened **server first** (ingest Lambda deploy), then the `UNRELEASED` splice deleted. Beta chip decision. | the Character sheet's own path, JOS-45 → JOS-327 |

---

## 6. Fixtures and tests

* `tests/spellUpgrade.test.mts` — the rate table, every rounding rule, the mote curve, and
  `upgradePayoff` pinned on Form of the Bear (no magnitude), Garrison's (damage), Celerity (duration
  only), Tashani (resist −15/tier).
* `tests/spellStats.test.mts` — both line shapes, every alias, the ramp clamp, and a **corpus
  re-measurement** asserting the §0.6 numbers so a changed scrape fails loudly.
* `tests/spellStack.test.mts` — hand-authored slots only. Cases: same spell different level; bard
  song vs non-song; the movement-speed pair (SoW vs Bih\`Li); the haste ladder; a group spell losing
  a tie to a single-target one; a blocking directive; `SE_COMPLETEHEAL`; stackable DoTs.
* `tests/spellLoadout.test.mts` — exactness on a clique, the non-clique cap and its refusal to claim
  optimality, role-weight sensitivity, the gem-count report.
* `tests/spellsUsParse.test.mts` — extended with slot rows; **still hand-authored**, never client
  bytes.
* e2e per §5. The `respawn-timers` red on upstream main is unrelated and is not this branch's.

---

## 7. Decisions

**Settled by the owner, 2026-09-10.**

1. **The DoT rate (§3.1) — ADOPT the source's 3%/tick, tree-wide.** The Leveling tab's `dot` and
   `hot` tables move with it. **Subsequently CONFIRMED against the owner's own log (§0.9)** — three
   spells, 2.6-3.0%/tier, with 6% excluded — so it ships marked `'measured'`.
2. **Scope — all seven waves, straight through**, on one branch.

**Taken at implementation time, recorded here as they land.**

3. **Cache growth (§3.4).** Measure `spell-resist-cache.json` before and after the slot widening. If
   it grows uncomfortably, restrict slot storage to player-castable rows (the corpus rule
   `spells.search` already applies) and write the measured before/after into the file header. Default
   is to keep every row; the restriction is a response to a number, not a guess.
4. **Best Spells' home (§2.1).** The ranked readout STAYS on Leveling — it is level-scoped and
   belongs beside the level stepper that scopes it. Revisit only if the owner goes hunting for it.
5. **Attribution.** The upgrade rates come from a named community source that credits its own
   contributors. This app already treats crediting as part of a feature (both wikis are named in-app
   and in the README for the bundled art). The Upgrades tab names the source and links it, the same
   way the wiki credits work, and `spellUpgrade.ts`'s header carries the citation.
6. **Beta chip.** The Spells row ships with the `beta` chip Gear wears, and it comes off the way
   every chip in this app comes off: by deleting the badge, never by softening the word.

## 8. Deliberate non-goals

* **No new scrape and no new fetch.** Everything above is committed bytes, the player's own client
  file read at runtime, or the log. The one external artifact consulted was the source's published
  model, and it is *transcribed as labeled constants*, not fetched at runtime.
* **No redistribution of client data.** Nothing derived from `spells_us.txt` is committed, in this
  branch or ever — the standing rule, and the reason every test here is hand-authored.
* **No invented stacking verdict.** With no client table the surface flags shared stats and says what
  it cannot answer (§3.3). It never guesses.
* **No AA, no stance, no crit modelling.** The source says AAs and stances further modify mana costs;
  this app models none of them and will say its figures are directional, the way `spellMetrics.ts`
  already does.
* **No merchant/vendor data** (§4.4).
