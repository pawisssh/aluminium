import { describe, expect, it } from 'vitest'
import { BRICK_GRIDS, DEFAULT_BRICK_GRID, brickDefaults, generateBrick, type BrickSettings } from './brick'

/** How many pieces the filled cells make, joining by edges or corners. */
function pieces(mask: boolean[][]): number {
  const seen = new Set<string>()
  let count = 0
  mask.forEach((row, r) =>
    row.forEach((on, c) => {
      if (!on || seen.has(`${r},${c}`)) return
      count++
      const stack = [[r, c]]
      seen.add(`${r},${c}`)
      while (stack.length) {
        const [y, x] = stack.pop()!
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y! + dy
            const nx = x! + dx
            if (mask[ny]?.[nx] && !seen.has(`${ny},${nx}`)) {
              seen.add(`${ny},${nx}`)
              stack.push([ny, nx])
            }
          }
      }
    }),
  )
  return count
}

const families = ['auto', 'rising', 'hanging', 'mountain'] as const
const slopes = ['flat', 'half', '75'] as const

describe('generateBrick', () => {
  it('draws a 4x4 Brick in one piece for every family, Slope and seed', () => {
    for (const family of families)
      for (const slope of slopes)
        for (let s = 0; s < 30; s++) {
          const mask = generateBrick({ family, slope, seed: `s${s}` })
          expect(mask).toHaveLength(4)
          expect(mask.every((row) => row.length === 4)).toBe(true)
          expect(mask.flat().some(Boolean)).toBe(true)
          expect(pieces(mask), `${family}/${slope}/s${s}`).toBe(1)
        }
  })

  it('draws the same Brick for the same settings', () => {
    const settings: BrickSettings = { family: 'rising', slope: '75', seed: 'gmi' }
    expect(generateBrick(settings)).toEqual(generateBrick(settings))
  })

  it('draws different Bricks for different seeds', () => {
    const shapes = new Set(Array.from({ length: 10 }, (_, s) => JSON.stringify(generateBrick({ family: 'auto', slope: 'half', seed: `s${s}` }))))
    expect(shapes.size).toBeGreaterThan(1)
  })
})

describe('generateBrick on other Brick grids', () => {
  it('has the four square Brick grids a Brick goes to Figma on, then the portrait ones, with 4×4 the default', () => {
    expect(BRICK_GRIDS.map((g) => g.label)).toEqual(['2×2', '4×4', '8×8', '16×16', '4×6 portrait', '8×12 portrait'])
    expect(BRICK_GRIDS[0]!.grid).toEqual({ cols: 2, rows: 2 })
    expect(DEFAULT_BRICK_GRID).toEqual({ cols: 4, rows: 4 })
  })

  it('keeps the 4x4 Brick its old Pattern Builder settings', () => {
    expect(brickDefaults()).toEqual({ blockCount: 3, guidance: 60, cornerMeetLimit: 1 })
  })

  it('draws every Brick grid at its own size, in one piece', () => {
    for (const { grid, label } of BRICK_GRIDS)
      for (const slope of slopes)
        for (let s = 0; s < 10; s++) {
          const mask = generateBrick({ family: 'auto', slope, seed: `s${s}` }, grid)
          expect(mask).toHaveLength(grid.rows)
          expect(mask.every((row) => row.length === grid.cols)).toBe(true)
          expect(pieces(mask), `${label}/${slope}/s${s}`).toBe(1)
        }
  })
})
