import { planTypeBrickCells, SQUARE_SIDES, squareGrid, type SquareGrid } from './pickedBricks'
import { exportedPlanTypes, type PlanType } from './planTypes'

/** The side in px of the frame every Brick is drawn in on the Bricks page in Figma. */
const FRAME = 24

/** One exported Plan type's Brick on one square Brick grid, as a vector for its Figma component. */
export interface BrickVector {
  /** The Brick's outline (see `brickOutline`). */
  path: string
  /** The box the outline takes up on the frame, in px from the frame's top left. */
  bounds: { x: number; y: number; width: number; height: number }
  /** The Brick's cells, row 0 first: `#` filled, `.` empty. What filling `path` on the Brick grid gives back. */
  cells: string[]
}

/** Every exported Plan type's Brick as vectors, by Figma component set name (`Brick/<Plan type name>`) in the order of the Bricks page, then by size. */
export interface BrickVectors {
  /** The side in px of the frame every `path` and `bounds` is measured in. */
  frame: number
  bricks: Record<string, Record<SquareGrid, BrickVector>>
}

/**
 * The vectors of every exported Plan type's stored Brick on the four square Brick grids. It only
 * redraws what `pickedBricks.json` stores, and throws when an exported Plan type has no Brick
 * there or shares its name with another.
 */
export function brickVectors(types: PlanType[]): BrickVectors {
  const bricks: BrickVectors['bricks'] = {}
  const named = new Map<string, string>()
  for (const type of exportedPlanTypes(types)) {
    const twin = named.get(type.name)
    if (twin !== undefined) throw new Error(`Two exported Plan types are named ${type.name} (${twin} and ${type.id}): each needs its own Figma component, Brick/<name>.`)
    named.set(type.name, type.id)
    const sizes = {} as Record<SquareGrid, BrickVector>
    for (const side of SQUARE_SIDES) {
      const cells = planTypeBrickCells(type, { cols: side, rows: side })
      if (!cells) throw new Error(`No stored Brick for ${type.name} (${type.id}) on ${squareGrid(side)}: run \`npm run bricks:pick\` first.`)
      const loops = outlineLoops(cells)
      const xs = loops.flatMap((loop) => loop.map(([x]) => x))
      const ys = loops.flatMap((loop) => loop.map(([, y]) => y))
      const [x, y] = [Math.min(...xs), Math.min(...ys)]
      sizes[squareGrid(side)] = {
        path: pathData(loops),
        bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
        cells: cells.map((row) => row.map((on) => (on ? '#' : '.')).join('')),
      }
    }
    bricks[`Brick/${type.name}`] = sizes
  }
  return { frame: FRAME, bricks }
}

// Right, down, left, up: clockwise on the frame, where y runs down.
const STEPS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const

/**
 * A Brick's outline as SVG path data on the 24×24 frame: the edge of its filled cells taken
 * together, so no line runs between two filled cells, with a point only where the outline turns.
 * `cells` are rows of filled cells, row 0 at the top.
 */
export function brickOutline(cells: boolean[][]): string {
  return pathData(outlineLoops(cells))
}

type Point = [x: number, y: number]

const pathData = (loops: Point[][]) => loops.map((loop) => `M ${loop.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`).join(' ')

/** The loops of a Brick's outline as the points where each turns, in px on the frame: clockwise around filled cells, the other way around a hole, each from its top-left point, top-left loop first. */
function outlineLoops(cells: boolean[][]): Point[][] {
  const rows = cells.length
  const cols = cells[0]?.length ?? 0
  const filled = (r: number, c: number) => cells[r]?.[c] === true
  const at = (x: number, y: number) => y * (cols + 1) + x

  // Each cell line with a filled cell on one side only, as a step that keeps the filled cell on
  // its right: `steps[at(x, y)][d]` leaves the crossing (x, y) of cell lines in direction d.
  const steps = Array.from({ length: (rows + 1) * (cols + 1) }, () => [false, false, false, false])
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!filled(r, c)) continue
      if (!filled(r - 1, c)) steps[at(c, r)]![0] = true
      if (!filled(r, c + 1)) steps[at(c + 1, r)]![1] = true
      if (!filled(r + 1, c)) steps[at(c + 1, r + 1)]![2] = true
      if (!filled(r, c - 1)) steps[at(c, r + 1)]![3] = true
    }

  const drawn = new Set<number>()
  const loops: Point[][] = []
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= cols; x++)
      for (let first = 0; first < 4; first++) {
        if (!steps[at(x, y)]![first] || drawn.has(at(x, y) * 4 + first)) continue
        const points: Point[] = []
        let [px, py, dir, from] = [x, y, first, -1]
        do {
          if (dir !== from) points.push([(px * FRAME) / cols, (py * FRAME) / rows])
          drawn.add(at(px, py) * 4 + dir)
          px += STEPS[dir]![0]
          py += STEPS[dir]![1]
          from = dir
          // Where two filled cells meet only at a corner, two steps leave it: take the one into
          // the other cell, so the loop passes through the corner and both cells are one shape.
          dir = [(from + 3) % 4, from, (from + 1) % 4].find((d) => steps[at(px, py)]![d])!
        } while (px !== x || py !== y || dir !== first)
        loops.push(points)
      }
  return loops
}
