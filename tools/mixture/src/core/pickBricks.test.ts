import { describe, expect, it } from 'vitest'
import { generateBrick } from './brick'
import { pickBricks, pickSummary } from './pickBricks'
import type { PickedBrick } from './pickedBricks'
import { coverMatch, planCover } from './planCovers'
import { defaultPlanTypes } from './planTypes'

describe('pickBricks', () => {
  const types = defaultPlanTypes()

  const byId = (id: string) => types.find((t) => t.id === id)!

  it('picks a Brick on a square Brick grid for each exported Plan type, in the order of the Bricks page, and none for the rest', () => {
    // All Defense is in All Family, which the Bricks page lists before Cash, where Money Plus is.
    const picked = pickBricks([byId('money-plus'), byId('investment-call'), byId('all-defense')], 2)
    expect(Object.keys(picked)).toEqual(['all-defense', 'money-plus'])
    for (const brick of Object.values(picked)) {
      expect(brick.slope).toBe('flat')
      expect(['rising', 'hanging']).toContain(brick.family)
    }
  })

  it('gives the rule each Plan type’s Plan Cover: of the Bricks its Strategy allows equally, the one overlapping the Plan Cover most is picked', () => {
    const grid = { cols: 2, rows: 2 }
    const cover = planCover('money-plus')!
    const picked = pickBricks([byId('money-plus')], 2)['money-plus']!
    // The same Strategy under the id of a Plan type with no Plan Cover.
    const blind = pickBricks([{ ...byId('money-plus'), id: 'money-market' }], 2)['money-market']!
    expect(coverMatch(generateBrick(picked, grid), cover)).toBeGreaterThan(coverMatch(generateBrick(blind, grid), cover)!)
  })

  it('fails, naming the Plan type and the Brick grid, when its Strategy allows no Brick there', () => {
    // No 2×2 Brick is both Flat and joined at a corner.
    const goal = byId('goal')
    const flat = { ...goal, strategy: { ...goal.strategy!, risk: 'low' as const } }
    expect(() => pickBricks([flat], 2)).toThrow(/Goal.*2×2/)
  })
})

describe('pickSummary', () => {
  it('counts the Bricks, those that are exact, the different drawings and the hanging Bricks', () => {
    const rising: PickedBrick = { family: 'rising', slope: 'half', blockCount: 3, guidance: 60, cornerMeetLimit: 0, seed: 'a', largestBlock: { w: 2, h: 2 }, exact: true }
    const hanging: PickedBrick = { ...rising, family: 'hanging', exact: false }
    // The second Plan type repeats the first one's drawing.
    expect(pickSummary({ one: rising, two: { ...rising, exact: false }, three: hanging, four: { ...hanging, seed: 'b' } }, 4)).toEqual({ count: 4, exact: 1, distinct: 3, hanging: 2 })
  })
})
