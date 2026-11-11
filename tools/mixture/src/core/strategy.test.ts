import { describe, expect, it } from 'vitest'
import { strategyLine } from './strategy'

describe('strategyLine', () => {
  it('reads out Investment Style, Risk and Initial Cost, in that order', () => {
    expect(strategyLine({ investmentStyle: 'one-time', risk: 'medium', initialCost: 500_000 })).toEqual([
      { value: 'investmentStyle', text: 'One-time', guess: false },
      { value: 'risk', text: 'Risk medium', guess: false },
      { value: 'initialCost', text: 'Initial Cost 500,000 ฿', guess: false },
    ])
  })

  it('names each Investment Style and reads a Risk range from its lower level to its higher one', () => {
    const texts = (line: ReturnType<typeof strategyLine>) => line.map((part) => part.text)
    expect(texts(strategyLine({ investmentStyle: 'dollar-cost-average', risk: ['low', 'high'], initialCost: 20_000 }))).toEqual(['Dollar Cost Average', 'Risk low to high', 'Initial Cost 20,000 ฿'])
    expect(texts(strategyLine({ investmentStyle: 'market-timing', risk: ['medium', 'high'], initialCost: 10_000_000 }))).toEqual(['Market Timing', 'Risk medium to high', 'Initial Cost 10,000,000 ฿'])
  })

  it('marks only the values that are guesses', () => {
    const line = strategyLine({ investmentStyle: 'one-time', risk: 'medium', initialCost: 1, guesses: ['risk'] })
    expect(line.map((part) => [part.value, part.guess])).toEqual([
      ['investmentStyle', false],
      ['risk', true],
      ['initialCost', false],
    ])
  })

  it('adds Monthly Cost, Expected Return and Content Type where the Strategy has them', () => {
    const line = strategyLine({ investmentStyle: 'dollar-cost-average', risk: 'high', initialCost: 5_000, monthlyCost: 1_000, expectedReturn: '5-7%', contentType: 'Goal based', guesses: ['expectedReturn'] })
    expect(line.slice(3)).toEqual([
      { value: 'monthlyCost', text: 'Monthly Cost 1,000 ฿', guess: false },
      { value: 'expectedReturn', text: 'Expected Return 5-7%', guess: true },
      { value: 'contentType', text: 'Content Type Goal based', guess: false },
    ])
  })
})
