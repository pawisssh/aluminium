import { describe, expect, it } from 'vitest'
import { generateBrick } from './brick'
import { defaultPlanTypes } from './planTypes'
import { closestBricks, coverMatch, planCover } from './planCovers'
import PLAN_COVERS from './planCovers.json'

const grid4 = { cols: 4, rows: 4 }

describe('planCover', () => {
  it('has a 16×16 Plan Cover for each Plan type on the plan picker, and none for the rest', () => {
    const covered = defaultPlanTypes().filter((t) => planCover(t.id))
    expect(covered).toHaveLength(28)
    for (const t of covered) expect(planCover(t.id)!.map((row) => row.length)).toEqual(Array(16).fill(16))
    expect(planCover('thai-stocks')).toBeUndefined()
  })

  it('keeps every Plan Cover with its Plan type through the renames, and has none for the six new Plan types', () => {
    const names = new Map(defaultPlanTypes().map((t) => [t.id, t.name]))
    const covers: Record<string, { figmaNode: string }> = PLAN_COVERS
    for (const id of Object.keys(covers)) expect(names.has(id), id).toBe(true)
    // The Figma nodes the Plan Covers of the renamed Plan types were read off.
    expect(['tax-saving', 'diy', 'gmi'].map((id) => [names.get(id), covers[id]?.figmaNode])).toEqual([
      ['Tax Saving SSF', '13:408'],
      ['Self-directed Investing', '13:381'],
      ['GMI', '6:1007'],
    ])
    // Savings never had one.
    expect(names.get('e-savings')).toBe('Savings')
    expect(planCover('e-savings')).toBeUndefined()
    for (const id of ['definit-global-select', 'definit-set-select', 'rmf', 'thai-esg', 'money-market', 'kkp-finsave']) expect(planCover(id), id).toBeUndefined()
  })
})

describe('coverMatch', () => {
  const left = Array.from({ length: 16 }, () => Array.from({ length: 16 }, (_, c) => c < 8))

  it('scales the Brick up to 16×16 and scores overlap over union', () => {
    expect(coverMatch([[true, false], [true, false]], left)).toBe(1)
    expect(coverMatch([[true, true], [true, true]], left)).toBe(0.5)
    expect(coverMatch([[false, true], [false, true]], left)).toBe(0)
  })

  it('gives no score on a Brick grid that does not divide 16', () => {
    expect(coverMatch(Array(6).fill([true, true, true, true]), left)).toBeNull()
  })
})

describe('closestBricks', () => {
  it('finds Bricks, best first, each drawn differently and scored as coverMatch scores it', () => {
    const cover = planCover('diy')!
    const found = closestBricks(cover, grid4, 'diy', { tries: 20, count: 5 })
    expect(found).toHaveLength(5)
    expect(found.map((f) => f.match)).toEqual([...found.map((f) => f.match)].sort((a, b) => b - a))
    const masks = found.map((f) => JSON.stringify(generateBrick(f.brick, grid4)))
    expect(new Set(masks).size).toBe(5)
    for (const f of found) expect(coverMatch(generateBrick(f.brick, grid4), cover)).toBe(f.match)
  })
})
