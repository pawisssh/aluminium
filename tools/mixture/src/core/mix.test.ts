import { describe, expect, it } from 'vitest'
import { buildMix } from './mix'
import type { PlanColour } from './colours'

const purple: PlanColour = { family: 'purple', tint: 100 }
const green: PlanColour = { family: 'green', tint: 100 }
const yellow: PlanColour = { family: 'yellow', tint: 100 }

function counts(cells: (string | null)[][]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of cells.flat()) out[String(key)] = (out[String(key)] ?? 0) + 1
  return out
}

/** How many edge-joined pieces the cells of `key` make. */
function pieces(cells: (string | null)[][], key: string): number {
  const seen = new Set<string>()
  let count = 0
  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== key || seen.has(`${r},${c}`)) return
      count++
      const stack = [[r, c]]
      seen.add(`${r},${c}`)
      while (stack.length) {
        const [y, x] = stack.pop()!
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y! + dy!
          const nx = x! + dx!
          if (cells[ny]?.[nx] === key && !seen.has(`${ny},${nx}`)) {
            seen.add(`${ny},${nx}`)
            stack.push([ny, nx])
          }
        }
      }
    }),
  )
  return count
}

describe('buildMix', () => {
  it('fills every cell with the only Plan colour', () => {
    const mix = buildMix([{ value: 1000, colour: purple }], 4, { mode: 'random', seed: 'a' })
    expect(mix.cells.flat()).toEqual(Array(16).fill('purple-100'))
  })

  it('gives each Plan colour cells in proportion to its value', () => {
    const slices = [
      { value: 750, colour: purple },
      { value: 250, colour: green },
    ]
    expect(counts(buildMix(slices, 4, { mode: 'random', seed: 'a' }).cells)).toEqual({ 'purple-100': 12, 'green-100': 4 })
    expect(counts(buildMix(slices, 8, { mode: 'random', seed: 'a' }).cells)).toEqual({ 'purple-100': 48, 'green-100': 16 })
  })

  it('hands leftover cells to the largest remainders so the grid is always full', () => {
    // 59/25/16 of 16 cells is 9.44/4/2.56: floors give 15, the one spare cell goes to yellow (.56).
    const slices = [
      { value: 59, colour: purple },
      { value: 25, colour: green },
      { value: 16, colour: yellow },
    ]
    expect(counts(buildMix(slices, 4, { mode: 'random', seed: 'a' }).cells)).toEqual({
      'purple-100': 9,
      'green-100': 4,
      'yellow-100': 3,
    })
  })

  it('gives every Plan colour with a value at least one cell, taken from the largest', () => {
    const slices = [
      { value: 97, colour: purple },
      { value: 2, colour: green },
      { value: 1, colour: yellow },
    ]
    expect(counts(buildMix(slices, 4, { mode: 'random', seed: 'a' }).cells)).toEqual({
      'purple-100': 14,
      'green-100': 1,
      'yellow-100': 1,
    })
  })

  it('shows only the largest Plan colours when there are more colours than cells, and says how many it left out', () => {
    const families = ['yellow', 'green', 'blue', 'purple', 'navy'] as const
    const slices = families.flatMap((family, f) =>
      ([100, 75, 50, 25] as const).map((tint, t) => ({ value: 100 - f * 4 - t, colour: { family, tint } })),
    )
    const mix = buildMix(slices, 4, { mode: 'random', seed: 'a' })
    expect(Object.values(counts(mix.cells))).toEqual(Array(16).fill(1))
    expect(mix.cells.flat()).not.toContain('navy-25')
    expect(mix.hiddenColours).toBe(4)
  })

  // An ordered Mix fills its halves one after the other, so a colour can split across them.
  it.each([4, 8] as const)('keeps each Plan colour in one piece joined by edges in a random Mix (size %i)', (size) => {
    const palette = [purple, green, yellow, { family: 'blue', tint: 100 }, { family: 'navy', tint: 100 }] as const
    for (let trial = 0; trial < 200; trial++) {
      // A spread of portfolios: 1 to 5 colours with uneven values.
      const n = 1 + (trial % palette.length)
      const slices = palette.slice(0, n).map((colour, i) => ({ value: 1 + ((trial * 37 + i * 101) % 97), colour }))
      const mix = buildMix(slices, size, { mode: 'random', seed: `t${trial}` })
      for (const key of new Set(mix.cells.flat())) {
        expect(pieces(mix.cells, key!), `${key} in trial ${trial}`).toBe(1)
      }
    }
  })

  describe.each(['random', 'ordered'] as const)('%s layout', (mode) => {
    it('gives the same Mix for the same seed', () => {
      const slices = [
        { value: 50, colour: purple },
        { value: 30, colour: green },
        { value: 20, colour: yellow },
      ]
      expect(buildMix(slices, 8, { mode, seed: 'x' })).toEqual(buildMix(slices, 8, { mode, seed: 'x' }))
    })
  })

  it('lays out a random Mix differently for different seeds', () => {
    const slices = [
      { value: 50, colour: purple },
      { value: 30, colour: green },
      { value: 20, colour: yellow },
    ]
    const layouts = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => JSON.stringify(buildMix(slices, 8, { mode: 'random', seed }).cells)))
    expect(layouts.size).toBeGreaterThan(1)
  })

  it('lays out an ordered Mix the same whatever the seed, largest colour first from the left', () => {
    const slices = [
      { value: 20, colour: yellow },
      { value: 50, colour: purple },
      { value: 30, colour: green },
    ]
    const a = buildMix(slices, 4, { mode: 'ordered', seed: 'a' })
    expect(buildMix(slices, 4, { mode: 'ordered', seed: 'b' })).toEqual(a)
    expect(a.cells[0]![0]).toBe('purple-100')
  })

  const short = (cells: (string | null)[][]) => cells.map((row) => row.map((key) => key![0]!.toUpperCase()).join(''))

  it.each([
    [4, ['PPGG', 'PPGG', 'PPGY', 'PPYY']],
    [8, ['PPPPGGGG', 'PPPPGGGG', 'PPPPGGGG', 'PPPPGGGG', 'PPPPGGGG', 'PPPPYYYY', 'PPPPYYYY', 'PPPPYYYY']],
  ] as const)(
    'gives an ordered Mix colour with 50–75% of the value just the left half, and splits the right half between the rest (size %i)',
    (size, rows) => {
      // Purple 59% fills the left half; green and yellow split the right half 25:16.
      const slices = [
        { value: 59, colour: purple },
        { value: 25, colour: green },
        { value: 16, colour: yellow },
      ]
      expect(short(buildMix(slices, size, { mode: 'ordered', seed: 'a' }).cells)).toEqual(rows)
    },
  )

  it('fills an ordered Mix left half first, each half row by row from its top-left, once a colour passes 75%', () => {
    // Purple 80% of 16 cells is 12.8: the left half, then on into the right half.
    const slices = [
      { value: 80, colour: purple },
      { value: 20, colour: green },
    ]
    expect(short(buildMix(slices, 4, { mode: 'ordered', seed: 'a' }).cells)).toEqual(['PPPP', 'PPPP', 'PPPG', 'PPGG'])
  })

  it('leaves every cell empty when the Plans have no value', () => {
    const mix = buildMix([{ value: 0, colour: purple }], 4, { mode: 'random', seed: 'a' })
    expect(mix.cells.flat()).toEqual(Array(16).fill(null))
  })
})
