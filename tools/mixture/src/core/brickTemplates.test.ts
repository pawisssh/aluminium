import { describe, expect, it } from 'vitest'
import { BRICK_GRIDS, DEFAULT_BRICK_GRID, generateBrick } from './brick'
import { BRICK_TEMPLATES, cellsKey, otherTemplate, ruleProblems, templateBrick, templateChoices } from './brickTemplates'

describe('BRICK_TEMPLATES', () => {
  it('lists each Reference Pattern with a Brick family and Slope once', () => {
    expect(BRICK_TEMPLATES.length).toBeGreaterThan(100)
    expect(new Set(BRICK_TEMPLATES.map((t) => t.key)).size).toBe(BRICK_TEMPLATES.length)
  })

  it('draws a template Brick on every Brick grid, whatever its seed', () => {
    const template = BRICK_TEMPLATES[0]!
    for (const { grid } of BRICK_GRIDS) {
      const cells = generateBrick({ family: 'auto', slope: 'half', seed: 'a', template: template.key }, grid)
      expect([cells.length, cells[0]!.length]).toEqual([grid.rows, grid.cols])
      expect(cellsKey(generateBrick({ family: 'auto', slope: 'half', seed: 'b', template: template.key }, grid))).toBe(cellsKey(cells))
    }
  })
})

describe('ruleProblems', () => {
  it('tags some templates on a 4×4 Brick grid, as the gallery does', () => {
    const tagged = BRICK_TEMPLATES.filter((t) => ruleProblems(templateBrick(t, DEFAULT_BRICK_GRID), t.family, t.slope).length > 0)
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.length).toBeLessThan(BRICK_TEMPLATES.length)
  })

  it('tags a hanging Brick that reaches the bottom', () => {
    const cells = [[true, true, true, true], [true, true, true, false], [true, true, false, false], [true, false, false, false]]
    expect(ruleProblems(cells, 'hanging', 'half')).toContain('touches bottom')
  })
})

describe('templateChoices', () => {
  it('offers one template per shape, of the Brick family and Slope, keeping the rules', () => {
    const choices = templateChoices('hanging', 'half', DEFAULT_BRICK_GRID)
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.every((t) => t.family === 'hanging' && t.slope === 'half')).toBe(true)
    const shapes = choices.map((t) => templateBrick(t, DEFAULT_BRICK_GRID))
    expect(new Set(shapes.map(cellsKey)).size).toBe(choices.length)
    expect(shapes.every((cells) => ruleProblems(cells, 'hanging', 'half').length === 0)).toBe(true)
  })

  it('offers every Brick family for Auto', () => {
    expect(new Set(templateChoices('auto', 'half', DEFAULT_BRICK_GRID).map((t) => t.family))).toEqual(new Set(['rising', 'hanging', 'mountain']))
  })
})

describe('otherTemplate', () => {
  const choices = templateChoices('rising', 'half', DEFAULT_BRICK_GRID)

  it('picks a different template while there is one', () => {
    for (let i = 0; i < 20; i++) expect(otherTemplate(choices, choices[0]!.key)!.key).not.toBe(choices[0]!.key)
    expect(otherTemplate(choices.slice(0, 1), choices[0]!.key)).toBe(choices[0])
    expect(otherTemplate([], undefined)).toBeUndefined()
  })
})
