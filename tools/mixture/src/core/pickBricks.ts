import { generateBrick, squareBrickGrid } from './brick'
import { planCover } from './planCovers'
import { exportedPlanTypes, type PlanType } from './planTypes'
import type { PickedBrick } from './pickedBricks'
import { presetBricks, type BrickGridSide } from '@/vendor/fnm-core/preset'

/** What the pick command prints for one Brick grid. */
export interface PickSummary {
  /** Bricks picked: one for each exported Plan type. */
  count: number
  /** Bricks whose largest Block meets the Initial Cost target. */
  exact: number
  /** Different drawings among the Bricks. */
  distinct: number
  /**
   * Bricks of the hanging Brick family. One-time and Dollar Cost Average draw a rising or a
   * hanging Brick alike, so the Strategy does not say how many come out hanging. The prototype
   * reported the number for each Brick grid (issue #15: 15, 16, 13 and 17 of 34 on 2×2 to 16×16),
   * and the pick command prints it to be read against those.
   */
  hanging: number
}

export function pickSummary(bricks: Record<string, PickedBrick>, side: BrickGridSide): PickSummary {
  const picked = Object.values(bricks)
  const drawings = picked.map((brick) => JSON.stringify(generateBrick(brick, squareBrickGrid(side))))
  return {
    count: picked.length,
    exact: picked.filter((brick) => brick.exact).length,
    distinct: new Set(drawings).size,
    hanging: picked.filter((brick) => brick.family === 'hanging').length,
  }
}

/**
 * The Brick of each exported Plan type on the square Brick grid of `side` cells, by Plan type id,
 * picked from its Strategy by the Pattern Builder's rule. The Plan types go to the rule in the
 * order of the Bricks page in Figma, each with its Plan Cover where it has one: an earlier one
 * takes a Brick first.
 */
export function pickBricks(types: PlanType[], side: BrickGridSide): Record<string, PickedBrick> {
  const exported = exportedPlanTypes(types)
  const bricks = presetBricks(
    side,
    exported.map((t) => ({ id: t.id, strategy: t.strategy, planCover: planCover(t.id) })),
  )
  return Object.fromEntries(
    exported.map((t, i) => {
      const picked = bricks[i]
      if (!picked) throw new Error(`No Brick for Plan type "${t.name}" (${t.id}) on the ${side}×${side} Brick grid: its Strategy allows none of the Bricks the rule searches.`)
      const { id: _, ...brick } = picked
      return [t.id, brick]
    }),
  )
}
