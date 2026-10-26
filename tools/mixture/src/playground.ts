import { useEffect, useState } from 'react'
import type { BrickSettings } from '@/core/brick'
import { COLOUR_FAMILIES, type ColourFamily, type PlanColour } from '@/core/colours'
import type { MixLayout, MixSize } from '@/core/mix'
import { generateRandomSeed } from '@/vendor/fnm-core/prng'

export interface Plan {
  id: string
  name: string
  value: number
  /** Mock daily change in percent, for the preview only. */
  change: number
  colour: PlanColour
  brick: BrickSettings
}

export interface Portfolio {
  id: string
  name: string
  plans: Plan[]
  mixSeed: string
}

export interface Playground {
  portfolios: Portfolio[]
  mixSize: MixSize
  mixLayout: MixLayout
  selectedId: string
}

const STORAGE_KEY = 'mixture:v4'

let nextId = 0
const id = () => `${Date.now().toString(36)}-${(nextId++).toString(36)}`

const plan = (name: string, value: number, change: number, family: ColourFamily, brick: Omit<BrickSettings, 'seed'>, seed: string): Plan => ({
  id: id(),
  name,
  value,
  change,
  colour: { family, tint: 100 },
  brick: { ...brick, seed },
})

/** The Portfolios on the Dashboard 3.0 Figma frame. */
export function initialPlayground(): Playground {
  const portfolios: Portfolio[] = [
    {
      id: id(),
      name: 'Investments',
      mixSeed: 'investments',
      plans: [
        plan('Definit Global Select', 185230.5, 8.36, 'purple', { family: 'rising', slope: '75' }, 'definit'),
        plan('GMI', 78508.32, -4.32, 'green', { family: 'rising', slope: 'half' }, 'gmi'),
        plan('Self-directed Investing', 51777.99, -2.32, 'yellow', { family: 'rising', slope: '75' }, 'self-directed'),
      ],
    },
    {
      id: id(),
      name: 'Retirement',
      mixSeed: 'retirement',
      plans: [
        plan('Tax Saving SSF', 98000, 1.12, 'blue', { family: 'auto', slope: 'half' }, 'ssf'),
        plan('RMF for Retirement', 42356.67, 0.54, 'navy', { family: 'hanging', slope: 'flat' }, 'rmf'),
        plan('Thai ESG', 15000, -0.81, 'yellow', { family: 'mountain', slope: 'half' }, 'thai-esg'),
      ],
    },
    {
      id: id(),
      name: 'Cash',
      mixSeed: 'cash',
      plans: [
        plan('Savings', 40000, 0, 'navy', { family: 'rising', slope: 'flat' }, 'savings'),
        plan('Money Market', 26249.43, 0.12, 'light-grey', { family: 'auto', slope: 'half' }, 'money-market'),
      ],
    },
  ]
  return { portfolios, mixSize: 4, mixLayout: 'random', selectedId: portfolios[0]!.id }
}

export interface MixExample {
  name: string
  size: MixSize
  /** Each Plan's colour family and share of the Portfolio in percent, largest first. */
  shares: [ColourFamily, number][]
}

/** Portfolios that show how an Ordered Mix places its colours in the two Sides. */
export const MIX_EXAMPLES: MixExample[] = [
  { name: 'Right Side first', size: 4, shares: [['navy', 37.5], ['orange', 25], ['blue', 25], ['yellow', 12.5]] },
  { name: 'Turning rows', size: 4, shares: [['blue', 37.5], ['navy', 31.25], ['orange', 18.75], ['yellow', 12.5]] },
  { name: 'Tie', size: 4, shares: [['blue', 31.25], ['navy', 31.25], ['yellow', 18.75], ['orange', 18.75]] },
  { name: 'Four equal', size: 4, shares: [['blue', 25], ['navy', 25], ['orange', 25], ['yellow', 25]] },
  { name: 'Spill', size: 4, shares: [['blue', 43.75], ['navy', 18.75], ['orange', 18.75], ['yellow', 18.75]] },
  { name: 'One-cell spill', size: 4, shares: [['blue', 43.75], ['navy', 43.75], ['yellow', 12.5]] },
  { name: 'Skip ahead', size: 4, shares: [['blue', 37.5], ['navy', 31.25], ['green', 25], ['yellow', 6.25]] },
  { name: 'Exactly 50%', size: 4, shares: [['blue', 50], ['navy', 31.25], ['orange', 12.5], ['yellow', 6.25]] },
  { name: 'Past 75%', size: 4, shares: [['blue', 81.25], ['navy', 12.5], ['orange', 6.25]] },
  { name: 'Five colours', size: 8, shares: [['blue', 46.875], ['navy', 21.875], ['purple', 15.625], ['yellow', 9.375], ['orange', 6.25]] },
  { name: 'Tie, five colours', size: 8, shares: [['blue', 31.25], ['navy', 31.25], ['purple', 18.75], ['yellow', 12.5], ['orange', 6.25]] },
]

/** One Plan per share of a Mix example, worth that many thousand baht. */
export function examplePlans(example: MixExample): Plan[] {
  return example.shares.map(([family, share], i) => plan(`Plan ${i + 1}`, share * 1000, 0, family, { family: 'auto', slope: 'half' }, `${example.name}-${i}`))
}

/** A Plan in a colour family the Portfolio doesn't use yet, while one is free. */
export function newPlan(siblings: Plan[] = []): Plan {
  const all = Object.keys(COLOUR_FAMILIES) as ColourFamily[]
  const unused = all.filter((f) => !siblings.some((p) => p.colour.family === f))
  const families = unused.length > 0 ? unused : all
  return {
    id: id(),
    name: 'New plan',
    value: 10000,
    change: 0,
    colour: { family: families[Math.floor(Math.random() * families.length)]!, tint: 100 },
    brick: { family: 'auto', slope: 'half', seed: generateRandomSeed() },
  }
}

export function newPortfolio(): Portfolio {
  return { id: id(), name: 'New portfolio', mixSeed: generateRandomSeed(), plans: [newPlan()] }
}

export { generateRandomSeed }

export const baht = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`

export const portfolioValue = (p: Portfolio) => p.plans.reduce((a, plan) => a + Math.max(0, plan.value), 0)

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
