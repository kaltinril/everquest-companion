// spells/SpellLoadoutView.tsx — WHAT SHOULD I HAVE UP, AND WHAT SHOULD I HAVE MEMMED
// (docs/plans/spell-upgrades-and-loadout.md §4.3).
//
// The fork user's question 1, verbatim: *"allow the person to know the best set of buff spells they
// can use given their combined classes to maximize stats/resists/hp/atk/etc"*, and his goal 5,
// *"recommend a DMG/combat set"* - which this tab did not answer at all until 2026-09-10, when the
// report was *"loadout tab is ugly, and it's missing the damage set it only shows buff?"*
//
// ── TWO SETS, TWO ENGINES, AND THE SPLIT IS NOT COSMETIC ──────────────────────────────────────
//
// BUFFS are a conflict problem: they occupy slots on your character, they contest each other, and
// the work is deciding which of two that cannot both stand is worth more. `buildLoadout` does that
// against the game's own stacking rules.
//
// DAMAGE spells contest nothing - you cast a nuke and it is gone - so none of that machinery
// applies, and `combatSet` spends eight gems on the Leveling tab's existing ranking instead.
// `shared/spellLoadout.ts` carries both arguments in full.
//
// ── REJECTED BUFFS STAY ON SCREEN, AND THAT IS THE FEATURE ────────────────────────────────────
//
// A recommender that silently drops things teaches nobody anything, and the interesting half of a
// conflict is not "these two collide" - it is WHAT THE LOSER WAS CARRYING THAT THE WINNER IS NOT.
// The fork user's own example is exactly that shape: Spirit of Bih`Li grants movement speed AND
// `Increase Attack by 15`, so taking Spirit of Wolf over it silently costs the ATK. So every
// rejection names its winner and lists what it took with it.
//
// ── AND THE PANEL SAYS HOW SURE IT IS, PER PAIR ───────────────────────────────────────────────
//
// `exact` means the player's own `spells_us.txt` answered and the verdicts are the game's rules.
// `flagged` means it could not, so two spells were called conflicting because they state the SAME
// STAT in the committed catalog - a true statement about the wiki's own words, and NOT a stacking
// verdict. It cannot say which wins, cannot see a blocking directive, does not know a bard song
// stacks alongside a spell, and will flag pairs the game runs together happily.
//
// THE HEADER USED TO PICK ONE OF THOSE WORDS FOR THE WHOLE TAB and picked the weaker one whenever a
// single candidate went unmatched - which on the owner's own trio was 1 name in 76, so every verdict
// on screen was labelled a guess. `LoadoutSet.read` is the tally now and each row carries its own
// pair's tier; the header states the count rather than choosing a word for a mixed answer.
//
// NOTHING HERE FILTERS OR SORTS (ruling 4): `loadoutCandidates`, `buildLoadout` and `combatSet` do
// all of it, in `src/shared`, node-tested and with no React anywhere near them.

import { type JSX, useMemo } from 'react'
import { Alert, Box, Chip, Divider, Stack, Typography } from '@mui/material'
import { spellStatText } from '@shared/spellStats'
import {
  DEFAULT_STAT_WEIGHTS,
  buildLoadout,
  combatSet,
  loadoutCandidates,
  type CombatPick,
  type LoadoutCandidate,
  type LoadoutRejection,
  type LoadoutSet
} from '@shared/spellLoadout'
import { TAB_LABEL, bestSpellsAt, defaultSorts } from '@shared/bestSpells'
import type { CharacterSnap } from '@shared/characterTypes'
import { useCurrentComboClasses, useLevelUnlocks } from '../leveling/useLevelUnlocks'
import { useModule } from '../../lib/useModule'
import { SpellTooltip } from '../../lib/SpellCard'
import SpellIcon from './SpellIcon'
import { useLoadoutViews } from './useLoadoutViews'

/** A player has eight gems. Neither set trims to fit; they report what they want. */
const GEMS = 8

/**
 * The level the magnitudes are read at when the log has not named one.
 *
 * A level-scaling formula needs a caster level to produce a number, and 50 is the cap this server's
 * catalog tops out at - so an unknown level reads a buff at its strongest rather than at its
 * weakest. That errs toward showing a spell at its best, which for a "what should I keep up"
 * recommendation is the direction that misleads least: it never talks a player OUT of a buff on the
 * strength of a figure the app guessed low.
 */
const ASSUMED_LEVEL = 50

/** A chip that fits on a dense line. One style, so a row of them never wobbles. */
const TINY_CHIP = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

