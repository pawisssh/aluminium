import { describe, expect, it } from 'vitest'
import { BRICK_GRIDS, generateBrick } from './brick'
import { BRICK_TEMPLATES, cellsKey, drawBrickTemplates, templateSettings } from './brickTemplates'

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
