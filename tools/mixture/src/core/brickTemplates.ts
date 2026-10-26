import { checkPatternRules, COVERAGE_LIMIT } from '@/vendor/fnm-core/patternRules'
import { AREA_RESAMPLE_SET, LATEST_REFERENCE_SET, referencePatternsFor, slopeShapeProblem } from '@/vendor/fnm-core/referencePatterns'
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

/**
 * The rules a template's cells break, as block's Brick gallery tags them (ruleProblems in
 * apps/web/src/gallery/brickShapes.ts): the Pattern rules, the Brick family's anchor (rising stands on
 * the bottom, hanging hangs from the top without reaching the bottom, mountain keeps off the left
 * edge), the 75% top-right corner and the Slope's shape. Empty when it keeps them all.
 */
export function ruleProblems(cells: boolean[][], family: BrickTemplateFamily, slope: Slope): string[] {
  const rows = cells.length
  const cols = cells[0]?.length ?? 0
  const grid = { cols, rows, cellW: 1, cellH: 1 }
  const blocks: Block[] = cells.flatMap((row, r) => row.flatMap((on, c) => (on ? [{ id: `${r}-${c}`, col: c, row: r, w: 1, h: 1, tint: 0 }] : [])))
  if (blocks.length === 0) return ['empty']
  const problems: string[] = []
  const { violations } = checkPatternRules(blocks, grid)
  if (violations.some((v) => v.startsWith('disconnected'))) problems.push('two pieces')
  if (violations.some((v) => v.startsWith('noEdge'))) problems.push('no edge')
  const covered = blocks.length / (cols * rows)
  if (covered > COVERAGE_LIMIT[1]) problems.push('too much cover')
  if (covered < COVERAGE_LIMIT[0]) problems.push('too little cover')
  const top = cells[0]!.some(Boolean)
  const bottom = cells[rows - 1]!.some(Boolean)
  if (family === 'rising' && !bottom) problems.push('misses bottom')
  if (family === 'hanging' && !top) problems.push('misses top')
  if (family === 'hanging' && bottom) problems.push('touches bottom')
  if (family === 'mountain' && cells.some((row) => row[0])) problems.push('touches left')
  if (slope === '75' && !cells[0]![cols - 1]) problems.push('misses top-right')
  const shape = slopeShapeProblem(blocks, grid, slope)
  if (shape === 'shallow75') problems.push('too shallow for 75%')
  if (shape === 'steps') problems.push('too many steps')
  return problems
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

/**
 * The keys of the Brick templates block's Brick gallery exported as picks (its JSON, version 3), and how
 * many picks it held; a pick of a Reference this vendored core doesn't have is left out.
 */
export function galleryPicks(json: string): { keys: string[]; picks: number } {
  const parsed = JSON.parse(json) as { bricks?: { family?: string; slope?: string; reference?: string }[] }
  if (!Array.isArray(parsed.bricks)) throw new Error('Not a Brick gallery export: no bricks list')
  const keys = parsed.bricks.map((b) => `${b.family}/${b.slope}/${b.reference}`).filter((k) => byKey.has(k))
  return { keys: [...new Set(keys)], picks: parsed.bricks.length }
}
