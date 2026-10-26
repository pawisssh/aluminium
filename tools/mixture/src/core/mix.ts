import { createRng } from '@/vendor/fnm-core/prng'
import { colourKey, type PlanColour } from './colours'
import { MIX_CASE_COLOURS, nearestMixCase } from './mixCases'

export type MixSize = 4 | 8
export type MixLayout = 'random' | 'ordered'

export interface MixSlice {
  value: number
  colour: PlanColour
}

export interface Mix {
  /** Rows of colour keys (see `colourKey`), row 0 at the top; null where nothing has value. */
  cells: (string | null)[][]
  /** Plan colours left out because there were more colours than cells. */
  hiddenColours: number
  /** The number of the Mix case a 4×4 ordered Mix is drawn from, as on the Mix cases page. */
  mixCase?: number
}

const RANDOM_ATTEMPTS = 50

export function buildMix(slices: MixSlice[], size: MixSize, options: { layout: MixLayout; seed: string }): Mix {
  const ranked = rank(slices)
  if (options.layout === 'ordered' && size === 4 && ranked.length) return caseMix(ranked)
  const { shares, hidden } = allocate(ranked, size * size, options.layout)
  const rng = createRng(options.seed)
  let cells: (string | null)[][] | null = null
  for (let i = 0; options.layout === 'random' && !cells && i < RANDOM_ATTEMPTS; i++) cells = growRegions(shares, size, rng)
  return { cells: cells ?? orderedLayout(shares, size), hiddenColours: hidden }
}

/**
 * Draws a 4×4 ordered Mix from the Mix case nearest the Plan values, so every Plan colour is one
 * 1×1 to 2×4 piece. Past one Plan colour per Mix case colour, only the largest are shown.
 */
function caseMix(ranked: [string, number][]): Mix {
  const kept = ranked.slice(0, MIX_CASE_COLOURS.length)
  const mixCase = nearestMixCase(kept.map(([, value]) => value))
  return { cells: mixCase.cells.map((row) => row.map((i) => kept[i]![0])), hiddenColours: ranked.length - kept.length, mixCase: mixCase.number }
}

/**
 * Lays the colours out in the grid's two Sides. Going down from the second largest, each colour
 * sits whole in the right Side if it still fits there, otherwise in the left; the largest takes
 * the cells left over at the top of both Sides, so it is the only one that can span them. Each
 * Side is filled row by row from its top-left, turning back at the end of each row so every
 * colour stays one edge-joined piece.
 */
function orderedLayout(shares: Share[], size: number): (string | null)[][] {
  const cells: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  const [largest, ...rest] = shares
  if (!largest) return cells
  const width = size / 2
  const perSide = width * size
  const left: Share[] = []
  const right: Share[] = []
  let rightCells = 0
  for (const s of rest) {
    if (rightCells + s.cells <= perSide) {
      right.push(s)
      rightCells += s.cells
    } else left.push(s)
  }
  const keys = (side: Share[], lead: number) => [...Array<string>(lead).fill(largest.key), ...side.flatMap((s) => Array<string>(s.cells).fill(s.key))]
  const spill = perSide - rightCells
  const sides = [keys(left, largest.cells - spill), keys(right, spill)]
  sides.forEach((side, n) =>
    side.forEach((key, i) => {
      const row = Math.floor(i / width)
      cells[row]![n * width + (row % 2 ? width - 1 - (i % width) : i % width)] = key
    }),
  )
  return cells
}

/**
 * Grows each colour, largest first, from a random cell into random neighbours. A cell is only
 * taken if the cells still free stay in one piece, so the colours after it can grow into them;
 * the last colour takes what is left. Returns null when a colour gets boxed in.
 */
