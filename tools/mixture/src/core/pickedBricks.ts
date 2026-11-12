import { BRICK_FAMILY_LABELS, SLOPE_LABELS, generateBrick, type BrickGrid, type BrickSettings } from './brick'
import { everyJsonField } from './jsonLine'
import { isExported, type PlanType } from './planTypes'
import type { BrickGridSide, PresetBrick } from '@/vendor/fnm-core/preset'
// Written by `npm run bricks:pick` from each exported Plan type's Strategy; `npm run bricks:check`
// fails when it no longer matches what the rule picks. Not edited by hand.
import STORED from './pickedBricks.json'

/** The sides of the four square Brick grids a Plan type's Brick goes to the Bricks page in Figma on. */
export const SQUARE_SIDES: readonly BrickGridSide[] = [2, 4, 8, 16]

/** The key the stored file and the Figma size variants name a square Brick grid by. */
export type SquareGridKey = '2x2' | '4x4' | '8x8' | '16x16'

/** The key of the square Brick grid of `side` cells: `'4x4'` for 4. Not a Brick grid: `squareBrickGrid` gives that. */
export const squareGridKey = (side: BrickGridSide) => `${side}x${side}` as SquareGridKey

/** A Brick the rule picked, as it is stored: the settings and seed that redraw it, its largest Block in cells, and whether that meets the Initial Cost target exactly or is only the nearest found. */
export type PickedBrick = Omit<PresetBrick, 'id'>

/** Every exported Plan type's Brick on each square Brick grid, as the rule picked it, by Plan type id. */
export type PickedBricks = Record<string, Record<SquareGridKey, PickedBrick>>

/**
 * The stored Brick of an exported Plan type for a Brick grid. A portrait Brick grid takes the
 * Brick of the square one of the same width (4×6 from 4×4, 8×12 from 8×8). Undefined for a Plan
 * type with no stored Brick.
 */
export function pickedBrick(planTypeId: string, grid: BrickGrid): PickedBrick | undefined {
  const side = SQUARE_SIDES.find((s) => s === grid.cols)
  return side && (STORED as unknown as Partial<PickedBricks>)[planTypeId]?.[squareGridKey(side)]
}

/**
 * The settings a Plan type's Brick is drawn with on a Brick grid: the stored Brick for an exported
 * Plan type, the hand-set Brick for one that is not.
 */
export function planTypeBrick(type: Pick<PlanType, 'id' | 'collection' | 'strategy' | 'brick'>, grid: BrickGrid): BrickSettings | undefined {
  return isExported(type) ? pickedBrick(type.id, grid) : type.brick
}

/** A Plan type's Brick on a Brick grid as rows of filled cells, row 0 at the top; undefined when it has no Brick there. */
export function planTypeBrickCells(type: Pick<PlanType, 'id' | 'collection' | 'strategy' | 'brick'>, grid: BrickGrid): boolean[][] | undefined {
  const brick = planTypeBrick(type, grid)
  return brick && generateBrick(brick, grid)
}

/**
 * A stored Brick read out for the Bricks tab, for the Brick grid it is drawn on. On a square Brick
 * grid: its Brick family, its Slope, its largest Block and whether that meets the Initial Cost
 * target. A portrait Brick grid draws a different Brick from the same settings, and the largest
 * Block and the target were measured on the square one, so both are left out there and the line
 * says which Brick grid the settings are of.
 */
export function storedBrickLine(brick: PickedBrick, grid: BrickGrid): string {
  const measured = grid.rows === grid.cols
  const parts = [
    BRICK_FAMILY_LABELS[brick.family],
    SLOPE_LABELS[brick.slope],
    ...(measured
      ? [`largest Block ${brick.largestBlock.w}×${brick.largestBlock.h}`, brick.exact ? 'meets the Initial Cost target' : 'nearest to the Initial Cost target']
      : [`settings of the ${grid.cols}×${grid.cols} Brick grid`]),
  ]
  return `Brick from the Strategy: ${parts.join(' · ')}`
}

/** A stored Brick's fields in the order `pickedBricks.json` writes them. */
const BRICK_FIELDS = ['family', 'slope', 'blockCount', 'guidance', 'cornerMeetLimit', 'seed', 'largestBlock', 'exact'] as const satisfies readonly (keyof PickedBrick)[]

/**
 * Bricks the rule picked, written out as `pickedBricks.json` is: one line per Plan type and Brick
 * grid, so a changed Brick diffs as one line. It throws, naming the Plan type and the Brick grid,
 * when a Brick has a field that is not in `BRICK_FIELDS`.
 */
export function pickedBricksJson(picked: PickedBricks): string {
  const planTypes = Object.entries(picked).map(([id, grids]) => {
    const lines = SQUARE_SIDES.map(squareGridKey).map((grid) => `    "${grid}": { ${everyJsonField(grids[grid], BRICK_FIELDS, `The Brick of ${id} on ${grid}`)} }`)
    return `  ${JSON.stringify(id)}: {\n${lines.join(',\n')}\n  }`
  })
  return `{\n${planTypes.join(',\n')}\n}\n`
}
