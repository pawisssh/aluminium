import { describe, expect, it } from 'vitest'
import type { BrickGrid } from './brick'
import { pickedBrick, pickedBricksJson, planTypeBrick, planTypeBrickCells, type PickedBrick } from './pickedBricks'
import STORED from './pickedBricks.json'
import RAW from './pickedBricks.json?raw'
import { defaultPlanTypes, exportedPlanTypes } from './planTypes'

const SQUARE_GRIDS: BrickGrid[] = [2, 4, 8, 16].map((side) => ({ cols: side, rows: side }))
const label = (grid: BrickGrid) => `${grid.cols}×${grid.rows}`

/** How many pieces the filled cells make, joining across cell edges and, with `corners`, at cell corners too. */
function pieces(cells: boolean[][], corners: boolean): number {
  const seen = new Set<string>()
  let count = 0
  cells.forEach((row, r) =>
    row.forEach((on, c) => {
      if (!on || seen.has(`${r},${c}`)) return
      count++
      const stack = [[r, c]]
      seen.add(`${r},${c}`)
      while (stack.length) {
        const [y, x] = stack.pop()!
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!corners && dy !== 0 && dx !== 0) continue
            const ny = y! + dy
            const nx = x! + dx
            if (cells[ny]?.[nx] && !seen.has(`${ny},${nx}`)) {
              seen.add(`${ny},${nx}`)
              stack.push([ny, nx])
            }
          }
      }
    }),
  )
  return count
}

// The Slopes in the Strategy table the brand designer approved on 2026-11-11 (issue #15), by Plan type id.
const SLOPES: Record<string, string[]> = {
  '75': ['definit-global-select', 'definit-set-select', 'ggg', 'gor', 'first-million', 'all-star', 'astotz-alpha', 'wealthguru', 'eastspring', 'krungthai', 'scb', 'uobam', 'bcap', 'kasset'],
  half: ['gmi', 'diy', 'tailor-made', 'gar', 'dynamic-contrarian', 'goal', 'goals-navigator', 'all-balance', 'astotz-all-weather', 'krungsri', 'tisco', 'tax-saving', 'rmf', 'thai-esg'],
  flat: ['all-defense', 'inflation-guard', 'e-savings', 'money-market', 'money-plus', 'kkp-finsave'],
}

describe('the stored Bricks', () => {
  const types = defaultPlanTypes()
  const exported = exportedPlanTypes(types)

  it('hold a Brick for every exported Plan type on each of the four square Brick grids, and for no other Plan type', () => {
    expect(Object.keys(STORED)).toEqual(exported.map((t) => t.id))
    for (const [id, grids] of Object.entries(STORED)) expect(Object.keys(grids), id).toEqual(['2x2', '4x4', '8x8', '16x16'])
    for (const type of exported) for (const grid of SQUARE_GRIDS) expect(pickedBrick(type.id, grid), `${type.id} ${label(grid)}`).toBeDefined()
    expect(pickedBrick('thai-stocks', { cols: 4, rows: 4 })).toBeUndefined()
  })

  it('are written as pickedBricksJson writes them', () => {
    expect(pickedBricksJson(STORED as Parameters<typeof pickedBricksJson>[0])).toBe(RAW)
  })

  it('each redraw on their Brick grid in one piece, in a Brick family and the Slope the Strategy asks for', () => {
    for (const type of exported)
      for (const grid of SQUARE_GRIDS) {
        const at = `${type.id} ${label(grid)}`
        const brick = pickedBrick(type.id, grid)!
        const cells = planTypeBrickCells(type, grid)!
        expect(cells.map((row) => row.length), at).toEqual(Array(grid.rows).fill(grid.cols))
        expect(pieces(cells, true), at).toBe(1)
        expect(type.strategy.investmentStyle === 'market-timing' ? ['mountain'] : ['rising', 'hanging'], at).toContain(brick.family)
        expect(SLOPES[brick.slope], at).toContain(type.id)
      }
  })

  it('each redraw joined as the Investment Style asks: One-time by edges alone, Dollar Cost Average only with a corner', () => {
    for (const type of exported)
      for (const grid of SQUARE_GRIDS) {
        const byEdges = pieces(planTypeBrickCells(type, grid)!, false)
        const style = type.strategy.investmentStyle
        if (style === 'one-time') expect(byEdges, `${type.id} ${label(grid)}`).toBe(1)
        if (style === 'dollar-cost-average') expect(byEdges, `${type.id} ${label(grid)}`).toBeGreaterThan(1)
      }
  })
})

describe('planTypeBrick', () => {
  const types = defaultPlanTypes()
  const gmi = types.find((t) => t.id === 'gmi')!

  it('gives an exported Plan type its stored Brick for the Brick grid', () => {
    expect(planTypeBrick(gmi, { cols: 2, rows: 2 })).toEqual(STORED.gmi['2x2'])
    expect(planTypeBrick(gmi, { cols: 4, rows: 4 })).toEqual(STORED.gmi['4x4'])
    expect(planTypeBrick(gmi, { cols: 8, rows: 8 })).toEqual(STORED.gmi['8x8'])
    expect(planTypeBrick(gmi, { cols: 16, rows: 16 })).toEqual(STORED.gmi['16x16'])
  })

  it('draws a portrait Brick grid with the stored settings of the square Brick grid of the same width', () => {
    expect(planTypeBrick(gmi, { cols: 4, rows: 6 })).toEqual(STORED.gmi['4x4'])
    expect(planTypeBrick(gmi, { cols: 8, rows: 12 })).toEqual(STORED.gmi['8x8'])
    const cells = planTypeBrickCells(gmi, { cols: 4, rows: 6 })!
    expect(cells.map((row) => row.length)).toEqual([4, 4, 4, 4, 4, 4])
    expect(pieces(cells, true)).toBe(1)
  })

  it('gives a Plan type that is not exported its hand-set Brick on every Brick grid', () => {
    const call = types.find((t) => t.id === 'investment-call')!
    for (const grid of [...SQUARE_GRIDS, { cols: 4, rows: 6 }]) expect(planTypeBrick(call, grid)).toEqual({ family: 'hanging', slope: 'half', seed: 'investment-call-4' })
  })
})

describe('pickedBricksJson', () => {
  it('writes each Plan type’s Brick on each square Brick grid on a line of its own', () => {
    const brick: PickedBrick = { family: 'hanging', slope: '75', blockCount: 3, guidance: 60, cornerMeetLimit: 0, seed: 'preset-7', largestBlock: { w: 2, h: 3 }, exact: true }
    const written = pickedBricksJson({ gmi: { '2x2': { ...brick, blockCount: 1, exact: false }, '4x4': brick, '8x8': brick, '16x16': brick }, goal: { '2x2': brick, '4x4': brick, '8x8': brick, '16x16': brick } })
    const line = '{ "family": "hanging", "slope": "75", "blockCount": 3, "guidance": 60, "cornerMeetLimit": 0, "seed": "preset-7", "largestBlock": { "w": 2, "h": 3 }, "exact": true }'
    expect(written).toBe(
      `{\n  "gmi": {\n    "2x2": ${line.replace('"blockCount": 3', '"blockCount": 1').replace('true', 'false')},\n    "4x4": ${line},\n    "8x8": ${line},\n    "16x16": ${line}\n  },\n  "goal": {\n    "2x2": ${line},\n    "4x4": ${line},\n    "8x8": ${line},\n    "16x16": ${line}\n  }\n}\n`,
    )
    expect(JSON.parse(written).gmi['2x2']).toEqual({ ...brick, blockCount: 1, exact: false })
  })
})
