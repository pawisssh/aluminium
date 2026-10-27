import { describe, expect, it } from 'vitest'
import { createRng } from '@/vendor/fnm-core/prng'
import { caseValues, DROPPED_CASES, layoutCase, MIX_CASES, mixCases, nearestMixCase, partitions } from './mixCases'

/** Each colour's bounding box as [width, rows], with whether it fills the box and stays in one Side. */
function pieces(cells: number[][]) {
  const boxes = new Map<number, { top: number; bottom: number; left: number; right: number; count: number }>()
  cells.forEach((row, r) =>
    row.forEach((colour, c) => {
      const b = boxes.get(colour) ?? { top: r, bottom: r, left: c, right: c, count: 0 }
      boxes.set(colour, { top: Math.min(b.top, r), bottom: Math.max(b.bottom, r), left: Math.min(b.left, c), right: Math.max(b.right, c), count: b.count + 1 })
    }),
  )
  return [...boxes].map(([colour, b]) => {
    const width = b.right - b.left + 1
    const rows = b.bottom - b.top + 1
    return { colour, shape: `${width}×${rows}`, solid: width * rows === b.count, oneSide: b.left >= 2 || b.right < 2 }
  })
}

/** Whether some of `sizes` add up to exactly one Side. */
function splitsIntoSides(sizes: number[]): boolean {
  let sums = new Set([0])
  for (const size of sizes) sums = new Set([...sums, ...[...sums].map((s) => s + size)])
  return sums.has(8)
}

describe('mixCases', () => {
  const cases = MIX_CASES

  it('counts 32 cases with up to 11 Plan colours', () => {
    const byColours: Record<number, number> = {}
    for (const c of cases) byColours[c.sizes.length] = (byColours[c.sizes.length] ?? 0) + 1
    expect(cases).toHaveLength(32)
    expect(byColours).toEqual({ 1: 1, 2: 2, 3: 4, 4: 4, 5: 6, 6: 4, 7: 3, 8: 3, 9: 3, 10: 1, 11: 1 })
    expect(cases.filter((c) => c.sizes.length === 2).map((c) => c.sizes)).toEqual([[14, 2], [12, 4]])
    expect(cases.map((c) => c.number)).toEqual(cases.map((_, i) => i + 1))
  })

  it('leaves out the 20 dropped cases', () => {
    expect(DROPPED_CASES.size).toBe(20)
    for (const c of cases) expect(DROPPED_CASES.has(c.sizes.join('-'))).toBe(false)
    // Each dropped case is one the pieces can make.
    for (const key of DROPPED_CASES) expect(layoutCase(key.split('-').map(Number))).not.toBeNull()
  })

  it('numbers cases the same however many colours it lists', () => {
    expect(mixCases(16).slice(0, cases.length)).toEqual(cases)
  })

  it('cuts every case into the allowed pieces, each whole in one Side but a spanning largest', () => {
    for (const c of cases) {
      const spans = c.sizes[0]! > 8
      // A spanning largest is the whole left Side plus whole rows at the top of the right.
      if (spans) expect(c.cells.map((row) => row.map((colour) => colour === 0))).toEqual(c.cells.map((_, r) => [true, true, r < (c.sizes[0]! - 8) / 2, r < (c.sizes[0]! - 8) / 2]))
      for (const p of pieces(c.cells.map((row) => row.map((colour) => (spans && colour === 0 ? -2 : colour)))).filter((p) => p.colour !== -2)) {
        expect(['1×1', '2×1', '2×2', '2×3', '2×4']).toContain(p.shape)
        expect(p.solid && p.oneSide).toBe(true)
      }
      expect(c.cells.flat()).not.toContain(-1)
    }
  })

  it('fills the left Side first, largest at the top', () => {
    expect(layoutCase([6, 4, 4, 2])).toEqual([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [0, 0, 2, 2],
      [3, 3, 2, 2],
    ])
    expect(layoutCase([4, 4, 2, 2, 2, 1, 1])).toEqual([
      [0, 0, 2, 2],
      [0, 0, 3, 3],
      [1, 1, 4, 4],
      [1, 1, 5, 6],
    ])
  })

  it('lets the largest take the left Side and the top of the right', () => {
    expect(layoutCase([12, 2, 1, 1])).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 1, 1],
      [0, 0, 2, 3],
    ])
  })

  it('places every set of pieces that can be split into the two Sides', () => {
    for (const sizes of partitions(16, 8)) expect(layoutCase(sizes) !== null).toBe(splitsIntoSides(sizes))
  })
})

describe('nearestMixCase', () => {
  it('keeps the colour count when no case can give a Dominant Plan colour exactly the left Side', () => {
    expect(nearestMixCase([55, 5, 5, 5, 5, 5, 5, 5, 5, 5]).sizes).toHaveLength(10)
  })
})

describe('caseValues', () => {
  it('draws values, largest first and adding up to 100, that snap back to the case', () => {
    for (const [n, c] of MIX_CASES.entries()) {
      for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const values = caseValues(c, createRng(`${seed}${n}`))
        expect(values).toEqual([...values].sort((a, b) => b - a))
        expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0)
        expect(nearestMixCase(values).number, `${c.sizes} from ${values}`).toBe(c.number)
      }
    }
  })

  it('draws different values each time', () => {
    const [, , c] = MIX_CASES
    const rng = createRng('x')
    expect(caseValues(c!, rng)).not.toEqual(caseValues(c!, rng))
  })
})
