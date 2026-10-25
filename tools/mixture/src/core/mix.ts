import { createRng } from '@/vendor/fnm-core/prng'
import { colourKey, type PlanColour } from './colours'

export type MixSize = 4 | 8
export type MixMode = 'random' | 'ordered'

export interface MixSlice {
  value: number
  colour: PlanColour
}

export interface Mix {
  /** Rows of colour keys (see `colourKey`), row 0 at the top; null where nothing has value. */
  cells: (string | null)[][]
  /** Plan colours left out because there were more colours than cells. */
  hiddenColours: number
}

const RANDOM_ATTEMPTS = 50

export function buildMix(slices: MixSlice[], size: MixSize, options: { mode: MixMode; seed: string }): Mix {
  const { shares, hidden } = allocate(slices, size * size)
  const rng = createRng(options.seed)
  let cells: (string | null)[][] | null = null
  for (let i = 0; options.mode === 'random' && !cells && i < RANDOM_ATTEMPTS; i++) cells = growRegions(shares, size, rng)
  return { cells: cells ?? orderedLayout(shares, size), hiddenColours: hidden }
}

/**
 * Lays the colours, largest first, along a path that snakes up the first column, down the next,
 * and so on: any run of cells along it is joined by edges, so each colour is one piece.
 */
function orderedLayout(shares: Share[], size: number): (string | null)[][] {
  const cells: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  const keys = shares.flatMap((s) => Array<string>(s.cells).fill(s.key))
  for (let i = 0; i < keys.length; i++) {
    const col = Math.floor(i / size)
    const step = i % size
    cells[col % 2 === 0 ? size - 1 - step : step]![col] = keys[i]!
  }
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

/** Largest-remainder split of `total` cells between Plan colours by value, largest colour first. */
function allocate(slices: MixSlice[], total: number): { shares: Share[]; hidden: number } {
  const byKey = new Map<string, number>()
  for (const s of slices) {
    if (s.value > 0) byKey.set(colourKey(s.colour), (byKey.get(colourKey(s.colour)) ?? 0) + s.value)
  }
  const ranked = [...byKey].sort((a, b) => b[1] - a[1])
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
