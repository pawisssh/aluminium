import { describe, expect, it } from 'vitest'
import { colourKey } from './colours'
import { defaultPlanTypes, drawPlanTypes, planTypesJson } from './planTypes'
import RAW from './planTypes.json?raw'

describe('defaultPlanTypes', () => {
  it('gives every Plan type its own id and Brick seed', () => {
    const types = defaultPlanTypes()
    expect(types).toHaveLength(32)
    expect(new Set(types.map((t) => t.id)).size).toBe(types.length)
    expect(new Set(types.map((t) => t.brick.seed)).size).toBe(types.length)
  })

  it('takes each Plan type’s Brick settings and In draws from the data', () => {
    const allWeather = defaultPlanTypes().find((t) => t.id === 'astotz-all-weather')!
    expect(allWeather.brick).toEqual({ family: 'hanging', slope: 'flat', seed: 'astotz-all-weather-143', guidance: 0, blockCount: 3 })
    expect(allWeather.inDraws).toBe(true)
  })
})

describe('planTypesJson', () => {
  it('writes the Plan types back exactly as planTypes.json holds them', () => {
    expect(planTypesJson(defaultPlanTypes())).toBe(RAW)
  })
})

describe('drawPlanTypes', () => {
  const types = defaultPlanTypes()

  it('only draws Plan types that are in draws', () => {
    const pool = types.map((t, i) => ({ ...t, inDraws: i < 3 }))
    for (let s = 0; s < 20; s++) expect(drawPlanTypes(pool, 2).every((t) => t.inDraws)).toBe(true)
  })

  it('draws no Plan colour twice, nor one already taken, while others are left', () => {
    const taken = [types[0]!.colour]
    const drawn = drawPlanTypes(types, 6, taken)
    const keys = drawn.map((t) => colourKey(t.colour))
    expect(new Set(keys).size).toBe(6)
    expect(keys).not.toContain(colourKey(types[0]!.colour))
  })

  it('draws a colour family not used yet before another Tint of a used one', () => {
    const taken = [types[0]!.colour]
    for (let s = 0; s < 20; s++) {
      const families = drawPlanTypes(types, 5, taken).map((t) => t.colour.family)
      expect(new Set([...families, taken[0]!.family]).size).toBe(6)
    }
  })

  it('repeats Plan types once the pool runs out, and draws none from an empty pool', () => {
    const pool = types.slice(0, 2)
    expect(drawPlanTypes(pool, 3)).toHaveLength(3)
    expect(drawPlanTypes(types.map((t) => ({ ...t, inDraws: false })), 3)).toEqual([])
  })
})
