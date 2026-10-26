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

const ALL_CASES = mixCases(SIZE * SIZE)

/**
 * The Mix case closest to `values`, ranked largest first: one with as many colours, the largest
 * held to the Dominant Plan colour rule (exactly the left Side from 50% to 75%, no more than a Side
 * below 75%), equal values kept as equal pieces, then the least squared gap between each colour's
 * cells and its share of 16. Returns the case and its number on the Mix cases page.
 */
export function nearestMixCase(values: number[]): { mixCase: MixCase; number: number } {
  const total = values.reduce((a, b) => a + b, 0)
  const exact = values.map((v) => (v / total) * SIZE * SIZE)
  const top = values[0]! / total
  const fits = (sizes: number[]) => (top > 0.5 && top < 0.75 ? sizes[0] === PER_SIDE : top < 0.75 ? sizes[0]! <= PER_SIDE : true)
  const keepsTies = (sizes: number[]) => sizes.every((s, i) => i === 0 || values[i] !== values[i - 1] || s === sizes[i - 1])
  const same = ALL_CASES.filter((c) => c.sizes.length === values.length)
  // A rule no case can meet (a Dominant Plan colour among ten or more colours) is dropped.
  const narrowed = [fits, keepsTies].reduce((cases, rule) => {
    const kept = cases.filter((c) => rule(c.sizes))
    return kept.length ? kept : cases
  }, same)
  const gap = (c: MixCase) => c.sizes.reduce((a, s, i) => a + (s - exact[i]!) ** 2, 0)
  const best = narrowed.reduce((a, b) => (gap(b) < gap(a) ? b : a))
  return { mixCase: best, number: ALL_CASES.indexOf(best) + 1 }
}

const CASE_VALUE_ATTEMPTS = 200

/**
 * Random Plan values in percent, largest first, that `nearestMixCase` snaps back to `mixCase`.
 * Each colour's share is drawn up to 40% either side of its piece, and draws that land on
 * another case are tried again; past every attempt, the case's exact shares.
 */
export function caseValues(mixCase: MixCase, rng: () => number): number[] {
  const sameCase = (values: number[]) => nearestMixCase(values).mixCase.sizes.join() === mixCase.sizes.join()
  for (let attempt = 0; attempt < CASE_VALUE_ATTEMPTS; attempt++) {
    const drawn = mixCase.sizes.map((size) => size * (0.6 + 0.8 * rng()))
    const total = drawn.reduce((a, b) => a + b, 0)
    const values = drawn.map((v) => Math.round((v / total) * 10000) / 100).sort((a, b) => b - a)
    if (sameCase(values)) return values
  }
  return mixCase.sizes.map((size) => (size / (SIZE * SIZE)) * 100)
}
