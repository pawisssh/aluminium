import { useEffect, useState } from 'react'
import { DEFAULT_BRICK_GRID, type BrickGrid } from '@/core/brick'
import type { ColourFamily, PlanColour } from '@/core/colours'
import type { MixLayout, MixSize } from '@/core/mix'
import { defaultPlanTypes, drawPlanTypes, type PlanType } from '@/core/planTypes'
import { generateRandomSeed } from '@/vendor/fnm-core/prng'

export interface Plan {
  id: string
  /** The Plan type it is, which gives it its name, Plan colour and Brick. */
  typeId: string
  value: number
  /** Mock daily change in percent, for the preview only. */
  change: number
}

/** A Plan with its Plan type's name, Plan colour and Brick filled in. */
export type ShownPlan = Plan & Pick<PlanType, 'name' | 'colour' | 'brick'>

export interface Portfolio<P extends Plan = Plan> {
  id: string
  name: string
  plans: P[]
  mixSeed: string
}

export interface Playground {
  portfolios: Portfolio[]
  planTypes: PlanType[]
  brickGrid: BrickGrid
  mixSize: MixSize
  mixLayout: MixLayout
  selectedId: string
}

const STORAGE_KEY = 'mixture:v4'

let nextId = 0
export const id = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`

const plan = (typeId: string, value: number, change = 0): Plan => ({ id: id(), typeId, value, change })

/** The Portfolios on the Dashboard 3.0 Figma frame, with today's Plan types standing in for its Plans. */
export function initialPlayground(): Playground {
  const portfolios: Portfolio[] = [
    { id: id(), name: 'Investments', mixSeed: 'investments', plans: [plan('ggg', 185230.5, 8.36), plan('gmi', 78508.32, -4.32), plan('diy', 51777.99, -2.32)] },
    { id: id(), name: 'Retirement', mixSeed: 'retirement', plans: [plan('tax-saving', 98000, 1.12), plan('first-million', 42356.67, 0.54), plan('thai-stocks', 15000, -0.81)] },
    { id: id(), name: 'Cash', mixSeed: 'cash', plans: [plan('e-savings', 40000), plan('money-plus', 26249.43, 0.12)] },
  ]
  return { portfolios, planTypes: defaultPlanTypes(), brickGrid: DEFAULT_BRICK_GRID, mixSize: 4, mixLayout: 'random', selectedId: portfolios[0]!.id }
}

/** The Plans whose Plan type still exists, each with that type's name, Plan colour and Brick. */
export function showPlans(plans: Plan[], types: PlanType[]): ShownPlan[] {
  const byId = new Map(types.map((t) => [t.id, t]))
  return plans.flatMap((p) => {
    const type = byId.get(p.typeId)
    return type ? [{ ...p, name: type.name, colour: type.colour, brick: type.brick }] : []
  })
}

/** Drops what `showPlans` filled in, keeping only what a Plan stores. */
export const storedPlan = ({ id, typeId, value, change }: Plan): Plan => ({ id, typeId, value, change })

export interface MixExample {
  name: string
  size: MixSize
  /** Each Plan's colour family and share of the Portfolio in percent, largest first. */
  shares: [ColourFamily, number][]
}

/** Portfolios that show how an Ordered Mix places its colours in the two Sides. */
export const MIX_EXAMPLES: MixExample[] = [
  { name: 'Right Side first', size: 4, shares: [['navy', 37.5], ['magenta', 25], ['blue', 25], ['yellow', 12.5]] },
  { name: 'Turning rows', size: 4, shares: [['blue', 37.5], ['navy', 31.25], ['magenta', 18.75], ['yellow', 12.5]] },
  { name: 'Tie', size: 4, shares: [['blue', 31.25], ['navy', 31.25], ['yellow', 18.75], ['magenta', 18.75]] },
  { name: 'Four equal', size: 4, shares: [['blue', 25], ['navy', 25], ['magenta', 25], ['yellow', 25]] },
  { name: 'Spill', size: 4, shares: [['blue', 43.75], ['navy', 18.75], ['magenta', 18.75], ['yellow', 18.75]] },
  { name: 'One-cell spill', size: 4, shares: [['blue', 43.75], ['navy', 43.75], ['yellow', 12.5]] },
  { name: 'Skip ahead', size: 4, shares: [['blue', 37.5], ['navy', 31.25], ['green', 25], ['yellow', 6.25]] },
  { name: 'Exactly 50%', size: 4, shares: [['blue', 50], ['navy', 31.25], ['magenta', 12.5], ['yellow', 6.25]] },
  { name: 'Past 75%', size: 4, shares: [['blue', 81.25], ['navy', 12.5], ['magenta', 6.25]] },
  { name: 'Five colours', size: 8, shares: [['blue', 46.875], ['navy', 21.875], ['magenta', 15.625], ['yellow', 9.375], ['violet', 6.25]] },
  { name: 'Tie, five colours', size: 8, shares: [['blue', 31.25], ['navy', 31.25], ['magenta', 18.75], ['yellow', 12.5], ['violet', 6.25]] },
]

/** One Plan per share of a Mix example, worth that many thousand baht, of a Plan type drawn at random. */
export function examplePlans(example: MixExample, types: PlanType[]): Plan[] {
  const drawn = drawPlanTypes(types, example.shares.length)
  return drawn.map((type, i) => plan(type.id, example.shares[i]![1] * 1000))
}

/** A Plan of a Plan type drawn at random, in a Plan colour the Portfolio doesn't use yet while one is free; null when no type is in draws. */
export function newPlan(types: PlanType[], siblings: PlanColour[] = []): Plan | null {
  const [type] = drawPlanTypes(types, 1, siblings)
  return type ? plan(type.id, 10000) : null
}

export function newPortfolio(types: PlanType[]): Portfolio {
  const first = newPlan(types)
  return { id: id(), name: 'New portfolio', mixSeed: generateRandomSeed(), plans: first ? [first] : [] }
}

export { generateRandomSeed }

export const baht = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`

export const portfolioValue = (p: { plans: { value: number }[] }) => p.plans.reduce((a, plan) => a + Math.max(0, plan.value), 0)

function load(): Playground | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Playground) : null
  } catch {
    return null
  }
}

/** The playground state, kept in this browser's storage between visits. */
export function usePlayground() {
  const [state, setState] = useState<Playground>(() => load() ?? initialPlayground())
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage can be unavailable (private windows); the playground still works for this visit.
    }
  }, [state])
  return [state, setState] as const
}
