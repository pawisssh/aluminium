import { describe, expect, it } from 'vitest'
import { buildMix } from './mix'
import { MIX_CASES } from './mixCases'
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
    const mix = buildMix([{ value: 1000, colour: purple }])
    expect(mix.cells.flat()).toEqual(Array(16).fill('purple-100'))
    expect(mix.mixCase).toBe(1)
  })

  it('gives each Plan colour the cells of its Mix case piece', () => {
    const slices = [
      { value: 750, colour: purple },
      { value: 250, colour: green },
    ]
    expect(counts(buildMix(slices).cells)).toEqual({ 'purple-100': 12, 'green-100': 4 })
  })

  it('gives every Plan colour with a value at least one cell', () => {
    const slices = [
      { value: 97, colour: purple },
      { value: 2, colour: green },
      { value: 1, colour: yellow },
    ]
    expect(counts(buildMix(slices).cells)).toEqual({ 'purple-100': 14, 'green-100': 1, 'yellow-100': 1 })
  })

  it('keeps each Plan colour in one piece joined by edges, draws only kept Mix cases, and every colour but the largest in one Side', () => {
    const palette = [purple, green, yellow, { family: 'blue', tint: 100 }, { family: 'navy', tint: 100 }] as const
    for (let trial = 0; trial < 200; trial++) {
      // A spread of portfolios: 1 to 5 colours with uneven values.
      const n = 1 + (trial % palette.length)
      const slices = palette.slice(0, n).map((colour, i) => ({ value: 1 + ((trial * 37 + i * 101) % 97), colour }))
      // The largest value, the first listed on a tie.
      const largest = slices.reduce((a, b) => (b.value > a.value ? b : a))
      const mix = buildMix(slices)
      expect(MIX_CASES.map((c) => c.number)).toContain(mix.mixCase)
      for (const key of new Set(mix.cells.flat())) {
        expect(pieces(mix.cells, key!), `${key} in trial ${trial}`).toBe(1)
        if (key === `${largest.colour.family}-100`) continue
        const sides = new Set(mix.cells.flatMap((row) => row.flatMap((cell, c) => (cell === key ? [c < 2] : []))))
        expect(sides.size, `${key} in trial ${trial}`).toBe(1)
      }
    }
  })

  it('draws only Mix cases, the same way every time, largest colour first from the left', () => {
    const slices = [
      { value: 20, colour: yellow },
      { value: 50, colour: purple },
      { value: 30, colour: green },
    ]
    const a = buildMix(slices)
    expect(buildMix(slices)).toEqual(a)
    expect(a.cells[0]![0]).toBe('purple-100')
    expect(MIX_CASES.map((c) => c.number)).toContain(a.mixCase)
  })

  const short = (cells: (string | null)[][]) => cells.map((row) => row.map((key) => key![0]!.toUpperCase()).join(''))

  // Values are percentages, written after family initials; the first listed wins a tie.
  it.each([
    ['lands exactly on a case', 'B37.5 N25 O25 Y12.5', 13, ['BBNN', 'BBNN', 'BBOO', 'YYOO']],
    ['snaps each colour to the nearest piece', 'B40 N30 O20 Y10', 13, ['BBNN', 'BBNN', 'BBOO', 'YYOO']],
    ['keeps equal values as equal pieces', 'B31 N31 O31 Y3.5 G3.5', 21, ['BBOO', 'BBOO', 'NNYY', 'NNGG']],
    ['gives a Dominant Plan colour exactly the left Side', 'B59 G25 Y16', 8, ['BBGG', 'BBGG', 'BBYY', 'BBYY']],
    ['spans a Dominant Plan colour when no case with as many colours gives it just the left Side', 'B70 N30', 3, ['BBBB', 'BBBB', 'BBNN', 'BBNN']],
    ['spans the largest colour onto the top of the right Side from 75%', 'B80 G20', 3, ['BBBB', 'BBBB', 'BBGG', 'BBGG']],
    ['gives a tiny Plan colour a single cell', 'B97 N2 Y1', 5, ['BBBB', 'BBBB', 'BBBB', 'BBNY']],
  ] as const)('%s (%s)', (_, spec, mixCase, rows) => {
    const families = { B: 'blue', N: 'navy', O: 'orange', Y: 'yellow', G: 'green' } as const
    const slices = spec.split(' ').map((s) => ({ value: Number(s.slice(1)), colour: { family: families[s[0] as keyof typeof families], tint: 100 as const } }))
    const mix = buildMix(slices)
    expect(short(mix.cells)).toEqual(rows)
    expect(mix.mixCase).toBe(mixCase)
  })

  it('leaves out the smallest Plan colours past the 11 a Mix case holds', () => {
    const families = ['yellow', 'green', 'blue', 'purple', 'navy', 'light-grey'] as const
    const slices = families.flatMap((family, f) => ([100, 75] as const).map((tint, t) => ({ value: 100 - f * 2 - t, colour: { family, tint } })))
    const mix = buildMix(slices)
    expect(new Set(mix.cells.flat()).size).toBe(11)
    expect(mix.cells.flat()).not.toContain('light-grey-75')
    expect(mix.hiddenColours).toBe(1)
    expect(MIX_CASES.map((c) => c.number)).toContain(mix.mixCase)
  })

  it('leaves every cell empty when the Plans have no value', () => {
    const mix = buildMix([{ value: 0, colour: purple }])
    expect(mix.cells.flat()).toEqual(Array(16).fill(null))
    expect(mix.mixCase).toBeUndefined()
  })
})
