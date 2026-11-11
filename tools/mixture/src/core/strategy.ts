/** How money goes into a Plan type. */
export type InvestmentStyle = 'one-time' | 'dollar-cost-average' | 'market-timing'

export type RiskLevel = 'low' | 'medium' | 'high'

/** One level, or a range from a lower level to a higher one. The plan picker's "very low" is kept as low. */
export type Risk = RiskLevel | [RiskLevel, RiskLevel]

/** The seven steps an Initial Cost sits on, in baht. */
export const INITIAL_COST_STEPS = [1, 5_000, 20_000, 50_000, 500_000, 2_000_000, 10_000_000] as const
export type InitialCost = (typeof INITIAL_COST_STEPS)[number]

/** A Plan type's six values in the Pattern Guidelines. The first three set its Brick; the rest are kept where the plan picker shows them. */
export interface Strategy {
  investmentStyle: InvestmentStyle
  risk: Risk
  initialCost: InitialCost
  /** In baht. */
  monthlyCost?: number
  /** As the plan picker words it. */
  expectedReturn?: string
  /** As the plan picker words it. */
  contentType?: string
  /** The values above that are guesses, with no source yet. */
  guesses?: StrategyValue[]
}

export type StrategyValue = Exclude<keyof Strategy, 'guesses'>

const INVESTMENT_STYLES: Record<InvestmentStyle, string> = {
  'one-time': 'One-time',
  'dollar-cost-average': 'Dollar Cost Average',
  'market-timing': 'Market Timing',
}

const baht = (n: number) => `${n.toLocaleString('en-US')} ฿`

/** One value of a Strategy, worded for reading, and whether it is a guess. */
export interface StrategyPart {
  value: StrategyValue
  text: string
  guess: boolean
}

/** A Strategy read out value by value: Investment Style, Risk and Initial Cost, then the other three where it has them. */
export function strategyLine(strategy: Strategy): StrategyPart[] {
  const parts: [StrategyValue, string | undefined][] = [
    ['investmentStyle', INVESTMENT_STYLES[strategy.investmentStyle]],
    ['risk', `Risk ${[strategy.risk].flat().join(' to ')}`],
    ['initialCost', `Initial Cost ${baht(strategy.initialCost)}`],
    ['monthlyCost', strategy.monthlyCost === undefined ? undefined : `Monthly Cost ${baht(strategy.monthlyCost)}`],
    ['expectedReturn', strategy.expectedReturn && `Expected Return ${strategy.expectedReturn}`],
    ['contentType', strategy.contentType && `Content Type ${strategy.contentType}`],
  ]
  return parts.flatMap(([value, text]) => (text ? [{ value, text, guess: strategy.guesses?.includes(value) ?? false }] : []))
}
