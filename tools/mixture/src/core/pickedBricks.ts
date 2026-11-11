import { generateBrick, type BrickGrid, type BrickSettings } from './brick'
import type { PlanType } from './planTypes'
import type { BrickGridSide, PresetBrick } from '@/vendor/fnm-core/preset'
// Written by `npm run bricks:pick` from each exported Plan type's Strategy; `npm run bricks:check`
// fails when it no longer matches what the rule picks. Not edited by hand.
import STORED from './pickedBricks.json'

/** The sides of the four square Brick grids a Plan type's Brick goes to the Bricks page in Figma on. */
export const SQUARE_SIDES: readonly BrickGridSide[] = [2, 4, 8, 16]

/** A square Brick grid as the stored file and the Figma size variants name it. */
export type SquareGrid = '2x2' | '4x4' | '8x8' | '16x16'

export const squareGrid = (side: BrickGridSide) => `${side}x${side}` as SquareGrid

/** A Brick the rule picked: the settings and seed that redraw it, its largest Block in cells, and whether that meets the Initial Cost target exactly or is only the nearest found. */
export type PickedBrick = Omit<PresetBrick, 'id'>

/** Every exported Plan type's picked Brick on each square Brick grid, by Plan type id. */
export type PickedBricks = Record<string, Record<SquareGrid, PickedBrick>>

/**
 * The stored Brick of an exported Plan type for a Brick grid. A portrait Brick grid takes the
 * Brick of the square one of the same width (4×6 from 4×4, 8×12 from 8×8). Undefined for a Plan
 * type with no stored Brick.
 */
export function pickedBrick(planTypeId: string, grid: BrickGrid): PickedBrick | undefined {
  return (STORED as unknown as Partial<PickedBricks>)[planTypeId]?.[`${grid.cols}x${grid.cols}` as SquareGrid]
}

/**
 * The settings a Plan type's Brick is drawn with on a Brick grid: the stored Brick the rule picked
 * for an exported Plan type, the hand-set Brick for one that is not.
 */
export function planTypeBrick(type: Pick<PlanType, 'id' | 'collection' | 'brick'>, grid: BrickGrid): BrickSettings | undefined {
  return type.collection === undefined ? type.brick : pickedBrick(type.id, grid)
}

/** A Plan type's Brick on a Brick grid as rows of filled cells, row 0 at the top; undefined when it has no Brick there. */
export function planTypeBrickCells(type: Pick<PlanType, 'id' | 'collection' | 'brick'>, grid: BrickGrid): boolean[][] | undefined {
  const brick = planTypeBrick(type, grid)
  return brick && generateBrick(brick, grid)
}

/** Picked Bricks written out as `pickedBricks.json` is: one line per Plan type and Brick grid, so a changed Brick diffs as one line. */
export function pickedBricksJson(picked: PickedBricks): string {
  const brick = (b: PickedBrick) =>
    `{ "family": "${b.family}", "slope": "${b.slope}", "blockCount": ${b.blockCount}, "guidance": ${b.guidance}, "cornerMeetLimit": ${b.cornerMeetLimit}, "seed": ${JSON.stringify(b.seed)}, "largestBlock": { "w": ${b.largestBlock.w}, "h": ${b.largestBlock.h} }, "exact": ${b.exact} }`
  const planTypes = Object.entries(picked).map(([id, grids]) => {
    const lines = SQUARE_SIDES.map(squareGrid).map((grid) => `    "${grid}": ${brick(grids[grid])}`)
    return `  ${JSON.stringify(id)}: {\n${lines.join(',\n')}\n  }`
  })
  return `{\n${planTypes.join(',\n')}\n}\n`
}
