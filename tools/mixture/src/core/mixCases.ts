/** Cells in each piece a Mix case may use: 2×4, 2×3, 2×2, 2×1 (a Side's width by its rows) and 1×1. */
export const PIECE_SIZES = [8, 6, 4, 2, 1] as const

const SIZE = 4
const SIDE_WIDTH = SIZE / 2
const PER_SIDE = SIDE_WIDTH * SIZE

export interface MixCase {
  /** Cells per Plan colour, largest first. */
  sizes: number[]
  /** Rows of indexes into `sizes`, row 0 at the top. */
  cells: number[][]
}

/**
 * Cells the largest colour can take across both Sides: the whole left one and a 2×4, 2×3 or 2×2
 * piece at the top of the right. Only from 75% up: a Dominant Plan colour takes exactly the left Side.
 */
const SPANNING_SIZES = [16, 14, 12] as const

/** Every 4×4 Mix case with up to `maxColours` Plan colours, fewest colours first. */
export function mixCases(maxColours: number): MixCase[] {
  const cases: MixCase[] = []
  for (const largest of [...SPANNING_SIZES, ...PIECE_SIZES]) {
    for (const rest of partitions(SIZE * SIZE - largest, Math.min(largest, PER_SIDE))) {
      const sizes = [largest, ...rest]
      const cells = sizes.length <= maxColours ? layoutCase(sizes) : null
      if (cells) cases.push({ sizes, cells })
    }
  }
  // A stable sort keeps the larger pieces first among cases with as many colours.
  return cases.sort((a, b) => a.sizes.length - b.sizes.length)
}

/**
 * Places each colour, largest first, whole in the left Side if it still fits there, otherwise in
 * the right; returns null when neither has room. Only the largest can be bigger than a Side: it
 * takes the whole left Side and the rest at the top of the right. Each Side fills row by row from
 * its top-left, so the even pieces take whole rows and two 1×1 pieces share one.
 */
export function layoutCase(sizes: number[]): number[][] | null {
  const cells = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(-1))
  const used = [0, 0]
  const place = (colour: number, side: number, size: number) => {
    for (let i = used[side]!; i < used[side]! + size; i++) cells[Math.floor(i / SIDE_WIDTH)]![side * SIDE_WIDTH + (i % SIDE_WIDTH)] = colour
    used[side]! += size
  }
  for (const [colour, size] of sizes.entries()) {
    if (colour === 0 && size > PER_SIDE) {
      place(colour, 0, PER_SIDE)
      place(colour, 1, size - PER_SIDE)
      continue
    }
    const side = used.findIndex((n) => n + size <= PER_SIDE)
    if (side < 0) return null
    place(colour, side, size)
  }
  return cells
}

/** Every way to write `total` as piece sizes no bigger than `max`, largest first. */
export function* partitions(total: number, max: number): Generator<number[]> {
  if (total === 0) {
    yield []
    return
  }
  for (const size of PIECE_SIZES) {
    if (size > Math.min(total, max)) continue
    for (const rest of partitions(total - size, size)) yield [size, ...rest]
  }
}