/** One buff in the recommended set. */
function KeepRow({ c }: { c: LoadoutCandidate }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      data-testid="loadout-keep"
      data-spell={c.name}
      sx={{ py: 0.35 }}
    >
      <SpellIcon iconId={c.iconId} />
      <SpellTooltip name={c.name} placement="right">
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 170 }}>
          {c.name}
        </Typography>
      </SpellTooltip>
      {c.grants.map((g, i) => (
        <Chip
          key={`${g.key}-${String(i)}`}
          size="small"
          variant="outlined"
          label={spellStatText(g)}
          sx={TINY_CHIP}
        />
      ))}
    </Stack>
  )
}

/** One buff that lost its slot, and what that cost. */
function RejectRow({ r }: { r: LoadoutRejection }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      data-testid="loadout-rejected"
      data-spell={r.name}
      sx={{ py: 0.25, opacity: 0.85 }}
    >
      <SpellTooltip name={r.name} placement="right">
        <Typography variant="body2" sx={{ minWidth: 170 }}>
          {r.name}
        </Typography>
      </SpellTooltip>
      <Typography variant="caption" color="text.secondary" data-testid="loadout-beaten-by">
        {r.certainty === 'exact' ? 'loses its slot to' : 'probably contests'} {r.beatenBy}
      </Typography>
      {/* THE HALF WORTH PRINTING: what you give up by taking the winner. */}
      {r.loses.length > 0 && (
        <>
          <Typography variant="caption" color="warning.main" data-testid="loadout-loses">
            you lose
          </Typography>
          {r.loses.map((g, i) => (
            <Chip
              key={`${g.key}-${String(i)}`}
              size="small"
              color="warning"
              variant="outlined"
              label={spellStatText(g)}
              sx={TINY_CHIP}
            />
          ))}
        </>
      )}
    </Stack>
  )
}

/** A whole number, or the placeholder every figure in this area uses for "the source says nothing". */
function figure(v: number | undefined | null): string {
  return v === undefined || v === null ? '-' : String(Math.round(v))
}

/** One damage spell in the combat set. */
function CombatRow({ p }: { p: CombatPick }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      data-testid="combat-pick"
      data-spell={p.name}
      data-tab={p.tab}
      sx={{ py: 0.35 }}
    >
      <SpellIcon iconId={p.iconId} />
      <SpellTooltip name={p.name} placement="right">
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 170 }}>
          {p.name}
        </Typography>
      </SpellTooltip>
      <Chip size="small" variant="outlined" label={TAB_LABEL[p.tab]} sx={TINY_CHIP} />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {figure(p.metrics.damage)} dmg · {figure(p.metrics.dps)} dps · {figure(p.mana)} mana
      </Typography>
    </Stack>
  )
}

/**
 * THE BUFF HEADER, AND THE SENTENCE THAT DECIDES WHETHER THIS TAB IS HONEST.
 *
 * The three tiers do not get three shades of one sentence. The flagged one says plainly that it is
 * a statement about the catalog's words and not a stacking verdict, because a reader who took it
 * for one would drop buffs the game is happy to run together. The MIXED one says how many of each,
 * which is the honest answer for a set where the client file answered for most and not all.
 */
function SetHeader({ set, classes }: { set: LoadoutSet; classes: string }): JSX.Element {
  const { certainty, read } = set
  const sentence =
    certainty === 'exact'
      ? "Conflicts are the game's own rules, read from your EverQuest spell file."
      : certainty === 'mixed'
        ? `Your EverQuest spell file answered for ${String(read.exact)} of these ${String(read.total)} spells, and those verdicts are the game's own rules. The remaining ${String(read.total - read.exact)} are marked "probably contests": that means only that two spells state the same stat in the catalog, which is not a stacking verdict.`
        : 'Without your EverQuest spell file these are spells that state the SAME stat, which is not a stacking verdict - the game may well run some of them together. Which one wins needs that file.'
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h6">Buff set</Typography>
        <Chip
          size="small"
          data-testid="loadout-certainty"
          data-certainty={certainty}
          color={certainty === 'exact' ? 'success' : certainty === 'mixed' ? 'info' : 'default'}
          variant="outlined"
          label={certainty === 'mixed' ? `${String(read.exact)}/${String(read.total)} exact` : certainty}
          sx={TINY_CHIP}
        />
        <Typography variant="caption" color="text.secondary">
          {classes}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {sentence}
      </Typography>
    </Box>
  )
}

