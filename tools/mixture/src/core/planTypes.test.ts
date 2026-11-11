import { describe, expect, it } from 'vitest'
import { generateBrick } from './brick'
import { colourKey, familyTints } from './colours'
import { defaultPlanTypes, drawPlanTypes, exportedPlanTypes, planTypesJson } from './planTypes'
import RAW from './planTypes.json?raw'
import type { Strategy, StrategyValue } from './strategy'

describe('defaultPlanTypes', () => {
  it('gives every Plan type its own id', () => {
    const types = defaultPlanTypes()
    expect(types).toHaveLength(38)
    expect(new Set(types.map((t) => t.id)).size).toBe(types.length)
  })

  it('takes In draws, and the hand-set Brick of a Plan type that is not exported, from the data', () => {
    const call = defaultPlanTypes().find((t) => t.id === 'investment-call')!
    expect(call.brick).toEqual({ family: 'hanging', slope: 'half', seed: 'investment-call-4' })
    expect(call.inDraws).toBe(true)
  })
})

// The Bricks page in Figma, Collection by Collection, by Plan type id.
const BRICKS_PAGE = [
  ['definit-global-select', 'gmi', 'diy', 'tailor-made', 'definit-set-select'],
  ['ggg', 'gar', 'gor', 'dynamic-contrarian'],
  ['first-million', 'goal', 'goals-navigator'],
  ['all-balance', 'all-star', 'all-defense'],
  ['astotz-all-weather', 'astotz-alpha', 'inflation-guard', 'wealthguru'],
  ['eastspring', 'krungsri', 'krungthai', 'tisco', 'scb', 'uobam', 'bcap', 'kasset'],
  ['tax-saving', 'rmf', 'thai-esg'],
  ['e-savings', 'money-market', 'money-plus', 'kkp-finsave'],
]

describe('exportedPlanTypes', () => {
  it('gives the 34 Plan types that have a Collection, in the order of the Bricks page in Figma', () => {
    const exported = exportedPlanTypes(defaultPlanTypes())
    expect(exported).toHaveLength(34)
    expect(exported.map((t) => t.id)).toEqual(BRICKS_PAGE.flat())
  })
})

// The Strategy table the brand designer approved on 2026-11-11 (issue #15), by Plan type id.
const ONE_TIME = 'one-time'
const DCA = 'dollar-cost-average'
const TIMING = 'market-timing'
const ALL_THREE: StrategyValue[] = ['investmentStyle', 'risk', 'initialCost']
const APPROVED: Record<string, Strategy> = {
  'definit-global-select': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 500_000, guesses: ALL_THREE },
  'gmi': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 500_000 },
  'diy': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 1, guesses: ['risk'] },
  'tailor-made': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 10_000_000, guesses: ['risk'] },
  'definit-set-select': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 500_000, guesses: ALL_THREE },
  'ggg': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 2_000_000 },
  'gar': { investmentStyle: TIMING, risk: ['medium', 'high'], initialCost: 2_000_000 },
  'gor': { investmentStyle: ONE_TIME, risk: ['medium', 'high'], initialCost: 10_000_000 },
  'dynamic-contrarian': { investmentStyle: TIMING, risk: 'high', initialCost: 2_000_000 },
  'first-million': { investmentStyle: DCA, risk: ['medium', 'high'], initialCost: 5_000 },
  'goal': { investmentStyle: DCA, risk: ['low', 'high'], initialCost: 20_000 },
  'goals-navigator': { investmentStyle: ONE_TIME, risk: ['low', 'high'], initialCost: 500_000 },
  'all-balance': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 50_000 },
  'all-star': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 50_000 },
  'all-defense': { investmentStyle: ONE_TIME, risk: 'low', initialCost: 50_000 },
  'astotz-all-weather': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 500_000 },
  'astotz-alpha': { investmentStyle: ONE_TIME, risk: ['medium', 'high'], initialCost: 500_000 },
  'inflation-guard': { investmentStyle: ONE_TIME, risk: 'low', initialCost: 500_000 },
  'wealthguru': { investmentStyle: ONE_TIME, risk: ['medium', 'high'], initialCost: 500_000 },
  'eastspring': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 500_000 },
  'krungsri': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 500_000 },
  'krungthai': { investmentStyle: ONE_TIME, risk: ['medium', 'high'], initialCost: 500_000 },
  'tisco': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 500_000 },
  'scb': { investmentStyle: ONE_TIME, risk: ['medium', 'high'], initialCost: 500_000 },
  'uobam': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 500_000 },
  'bcap': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 500_000 },
  'kasset': { investmentStyle: ONE_TIME, risk: 'high', initialCost: 500_000 },
  'tax-saving': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 1, guesses: ALL_THREE },
  'rmf': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 1, guesses: ALL_THREE },
  'thai-esg': { investmentStyle: ONE_TIME, risk: 'medium', initialCost: 1, guesses: ALL_THREE },
  'e-savings': { investmentStyle: ONE_TIME, risk: 'low', initialCost: 1, guesses: ALL_THREE },
  'money-market': { investmentStyle: ONE_TIME, risk: 'low', initialCost: 1, guesses: ALL_THREE },
  // "Very low" on the plan picker, kept as low.
  'money-plus': { investmentStyle: ONE_TIME, risk: 'low', initialCost: 5_000 },
  'kkp-finsave': { investmentStyle: ONE_TIME, risk: 'low', initialCost: 1, guesses: ALL_THREE },
}

