// tradeskills/ItemPlanTree.tsx — "What it takes" for a planned item: the recipe's materials as a
// tree, each made material opened to its own recipe down to the leaves
// (shared/tradeskillPlan.ts `planTree`: depth-limited, loop-guarded, the guide's materials where
// the wiki lists none).
//
// Every item is the section's standard item link. A leaf says where it comes from with the recipe
// panel's own lines (`RecipePanel.WhereCell`): the wiki's source words, drop mobs and zones,
// forage zones, the player's last merchant and price, the guide's merchant with zone and loc. A
// made material can be closed ("get it instead") and opened again; the choice is the plan's.

import type { JSX } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { guideMaterialTail } from '@shared/tradeskillGuide'
import {
  PLAN_GUIDE_MATERIALS_TEXT,
  PLAN_NO_MATERIALS_TEXT,
  closedText,
  madeWithText,
  type PlanNode,
  type PlanRecipe
} from '@shared/tradeskillPlan'
import { CellLink } from '../../lib/CellLink'
import { GuideSourceLine, Have } from './MaterialWhere'
import { WhereCell } from './RecipePanel'
import { ItemLabel } from './tradeskillLinks'
import { WikiGapLine } from './WikiGap'

/** Material, Need, Have, Where: the recipe panel's columns. */
const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 2fr) 44px 44px minmax(0, 3fr)',
  columnGap: 1.5,
  alignItems: 'start',
  py: 0.25
} as const

/** Closes a made material (the reader gets it instead) or opens it again. */
export type SetClosed = (key: string, closed: boolean) => void

/** A material's name: the standard item link, or the guide's own words when they name no wiki item. */
function NodeName({ node }: { node: PlanNode }): JSX.Element {
  const tail = node.guide !== null ? guideMaterialTail(node.guide) : node.returned ? ' (returned)' : ''
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      {node.linked ? <ItemLabel name={node.name} /> : <Typography variant="body2">{node.name}</Typography>}
      {tail !== '' && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, flexShrink: 0 }}>
          {tail}
        </Typography>
      )}
    </Box>
  )
}

/** A leaf's sources, and why it is a leaf when some recipe makes it. */
function LeafWhere({ node, setClosed }: { node: PlanNode; setClosed: SetClosed }): JSX.Element {
  const why = closedText(node)
  return (
    <Box sx={{ minWidth: 0 }}>
      {node.linked && <WhereCell ingredient={node.ingredient} own={node.guide ?? undefined} />}
      {!node.linked && node.guide !== null && <GuideSourceLine source={node.guide.source} />}
      {why !== '' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-plan-closed">
          {why}{' '}
          {node.closed === 'reader' && (
            <span data-testid="tradeskill-plan-make">
              <CellLink
                text="Make it instead"
                onOpen={() => {
                  setClosed(node.key, false)
                }}
              />
            </span>
          )}
        </Typography>
      )}
    </Box>
  )
}

/** A made material's line: which recipe is opened under it, and the way to close it. */
function MadeWhere({ node, setClosed }: { node: PlanNode; setClosed: SetClosed }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', minWidth: 0 }} data-testid="tradeskill-plan-made-with">
      {madeWithText(node)}
      {' · '}
      <span data-testid="tradeskill-plan-get">
        <CellLink
          text="Get it instead"
          onOpen={() => {
            setClosed(node.key, true)
          }}
        />
      </span>
    </Typography>
  )
}

function NodeRow({ node, setClosed }: { node: PlanNode; setClosed: SetClosed }): JSX.Element {
  return (
    <>
      <Box sx={GRID_SX} data-testid="tradeskill-plan-node" data-made={node.made !== null}>
        <NodeName node={node} />
        <Typography variant="body2" align="right">
          {node.qty}
        </Typography>
        {node.linked ? <Have ingredient={node.ingredient} /> : <span />}
        {node.made === null ? <LeafWhere node={node} setClosed={setClosed} /> : <MadeWhere node={node} setClosed={setClosed} />}
      </Box>
      {node.made !== null && (
        <Box sx={{ ml: 1.5, pl: 1.5, my: 0.5, borderLeft: 2, borderColor: 'divider' }} data-testid="tradeskill-plan-sub">
          <Materials plan={node.made} setClosed={setClosed} />
        </Box>
      )}
    </>
  )
}

/** One recipe's materials, each with its own recipe opened under it. */
function Materials({ plan, setClosed }: { plan: PlanRecipe; setClosed: SetClosed }): JSX.Element {
  if (plan.from === 'none') {
    return (
      <>
        <Typography variant="body2" color="text.secondary" data-testid="tradeskill-plan-no-materials">
          {PLAN_NO_MATERIALS_TEXT}
        </Typography>
        <WikiGapLine recipe={plan.recipe} />
      </>
    )
  }
  return (
    <>
      {plan.from === 'guide' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-plan-guide-materials">
          {PLAN_GUIDE_MATERIALS_TEXT}
        </Typography>
      )}
      {/* What the wiki page lacks (its materials here, or only its trivial), with the page to add it on. */}
      <WikiGapLine recipe={plan.recipe} />
      {plan.materials.map((node) => (
        <NodeRow key={node.id} node={node} setClosed={setClosed} />
      ))}
    </>
  )
}

function ColumnHeads(): JSX.Element {
  return (
    <Box sx={{ ...GRID_SX, color: 'text.secondary', borderBottom: 1, borderColor: 'divider', mb: 0.5 }}>
      <Typography variant="caption">Material</Typography>
      <Typography variant="caption" align="right">
        Need
      </Typography>
      <Typography variant="caption" align="right">
        Have
      </Typography>
      <Typography variant="caption">Where it comes from</Typography>
    </Box>
  )
}

/** Must sit inside a `FactsProvider`: the Have and Where cells read the section's facts. */
export function ItemPlanTree({ tree, setClosed }: { tree: PlanRecipe; setClosed: SetClosed }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }} data-testid="tradeskill-plan-tree">
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        What it takes
      </Typography>
      <ColumnHeads />
      <Materials plan={tree} setClosed={setClosed} />
    </Paper>
  )
}
