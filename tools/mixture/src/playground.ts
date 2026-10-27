import { useEffect, useState } from 'react'
import { DEFAULT_BRICK_GRID, type BrickGrid } from '@/core/brick'
import type { PlanColour } from '@/core/colours'
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
}

export interface Playground {
  portfolios: Portfolio[]
  planTypes: PlanType[]
  brickGrid: BrickGrid
  selectedId: string
}

const STORAGE_KEY = 'mixture:v5'

let nextId = 0
export const id = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`

const plan = (typeId: string, value: number, change = 0): Plan => ({ id: id(), typeId, value, change })

/** The Portfolios on the Dashboard 3.0 Figma frame, with today's Plan types standing in for its Plans. */
export function initialPlayground(): Playground {
  const portfolios: Portfolio[] = [
    { id: id(), name: 'Investments', plans: [plan('ggg', 185230.5, 8.36), plan('gmi', 78508.32, -4.32), plan('diy', 51777.99, -2.32)] },
    { id: id(), name: 'Retirement', plans: [plan('tax-saving', 98000, 1.12), plan('first-million', 42356.67, 0.54), plan('thai-stocks', 15000, -0.81)] },
    { id: id(), name: 'Cash', plans: [plan('e-savings', 40000), plan('money-plus', 26249.43, 0.12)] },
  ]
  return { portfolios, planTypes: defaultPlanTypes(), brickGrid: DEFAULT_BRICK_GRID, selectedId: portfolios[0]!.id }
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

/** One Plan per value in percent, worth that many thousand baht, each of a Plan type drawn at random. */
export function casePlans(values: number[], types: PlanType[]): Plan[] {
  const drawn = drawPlanTypes(types, values.length)
  return drawn.map((type, i) => plan(type.id, Math.round(values[i]! * 1000)))
}

/** A Plan of a Plan type drawn at random, in a Plan colour the Portfolio doesn't use yet while one is free; null when no type is in draws. */
export function newPlan(types: PlanType[], siblings: PlanColour[] = []): Plan | null {
  const [type] = drawPlanTypes(types, 1, siblings)
  return type ? plan(type.id, 10000) : null
}

export function newPortfolio(types: PlanType[]): Portfolio {
  const first = newPlan(types)
  return { id: id(), name: 'New portfolio', plans: first ? [first] : [] }
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