describe('an exported Plan type', () => {
  const exported = exportedPlanTypes(defaultPlanTypes())

  it('has one of the eight Collections, each with the Plan types the Bricks page files under it', () => {
    const collections = [...new Set(exported.map((t) => t.collection))]
    expect(collections).toHaveLength(8)
    expect(collections[0]).toBe('Investments')
    expect(collections[7]).toBe('Cash')
    expect(collections.map((c) => exported.filter((t) => t.collection === c).map((t) => t.id))).toEqual(BRICKS_PAGE)
  })

  it('has an Investment Style, a Risk of one level or a lower and a higher one, and an Initial Cost on one of the seven steps', () => {
    const levels = ['low', 'medium', 'high']
    for (const { id, strategy } of exported) {
      expect(['one-time', 'dollar-cost-average', 'market-timing'], id).toContain(strategy.investmentStyle)
      const risk = [strategy.risk].flat()
      expect(risk.length, id).toBeLessThanOrEqual(2)
      for (const level of risk) expect(levels, id).toContain(level)
      if (risk.length === 2) expect(levels.indexOf(risk[0]!), id).toBeLessThan(levels.indexOf(risk[1]!))
      expect([1, 5_000, 20_000, 50_000, 500_000, 2_000_000, 10_000_000], id).toContain(strategy.initialCost)
    }
  })

  it('has the Strategy of the approved table, with every guess in the table marked as a guess', () => {
    expect(Object.fromEntries(exported.map((t) => [t.id, t.strategy]))).toEqual(APPROVED)
    expect(exported.filter((t) => t.strategy.guesses).map((t) => t.id)).toHaveLength(10)
  })

  it('carries no hand-set Brick: its Brick is the one picked from its Strategy', () => {
    for (const type of exported) expect(type.brick, type.id).toBeUndefined()
    expect(RAW.match(/"brick"/g)).toHaveLength(4)
  })

  it('takes the name the Bricks page in Figma uses', () => {
    const names = new Map(exported.map((t) => [t.id, t.name]))
    expect(names.get('diy')).toBe('Self-directed Investing')
    expect(names.get('gmi')).toBe('GMI')
    expect(names.get('tax-saving')).toBe('Tax Saving SSF')
    expect(names.get('e-savings')).toBe('Savings')
    expect(names.get('rmf')).toBe('RMF for Retirement')
    expect(names.get('thai-esg')).toBe('Thai ESG')
    expect(names.get('definit-global-select')).toBe('Definit Global Select')
    expect(names.get('definit-set-select')).toBe('Definit SET Select')
    expect(names.get('money-market')).toBe('Money Market')
    expect(names.get('kkp-finsave')).toBe('KKP Finsave')
  })
})

describe('a Plan type that is not exported', () => {
  const exported = new Set(exportedPlanTypes(defaultPlanTypes()).map((t) => t.id))
  const rest = defaultPlanTypes().filter((t) => !exported.has(t.id))

  it('is one of four, with neither a Collection nor a Strategy', () => {
    expect(rest.map((t) => t.id)).toEqual(['investment-call', 'thai-stocks', 'global-stocks', 'bonds'])
    for (const t of rest) {
      expect(t.collection).toBeUndefined()
      expect(t.strategy).toBeUndefined()
    }
  })

  it('keeps its hand-set Brick, with a seed of its own, and the Brick draws', () => {
    expect(new Set(rest.map((t) => t.brick?.seed)).size).toBe(4)
    for (const t of rest) expect(generateBrick(t.brick!).flat().some(Boolean), t.id).toBe(true)
  })
})

describe('the six new Plan types', () => {
  const NEW = ['definit-global-select', 'definit-set-select', 'rmf', 'thai-esg', 'money-market', 'kkp-finsave']
  const types = defaultPlanTypes()

  it('each have a Plan colour of a Tint its colour family has', () => {
    for (const id of NEW) {
      const type = types.find((t) => t.id === id)!
      expect(familyTints(type.colour.family), id).toContain(type.colour.tint)
    }
  })

  it('are the only Plan types left out of draws', () => {
    expect(types.filter((t) => !t.inDraws).map((t) => t.id).sort()).toEqual([...NEW].sort())
  })
})

describe('planTypesJson', () => {
  it('writes the Plan types back exactly as planTypes.json holds them', () => {
    expect(planTypesJson(defaultPlanTypes())).toBe(RAW)
  })

  it('writes an exported Plan type’s Collection and Strategy, with Monthly Cost, Expected Return and Content Type where it has them, and no Brick', () => {
    const goal = defaultPlanTypes().find((t) => t.id === 'goal')!
    const written = planTypesJson([{ ...goal, strategy: { ...goal.strategy!, monthlyCost: 1000, expectedReturn: '5-7%', contentType: 'Goal based', guesses: ['monthlyCost'] } }])
    expect(written).toBe(
      '[\n  { "id": "goal", "name": "Goal", "family": "orange", "tint": 100, "collection": "Goals", "strategy": { "investmentStyle": "dollar-cost-average", "risk": ["low", "high"], "initialCost": 20000, "monthlyCost": 1000, "expectedReturn": "5-7%", "contentType": "Goal based", "guesses": ["monthlyCost"] }, "inDraws": true }\n]\n',
    )
  })
})

describe('planTypesJson for a Plan type that is not exported', () => {
  it('writes its hand-set Brick, with the Pattern Builder settings it sets', () => {
    const bonds = defaultPlanTypes().find((t) => t.id === 'bonds')!
    expect(planTypesJson([{ ...bonds, brick: { ...bonds.brick!, guidance: 0, blockCount: 2 } }])).toBe(
      '[\n  { "id": "bonds", "name": "หุ้นกู้", "family": "green", "tint": 75, "brick": { "family": "auto", "slope": "75", "seed": "bonds", "guidance": 0, "blockCount": 2 }, "inDraws": true }\n]\n',
    )
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
