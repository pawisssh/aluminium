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
    const mix = buildMix([{ value: 1000, colour: purple }], 4, { layout: 'random', seed: 'a' })
    expect(mix.cells.flat()).toEqual(Array(16).fill('purple-100'))
  })

  it('gives each Plan colour cells in proportion to its value', () => {
    const slices = [
      { value: 750, colour: purple },
      { value: 250, colour: green },
    ]
    expect(counts(buildMix(slices, 4, { layout: 'random', seed: 'a' }).cells)).toEqual({ 'purple-100': 12, 'green-100': 4 })
    expect(counts(buildMix(slices, 8, { layout: 'random', seed: 'a' }).cells)).toEqual({ 'purple-100': 48, 'green-100': 16 })
  })

  it('hands leftover cells to the largest remainders so the grid is always full', () => {
    // 59/25/16 of 16 cells is 9.44/4/2.56: floors give 15, the one spare cell goes to yellow (.56).
    const slices = [
      { value: 59, colour: purple },
      { value: 25, colour: green },
      { value: 16, colour: yellow },
    ]
    expect(counts(buildMix(slices, 4, { layout: 'random', seed: 'a' }).cells)).toEqual({
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
    expect(counts(buildMix(slices, 4, { layout: 'random', seed: 'a' }).cells)).toEqual({
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
    const mix = buildMix(slices, 4, { layout: 'random', seed: 'a' })
    expect(Object.values(counts(mix.cells))).toEqual(Array(16).fill(1))
    expect(mix.cells.flat()).not.toContain('navy-25')
    expect(mix.hiddenColours).toBe(4)
  })

  it.each([
    ['random', 4],
    ['random', 8],
    ['ordered', 4],
    ['ordered', 8],
  ] as const)('keeps each Plan colour in one piece joined by edges in the %s layout (size %i)', (layout, size) => {
    const palette = [purple, green, yellow, { family: 'blue', tint: 100 }, { family: 'navy', tint: 100 }] as const
    for (let trial = 0; trial < 200; trial++) {
      // A spread of portfolios: 1 to 5 colours with uneven values.
      const n = 1 + (trial % palette.length)
      const slices = palette.slice(0, n).map((colour, i) => ({ value: 1 + ((trial * 37 + i * 101) % 97), colour }))
      const mix = buildMix(slices, size, { layout, seed: `t${trial}` })
      for (const key of new Set(mix.cells.flat())) {
        expect(pieces(mix.cells, key!), `${key} in trial ${trial}`).toBe(1)
      }
    }
  })

  describe.each(['random', 'ordered'] as const)('%s layout', (layout) => {
    it('gives the same Mix for the same seed', () => {
      const slices = [
        { value: 50, colour: purple },
        { value: 30, colour: green },
        { value: 20, colour: yellow },
      ]
      expect(buildMix(slices, 8, { layout, seed: 'x' })).toEqual(buildMix(slices, 8, { layout, seed: 'x' }))
    })
  })

  it('lays out a random Mix differently for different seeds', () => {
    const slices = [
      { value: 50, colour: purple },
      { value: 30, colour: green },
      { value: 20, colour: yellow },
    ]
    const layouts = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => JSON.stringify(buildMix(slices, 8, { layout: 'random', seed }).cells)))
    expect(layouts.size).toBeGreaterThan(1)
  })

  it('lays out an ordered Mix the same whatever the seed, largest colour first from the left', () => {
    const slices = [
      { value: 20, colour: yellow },
      { value: 50, colour: purple },
      { value: 30, colour: green },
    ]
    const a = buildMix(slices, 4, { layout: 'ordered', seed: 'a' })
    expect(buildMix(slices, 4, { layout: 'ordered', seed: 'b' })).toEqual(a)
    expect(a.cells[0]![0]).toBe('purple-100')
  })

  const short = (cells: (string | null)[][]) => cells.map((row) => row.map((key) => key![0]!.toUpperCase()).join(''))

  it('gives an 8×8 ordered Mix colour with 50–75% of the value just the left Side, and splits the right Side between the rest', () => {
    // Purple 59% fills the left Side; green and yellow split the right Side 25:16.
    const slices = [
      { value: 59, colour: purple },
      { value: 25, colour: green },
      { value: 16, colour: yellow },
    ]
    expect(short(buildMix(slices, 8, { layout: 'ordered', seed: 'a' }).cells)).toEqual([
      'PPPPGGGG',
      'PPPPGGGG',
      'PPPPGGGG',
      'PPPPGGGG',
      'PPPPGGGG',
      'PPPPYYYY',
      'PPPPYYYY',
      'PPPPYYYY',
    ])
  })

  it.each([4, 8] as const)('keeps every Plan colour but the largest in one Side of an ordered Mix (size %i)', (size) => {
    const palette = [purple, green, yellow, { family: 'blue', tint: 100 }, { family: 'navy', tint: 100 }] as const
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + (trial % (palette.length - 1))
      const slices = palette.slice(0, n).map((colour, i) => ({ value: 1 + ((trial * 37 + i * 101) % 97), colour }))
      // The largest value, the first listed on a tie.
      const largest = slices.reduce((a, b) => (b.value > a.value ? b : a))
      const mix = buildMix(slices, size, { layout: 'ordered', seed: 'a' })
      for (const key of new Set(mix.cells.flat())) {
        if (key === `${largest.colour.family}-100`) continue
        const sides = new Set(mix.cells.flatMap((row) => row.flatMap((cell, c) => (cell === key ? [c < size / 2] : []))))
        expect(sides.size, `${key} in trial ${trial}`).toBe(1)
      }
    }
  })

  // Values are percentages, written after family initials; the first listed wins a tie.
  it.each([
    ['lands exactly on a case', 'B25 N25 O25 Y25', 14, ['BBOO', 'BBOO', 'NNYY', 'NNYY']],
    ['snaps each colour to the nearest piece', 'B40 N30 O20 Y10', 13, ['BBNN', 'BBNN', 'BBOO', 'YYOO']],
    ['keeps equal values as equal pieces', 'B31.25 N31.25 Y18.75 O18.75', 12, ['BBNN', 'BBNN', 'BBNN', 'YYOO']],
    ['gives a Dominant Plan colour exactly the left Side', 'B59 G25 Y16', 8, ['BBGG', 'BBGG', 'BBYY', 'BBYY']],
    ['holds a Dominant Plan colour to the left Side even near 75%', 'B70 N30', 4, ['BBNN', 'BBNN', 'BBNN', 'BBNN']],
    ['spans the largest colour onto the top of the right Side from 75%', 'B80 G20', 3, ['BBBB', 'BBBB', 'BBGG', 'BBGG']],
    ['gives a tiny Plan colour a single cell', 'B97 N2 Y1', 5, ['BBBB', 'BBBB', 'BBBB', 'BBNY']],
  ] as const)('%s in a 4×4 ordered Mix (%s)', (_, spec, mixCase, rows) => {
    const families = { B: 'blue', N: 'navy', O: 'orange', Y: 'yellow', G: 'green' } as const
    const slices = spec.split(' ').map((s) => ({ value: Number(s.slice(1)), colour: { family: families[s[0] as keyof typeof families], tint: 100 as const } }))
    const mix = buildMix(slices, 4, { layout: 'ordered', seed: 'a' })
    expect(short(mix.cells)).toEqual(rows)
    expect(mix.mixCase).toBe(mixCase)
  })

  it('leaves every cell empty when the Plans have no value', () => {
    const mix = buildMix([{ value: 0, colour: purple }], 4, { layout: 'random', seed: 'a' })
    expect(mix.cells.flat()).toEqual(Array(16).fill(null))
  })
})