function growRegions(shares: Share[], size: number, rng: () => number): (string | null)[][] | null {
  const cells: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  const free = new Set<number>(Array.from({ length: size * size }, (_, i) => i))
  const take = (i: number, key: string) => {
    free.delete(i)
    cells[Math.floor(i / size)]![i % size] = key
  }
  const keepsFreeWhole = (i: number) => {
    free.delete(i)
    const whole = isOnePiece(free, size)
    free.add(i)
    return whole
  }
  // Cells hemmed in by the grid edge or other colours are favoured, so colours hug what is
  // already placed instead of carving holes that box the next ones in.
  const hemmed = (i: number) => 4 - neighbours(i, size).filter((n) => free.has(n)).length
  const pick = (items: number[]): number | undefined => {
    const weights = items.map((i) => 1 + hemmed(i) ** 2)
    let roll = rng() * weights.reduce((a, b) => a + b, 0)
    return items.find((_, k) => (roll -= weights[k]!) < 0) ?? items.at(-1)
  }

  for (const [n, share] of shares.entries()) {
    if (n === shares.length - 1) {
      for (const i of [...free]) take(i, share.key)
      break
    }
    const start = pick([...free].filter(keepsFreeWhole))
    if (start === undefined) return null
    take(start, share.key)
    const region = [start]
    while (region.length < share.cells) {
      const frontier = [...new Set(region.flatMap((i) => neighbours(i, size)))].filter((i) => free.has(i) && keepsFreeWhole(i))
      const next = pick(frontier)
      if (next === undefined) return null
      take(next, share.key)
      region.push(next)
    }
  }
  return cells
}

function neighbours(i: number, size: number): number[] {
  const r = Math.floor(i / size)
  const c = i % size
  const out: number[] = []
  if (r > 0) out.push(i - size)
  if (r < size - 1) out.push(i + size)
  if (c > 0) out.push(i - 1)
  if (c < size - 1) out.push(i + 1)
  return out
}

function isOnePiece(cells: Set<number>, size: number): boolean {
  const first = cells.values().next()
  if (first.done) return true
  const seen = new Set([first.value])
  const stack = [first.value]
  while (stack.length) {
    for (const n of neighbours(stack.pop()!, size)) {
      if (cells.has(n) && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return seen.size === cells.size
}

interface Share {
  key: string
  cells: number
}

/**
 * Splits `total` cells between Plan colours by value, largest colour first. In an 8×8 ordered Mix a
 * Dominant Plan colour (more than half the value, less than three quarters) takes exactly the left
 * Side, and the other colours split the right Side.
 */
function allocate(ranked: [string, number][], total: number, layout: MixLayout): { shares: Share[]; hidden: number } {
  const [top] = ranked
  const topShare = top ? top[1] / ranked.reduce((a, [, value]) => a + value, 0) : 0
  if (layout === 'ordered' && topShare > 0.5 && topShare < 0.75) {
    const rest = split(ranked.slice(1), total / 2)
    return { shares: [{ key: top![0], cells: total / 2 }, ...rest.shares], hidden: rest.hidden }
  }
  return split(ranked, total)
}

/** Each Plan colour's total value, largest first; the first listed wins a tie. */
function rank(slices: MixSlice[]): [string, number][] {
  const byKey = new Map<string, number>()
  for (const s of slices) {
    if (s.value > 0) byKey.set(colourKey(s.colour), (byKey.get(colourKey(s.colour)) ?? 0) + s.value)
  }
  return [...byKey].sort((a, b) => b[1] - a[1])
}

/** Largest-remainder split of `total` cells between colours ranked largest first. */
function split(ranked: [string, number][], total: number): { shares: Share[]; hidden: number } {
  const kept = ranked.slice(0, total)
  const sum = kept.reduce((a, [, value]) => a + value, 0)
  const shares = kept.map(([key, value]) => {
    const exact = (value / sum) * total
    return { key, cells: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let spare = total - shares.reduce((a, s) => a + s.cells, 0)
  for (const s of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (spare-- <= 0) break
    s.cells++
  }
  // A Plan colour with any value shows at least one cell, taken from whichever has the most.
  for (const s of shares) {
    if (s.cells > 0) continue
    const largest = shares.reduce((a, b) => (b.cells > a.cells ? b : a))
    largest.cells--
    s.cells = 1
  }
  return { shares, hidden: ranked.length - kept.length }
}
