import { describe, expect, it } from 'vitest'
import { BRICK_GRIDS, generateBrick } from './brick'
import { BRICK_TEMPLATES, cellsKey, drawBrickTemplates, galleryPicks, ruleProblems, templateBrick, templateSettings } from './brickTemplates'

describe('BRICK_TEMPLATES', () => {
  it('lists each Reference Pattern with a Brick family and Slope once', () => {
    expect(BRICK_TEMPLATES.length).toBeGreaterThan(100)
    expect(new Set(BRICK_TEMPLATES.map((t) => t.key)).size).toBe(BRICK_TEMPLATES.length)
  })

  it('draws a template Brick on every Brick grid', () => {
    const template = BRICK_TEMPLATES[0]!
    for (const { grid } of BRICK_GRIDS) {
      const cells = generateBrick(templateSettings(template), grid)
      expect([cells.length, cells[0]!.length]).toEqual([grid.rows, grid.cols])
      expect(cells.flat().some(Boolean)).toBe(true)
    }
  })

  it('ignores the seed of a template Brick', () => {
    const settings = templateSettings(BRICK_TEMPLATES[5]!)
    expect(cellsKey(generateBrick({ ...settings, seed: 'other' }))).toBe(cellsKey(generateBrick(settings)))
  })
})

describe('drawBrickTemplates', () => {
  const keys = BRICK_TEMPLATES.slice(0, 3).map((t) => t.key)

  it('only draws templates in draws, none twice until all are drawn', () => {
    const drawn = drawBrickTemplates(keys, 6).map((t) => t.key)
    expect(new Set(drawn.slice(0, 3))).toEqual(new Set(keys))
    expect(new Set(drawn.slice(3))).toEqual(new Set(keys))
  })

  it('draws nothing when no template is in draws', () => {
    expect(drawBrickTemplates([], 2)).toEqual([])
    expect(drawBrickTemplates(['gone/half/0:0'], 2)).toEqual([])
  })
})

describe('ruleProblems', () => {
  it('tags some templates on a 4×4 Brick grid, as the gallery does', () => {
    const tagged = BRICK_TEMPLATES.filter((t) => ruleProblems(templateBrick(t, BRICK_GRIDS[0]!.grid), t.family, t.slope).length > 0)
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.length).toBeLessThan(BRICK_TEMPLATES.length)
  })

  it('tags a hanging Brick that reaches the bottom', () => {
    const cells = [[true, true, true, true], [true, true, true, false], [true, true, false, false], [true, false, false, false]]
    expect(ruleProblems(cells, 'hanging', 'half')).toContain('touches bottom')
  })
})

describe('galleryPicks', () => {
  it('reads the gallery export, leaving out References this core lacks', () => {
    const [a, b] = BRICK_TEMPLATES
    const json = JSON.stringify({ version: 3, bricks: [a, b, { family: 'rising', slope: 'half', reference: 'nope' }].map(({ family, slope, reference }) => ({ family, slope, reference, sizes: {} })) })
    expect(galleryPicks(json)).toEqual({ keys: [a!.key, b!.key], picks: 3 })
  })

  it('refuses JSON that is not a gallery export', () => {
    expect(() => galleryPicks('{}')).toThrow()
  })
})
