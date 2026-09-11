// spells/SpellItemsSection.tsx — SECTION 7 OF THE SPELL PAGE: what carries this spell
// (docs/plans/spell-upgrades-and-loadout.md §4.4 item 7).
//
// The owner's ask: from a spell, see *"what items contain it for worn, click, focus"*. It is the
// planner's own donor index inverted (`src/main/planner/spellItemIndex.ts`), so this section costs
// no new corpus and cannot disagree with the Exaltation board about what is on an item.
//
// ── GROUPED BY SOCKET, BECAUSE THE SOCKET IS THE QUESTION ─────────────────────────────────────
//
// "What gives me Spirit of Wolf" and "what procs Spirit of Wolf" are different questions with
// different answers, and a flat list ordered by item name interleaves them. The four groups are
// drawn in the order a player cares about them - worn first (it is always on), then click (you
// choose), then focus (it modifies), then proc (it happens to you) - and a group with no rows is
// simply not drawn.
//
// ── AND THE ANSWER TO "WHERE DO I GET THE SPELL ITSELF" IS HONEST SILENCE ─────────────────────
//
// The owner asked for that too, flagging that it may not apply in EQ Legends. MEASURED: the
// committed spell catalog states no vendor, no merchant and no purchase location for any spell -
// there is no field, not an empty one. What this app can honestly answer is the item half above.
// So the section says what it knows and says nothing about vendors, rather than drawing an empty
// "Sold by:" row that would read as "nobody sells it". Merchant data would be a new scrape, and
// that is an owner-and-creator decision this feature does not help itself to.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import type { SpellItemGroup, SpellItemSource } from '@shared/spellDetail'
import type { SocketType } from '@shared/planner/types'
import { Tooltip } from '../../lib/Tooltip'

/**
 * WHAT EACH SOCKET IS CALLED, and what it means in one clause.
 *
 * WORDS ONLY - the ORDER is main's (`planner/spellItemIndex.ts SOCKET_ORDER`) because ruling 4 says
 * a view arrives ordered, and the first cut of this file learned that the hard way: it held the
 * order here and filtered the flat list four times, which is precisely what the domain-munging lint
 * fails the build on. The vocabulary is the wiki's and the Exaltation board's, so a reader moving
 * between the two surfaces meets one set of words.
 */
const SOCKET_WORDS: Record<SocketType, { label: string; hint: string }> = {
  worn: { label: 'Worn', hint: 'always on while the item is equipped' },
  click: { label: 'Click', hint: 'you activate it from the item' },
  focus: { label: 'Focus', hint: 'it modifies the spells you cast' },
  proc: { label: 'Proc', hint: 'it fires on its own in combat' }
}

/** One item. The name is plain text: the Loot drill takes an item KEY and this is a future link. */
function ItemRow({ row }: { row: SpellItemSource }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="baseline"
      data-testid="spell-item"
      data-item={row.name}
      data-socket={row.socket}
      sx={{ py: 0.25 }}
    >
      <Typography variant="body2">{row.name}</Typography>
      {/* THE EFFECT AS THE ITEM WRITES IT, which is not always the spell's own name: a focus row
          carries a rank (`Improved Healing III`) the spell page's title does not, and hiding that
          would make three different items look like three copies of one. */}
      {row.effect !== '' && (
        <Typography variant="caption" color="text.secondary" data-testid="spell-item-effect">
          {row.effect}
        </Typography>
      )}
      {row.detail !== undefined && (
        <Typography variant="caption" color="text.disabled">
          {row.detail}
        </Typography>
      )}
    </Stack>
  )
}

export default function SpellItemsSection({
  sources
}: {
  /** Absent means nobody looked it up; an empty array means the corpus carries none. */
  sources: readonly SpellItemGroup[] | undefined
}): JSX.Element | null {
  // ABSENT AND EMPTY ARE DIFFERENT ANSWERS (law 1). Nothing was looked up -> draw nothing at all,
  // because a section reading "no item carries this" would be a claim nobody made.
  if (sources === undefined) return null
  return (
    <Box data-testid="spell-items-section" data-count={sources.length}>
      <Typography variant="overline" color="text.secondary">
        Items that carry it
      </Typography>
      {sources.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="spell-items-none">
          no item in the catalog carries this spell
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ mt: 0.5 }}>
          {sources.map((group) => (
            <Box key={group.socket} data-testid="spell-item-group" data-socket={group.socket}>
              <Tooltip title={SOCKET_WORDS[group.socket].hint}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${SOCKET_WORDS[group.socket].label} (${String(group.items.length)})`}
                  sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                />
              </Tooltip>
              <Box sx={{ pl: 1, mt: 0.25 }}>
                {group.items.map((r) => (
                  <ItemRow key={`${r.key}-${r.effect}`} row={r} />
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}
