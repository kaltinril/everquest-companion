// spells/SpellLoadoutView.tsx — WHAT SHOULD I HAVE UP
// (docs/plans/spell-upgrades-and-loadout.md §4.3).
//
// The fork user's question 1, verbatim: *"allow the person to know the best set of buff spells they
// can use given their combined classes to maximize stats/resists/hp/atk/etc"*.
//
// ── REJECTED BUFFS STAY ON SCREEN, AND THAT IS THE FEATURE ────────────────────────────────────
//
// A recommender that silently drops things teaches nobody anything, and the interesting half of a
// conflict is not "these two collide" - it is WHAT THE LOSER WAS CARRYING THAT THE WINNER IS NOT.
// The fork user's own example is exactly that shape: Spirit of Bih`Li grants movement speed AND
// `Increase Attack by 15`, so taking Spirit of Wolf over it silently costs the ATK. So every
// rejection names its winner and lists what it took with it.
//
// ── AND THE PANEL SAYS HOW SURE IT IS ─────────────────────────────────────────────────────────
//
// `exact` means the player's own `spells_us.txt` answered and the verdicts are the game's rules.
// `flagged` means there is no client file, so two spells were called conflicting because they state
// the SAME STAT in the committed catalog - a true statement about the wiki's own words, and NOT a
// stacking verdict. It cannot say which wins, cannot see a blocking directive, does not know a bard
// song stacks alongside a spell, and will flag pairs the game runs together happily. Printing that
// distinction is the difference between a useful tool and a confident wrong one.
//
// NOTHING HERE FILTERS OR SORTS (ruling 4): `loadoutCandidates` and `buildLoadout` do all of it.

import { type JSX, useMemo } from 'react'
import { Alert, Box, Chip, Divider, Stack, Typography } from '@mui/material'
import { spellStatText } from '@shared/spellStats'
import {
  DEFAULT_STAT_WEIGHTS,
  buildLoadout,
  loadoutCandidates,
  type LoadoutCandidate,
  type LoadoutRejection
} from '@shared/spellLoadout'
import type { CharacterSnap } from '@shared/characterTypes'
import { useCurrentComboClasses, useLevelUnlocks } from '../leveling/useLevelUnlocks'
import { useModule } from '../../lib/useModule'
import { SpellTooltip } from '../../lib/SpellCard'
import { Tooltip } from '../../lib/Tooltip'
import { useLoadoutViews } from './useLoadoutViews'

/** A player has eight gems. The set never trims to fit; it reports what it wants. */
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

/** One buff in the recommended set. */
function KeepRow({ c }: { c: LoadoutCandidate }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="baseline"
      useFlexGap
      flexWrap="wrap"
      data-testid="loadout-keep"
      data-spell={c.name}
      sx={{ py: 0.25 }}
    >
      <SpellTooltip name={c.name} placement="right">
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {c.name}
        </Typography>
      </SpellTooltip>
      {c.grants.map((g, i) => (
        <Chip
          key={`${g.key}-${String(i)}`}
          size="small"
          variant="outlined"
          label={spellStatText(g)}
          sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
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
      alignItems="baseline"
      useFlexGap
      flexWrap="wrap"
      data-testid="loadout-rejected"
      data-spell={r.name}
      sx={{ py: 0.25, opacity: 0.85 }}
    >
      <SpellTooltip name={r.name} placement="right">
        <Typography variant="body2">{r.name}</Typography>
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
              sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
            />
          ))}
        </>
      )}
    </Stack>
  )
}

/**
 * THE HEADER, AND THE SENTENCE THAT DECIDES WHETHER THIS TAB IS HONEST.
 *
 * `exact` and `flagged` are not two shades of the same answer, so they do not get two shades of the
 * same sentence. The flagged one says plainly that it is a statement about the catalog's words and
 * not a stacking verdict, because a reader who took it for one would drop buffs the game is happy
 * to run together.
 */
function SetHeader({ certainty, classes }: { certainty: 'exact' | 'flagged'; classes: string }): JSX.Element {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h6">Buff set</Typography>
        <Chip
          size="small"
          data-testid="loadout-certainty"
          data-certainty={certainty}
          color={certainty === 'exact' ? 'success' : 'default'}
          variant="outlined"
          label={certainty}
        />
        <Typography variant="caption" color="text.secondary">
          {classes}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {certainty === 'exact'
          ? "Conflicts are the game's own rules, read from your EverQuest spell file."
          : 'Without your EverQuest spell file these are spells that state the SAME stat, which is not a stacking verdict - the game may well run some of them together. Which one wins needs that file.'}
      </Typography>
    </Box>
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
    <Stack spacing={2} sx={{ maxWidth: 900 }} data-testid="spell-loadout-view">
      <SetHeader certainty={set.certainty} classes={combo.resolved.join(' / ')} />

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
              <Tooltip title="You have eight gems. This set is not trimmed to fit: which of them to carry is your call.">
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  data-testid="loadout-over-gems"
                  label={`more than ${String(GEMS)} gems`}
                  sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
                />
              </Tooltip>
            )}
            {/* A set that might not be the best set must never be presented as one. */}
            {!set.provenOptimal && (
              <Tooltip title="One group of conflicting buffs was too large to search exhaustively, so this is a good answer rather than a proven best one.">
                <Chip
                  size="small"
                  variant="outlined"
                  data-testid="loadout-not-proven"
                  label="not proven best"
                  sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
                />
              </Tooltip>
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
    </Stack>
  )
}