/** The buff half: the set, its two honesty chips, and every rejection with its cost. */
function BuffSection({ set, classes }: { set: LoadoutSet; classes: string }): JSX.Element {
  return (
    <>
      <SetHeader set={set} classes={classes} />
      {set.keep.length === 0 ? (
        <Alert severity="info" data-testid="loadout-empty">
          No buff your classes can cast states a stat this app knows how to value yet.
        </Alert>
      ) : (
        <Box>
          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="overline" color="text.secondary">
              Keep up ({String(set.gems)})
            </Typography>
            {set.gems > GEMS && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                data-testid="loadout-over-gems"
                label={`more than ${String(GEMS)} gems`}
                title="You have eight gems. This set is not trimmed to fit: which of them to carry is your call."
                sx={TINY_CHIP}
              />
            )}
            {/* A set that might not be the best set must never be presented as one. */}
            {!set.provenOptimal && (
              <Chip
                size="small"
                variant="outlined"
                data-testid="loadout-not-proven"
                label="not proven best"
                title="One group of conflicting buffs was too large to search exhaustively, so this is a good answer rather than a proven best one."
                sx={TINY_CHIP}
              />
            )}
          </Stack>
          <Stack>
            {set.keep.map((c) => (
              <KeepRow key={c.name} c={c} />
            ))}
          </Stack>
        </Box>
      )}

      {set.rejected.length > 0 && (
        <>
          <Divider />
          <Box data-testid="loadout-rejections">
            <Typography variant="overline" color="text.secondary">
              Left out, and why
            </Typography>
            <Stack>
              {set.rejected.map((r) => (
                <RejectRow key={r.name} r={r} />
              ))}
            </Stack>
          </Box>
        </>
      )}
    </>
  )
}

export default function SpellLoadoutView(): JSX.Element {
  const data = useLevelUnlocks()
  const combo = useCurrentComboClasses()
  const who = useModule<CharacterSnap>('character')
  // `LevelStatement` is the level plus WHICH line stated it and when; the magnitudes want the
  // number. Absent until the log has seen a level-up or your own `/who` row, which is the ordinary
  // state of a fresh log - see `ASSUMED_LEVEL`.
  const level = who?.level?.level ?? ASSUMED_LEVEL
  const candidates = useMemo(
    () => loadoutCandidates(data.spells, combo.resolved, DEFAULT_STAT_WEIGHTS),
    [data.spells, combo.resolved]
  )
  const names = useMemo(() => candidates.map((c) => c.name), [candidates])
  const views = useLoadoutViews(names)
  const set = useMemo(() => {
    // The views arrive after the candidates do, so the candidate list is rebuilt with them attached
    // rather than the optimizer being asked to reach for a second source.
    const withViews = candidates.map((c) => {
      const view = views.get(c.name)
      return view === undefined ? c : { ...c, view }
    })
    return buildLoadout(withViews, { worn: level, cast: level })
  }, [candidates, views, level])
  // THE COMBAT HALF, over the Leveling tab's own ranking so the two surfaces can never disagree
  // about which nuke is better. `defaultSorts()` is that tab's "best first" on every table.
  const combat = useMemo(() => {
    const best = bestSpellsAt(data, combo, level, { sorts: defaultSorts() })
    return combatSet(best.tabs, GEMS)
  }, [data, combo, level])

  if (combo.resolved.length === 0) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 900 }} data-testid="spell-loadout-view">
        <Typography variant="h6">Loadout</Typography>
        <Alert severity="info" data-testid="loadout-no-combo">
          This tab needs to know which classes you are playing. It fills in once the log has named
          your loadout.
        </Alert>
      </Stack>
    )
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 900, pb: 4 }} data-testid="spell-loadout-view">
      <BuffSection set={set} classes={combo.resolved.join(' / ')} />

      <Divider />

      <Box data-testid="combat-set">
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography variant="h6">Combat set</Typography>
          <Typography variant="caption" color="text.secondary">
            {String(combat.picks.length)} of {String(GEMS)} gems, read at level {String(level)}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Ranked by the Leveling tab, then spent one table at a time: the best nuke, the best damage
          over time and the best area spell before any second pick. Three tables because they answer
          three different fights, and eight of one of them can only fight one.
        </Typography>
        {combat.picks.length === 0 ? (
          <Alert severity="info" data-testid="combat-empty">
            None of your classes has a damage spell this app can put a figure on yet.
          </Alert>
        ) : (
          <Stack>
            {combat.picks.map((p) => (
              <CombatRow key={p.name} p={p} />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}
