// tradeskills/ItemPlanTree.tsx — "What it takes" for a planned item: the recipe's materials as a
// tree (shared/tradeskillPlan.ts `planTree`: depth-limited, loop-guarded, the guide's materials
// where the wiki lists none).
//
// A material a recipe makes has an arrow that shows its own materials, whether or not it can also
// be bought (owner, 2026-11-21: "always show how to make something"); a bought one keeps its source
// lines. The materials start hidden (owner, 2026-11-20: "can we get collapsing on these things so i
// don't have to look at 400 indented sub-items?"), and "What to gather" below adds up the whole tree.
//
// Every row is the shared material table (`materialGrid`): nesting indents the name only, so Need,
// Have and Where stay in their columns at any depth.
//
// Every item is the section's standard item link. A leaf says where it comes from with the recipe
// panel's own lines (`RecipePanel.WhereCell`): the wiki's source words, drop mobs and zones,
// forage zones, the player's last merchant and price, the guide's merchant with zone and loc.

import type { JSX } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { guideMaterialTail } from '@shared/tradeskillGuide'
import { closedText, madeWithText, type PlanNode, type PlanRecipe } from '@shared/tradeskillPlan'
import { DEPTH_INDENT, GRID_SX, NAME_INDENT, NUMBER_SX, OPEN_COL, ROW_SX, WHERE_SX, nameCell } from './materialGrid'
import { GuideSourceLine, Have, MATERIAL_LINE } from './MaterialWhere'
import { OpenToggle, WhereCell } from './RecipePanel'
import { ItemLabel } from './tradeskillLinks'
import { WikiGapLine } from './WikiGap'

/** What the reader can change in the tree. */
export interface TreeControls {
  /** Item keys of the made materials whose own materials are showing. */
  expanded: ReadonlySet<string>
  setExpanded: (key: string, open: boolean) => void
}

/** A material's name: the standard item link, or the guide's own words when they name no wiki item. */
function NodeName({ node }: { node: PlanNode }): JSX.Element {
  const tail = node.guide !== null ? guideMaterialTail(node.guide) : node.returned ? ' (returned)' : ''
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      {node.linked ? <ItemLabel name={node.name} /> : <Typography variant="body2">{node.name}</Typography>}
      {tail !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5, flexShrink: 0 }}>
          {tail}
        </Typography>
      )}
    </Box>
  )
}

/** A leaf's sources, and why it is a leaf when some recipe makes it. */
function LeafWhere({ node }: { node: PlanNode }): JSX.Element {
  const why = closedText(node)
  return (
    <Box sx={{ minWidth: 0 }}>
      {node.linked && <WhereCell ingredient={node.ingredient} own={node.guide ?? undefined} />}
      {!node.linked && node.guide !== null && <GuideSourceLine source={node.guide.source} />}
      {why !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-plan-closed">
          {why}
        </Typography>
      )}
    </Box>
  )
}

/** A made material's line: which recipe is under its arrow, after its source lines when it can be bought. */
function MadeWhere({ node }: { node: PlanNode }): JSX.Element {
  return (
    <Box sx={{ minWidth: 0 }}>
      {node.bought && <WhereCell ingredient={node.ingredient} own={node.guide ?? undefined} />}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', minWidth: 0 }} data-testid="tradeskill-plan-made-with">
        {madeWithText(node)}
      </Typography>
    </Box>
  )
}

function NodeRow({ node, depth, controls }: { node: PlanNode; depth: number; controls: TreeControls }): JSX.Element {
  const showing = node.made !== null && controls.expanded.has(node.key)
  return (
    <>
      <Box sx={ROW_SX} data-testid="tradeskill-plan-node" data-made={node.made !== null}>
        <Box sx={nameCell(depth)}>
          {node.made === null ? (
            <Box sx={{ width: OPEN_COL, flexShrink: 0 }} />
          ) : (
            <OpenToggle
              open={showing}
              name={node.name}
              onToggle={() => {
                controls.setExpanded(node.key, !showing)
              }}
            />
          )}
          <NodeName node={node} />
        </Box>
        <Typography variant="body2" align="right" sx={NUMBER_SX}>
          {node.qty}
        </Typography>
        {node.linked ? <Have ingredient={node.ingredient} line={MATERIAL_LINE} /> : <span />}
        <Box sx={WHERE_SX}>
          {node.made === null ? <LeafWhere node={node} /> : <MadeWhere node={node} />}
        </Box>
      </Box>
      {showing && node.made !== null && (
        <Box data-testid="tradeskill-plan-sub">
          <Materials plan={node.made} depth={depth + 1} controls={controls} />
        </Box>
      )}
    </>
  )
}

/** One recipe's materials, each made one with its own recipe under its arrow. */
function Materials({ plan, depth, controls }: { plan: PlanRecipe; depth: number; controls: TreeControls }): JSX.Element {
  const gapIndent = { pl: `${String(depth * DEPTH_INDENT)}px` }
  if (plan.from === 'none') {
    // One line: neither the wiki page nor the guide lists materials, and the page is where to add them.
    return (
      <Box sx={gapIndent} data-testid="tradeskill-plan-no-materials">
        <WikiGapLine recipe={plan.recipe} note="guideNone" />
      </Box>
    )
  }
  return (
    <>
      {/* What the wiki page lacks (its materials, or only its trivial), with the page to add it on. Where the
          materials under it are the guide's, the same line says so (`data-guide` on it): never a second line. */}
      <Box sx={gapIndent}>
        <WikiGapLine recipe={plan.recipe} />
      </Box>
      {plan.materials.map((node) => (
        <NodeRow key={node.id} node={node} depth={depth} controls={controls} />
      ))}
    </>
  )
}

function ColumnHeads(): JSX.Element {
  return (
    <Box sx={{ ...GRID_SX, color: 'text.secondary', py: 0.25 }}>
      <Typography variant="caption" sx={{ pl: `${String(NAME_INDENT)}px` }}>
        Material
      </Typography>
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
export function ItemPlanTree({ tree, controls }: { tree: PlanRecipe; controls: TreeControls }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }} data-testid="tradeskill-plan-tree">
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        What it takes
      </Typography>
      <ColumnHeads />
      <Materials plan={tree} depth={0} controls={controls} />
    </Paper>
  )
}
