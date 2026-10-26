import { checkPatternRules } from '@/vendor/fnm-core/patternRules'
import { AREA_RESAMPLE_SET, LATEST_REFERENCE_SET, referencePatternsFor } from '@/vendor/fnm-core/referencePatterns'
import { templateMask } from '@/vendor/fnm-core/templateMode'
import type { Block, PatternFamily, Slope } from '@/vendor/fnm-core/types'
import type { BrickGrid, BrickSettings } from './brick'

export type BrickTemplateFamily = Exclude<PatternFamily, 'auto'>

/** A Brick that is one Reference Pattern laid on the Brick grid by area, as block's Brick gallery draws it. */
export interface BrickTemplate {
  /** `family/slope/reference`: the same on every Brick grid, so it keys a Brick and the draws. */
  key: string
  family: BrickTemplateFamily
  slope: Slope
  /** The Reference Pattern it copies (its Figma node). */
  reference: string
  mask: readonly string[]
}

const FAMILIES: BrickTemplateFamily[] = ['rising', 'hanging', 'mountain']
const SLOPES: Slope[] = ['flat', 'half', '75']

/** Every Brick template, by Brick family then Slope, in the Reference list's order. Accents have no Slope, so none is one. */
export const BRICK_TEMPLATES: BrickTemplate[] = FAMILIES.flatMap((family) =>
  SLOPES.flatMap((slope) =>
    referencePatternsFor(LATEST_REFERENCE_SET)
      .filter((p) => p.family === family && p.slope === slope)
      .map((p) => ({ key: `${family}/${slope}/${p.figmaNode}`, family, slope, reference: p.figmaNode, mask: p.mask })),
  ),
)

const byKey = new Map(BRICK_TEMPLATES.map((t) => [t.key, t]))
export const brickTemplate = (key: string) => byKey.get(key)

/** The template's cells on the Brick grid, row 0 at the top. */
export function templateBrick(template: BrickTemplate, grid: BrickGrid): boolean[][] {
  return templateMask(template.mask, { ...grid, cellW: 1, cellH: 1 }, AREA_RESAMPLE_SET)
}

/** Whether cells keep the Pattern rules: one piece, touching an edge, covering at most 75% of the grid. */
export function keepsPatternRules(cells: boolean[][]): boolean {
  const grid = { cols: cells[0]?.length ?? 0, rows: cells.length, cellW: 1, cellH: 1 }
  const blocks: Block[] = cells.flatMap((row, r) => row.flatMap((on, c) => (on ? [{ id: `${r}-${c}`, col: c, row: r, w: 1, h: 1, tint: 0 }] : [])))
  return blocks.length > 0 && checkPatternRules(blocks, grid).ok
}

export const cellsKey = (cells: boolean[][]) => cells.map((row) => row.map((on) => (on ? '#' : '.')).join('')).join('/')

/** The Brick of a template: its Brick family and Slope, so a Brick edited by hand starts from them. */
export const templateSettings = (template: BrickTemplate): BrickSettings => ({ family: template.family, slope: template.slope, seed: template.key, template: template.key })

/** Picks `count` Brick templates from the keys in draws, none twice until every one is picked. */
export function drawBrickTemplates(keys: readonly string[], count: number, random: () => number = Math.random): BrickTemplate[] {
  const pool = keys.flatMap((k) => byKey.get(k) ?? [])
  const picked: BrickTemplate[] = []
  let left: BrickTemplate[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    if (left.length === 0) left = [...pool]
    picked.push(left.splice(Math.floor(random() * left.length), 1)[0]!)
  }
  return picked
}
