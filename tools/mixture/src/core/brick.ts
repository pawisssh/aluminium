import { getColourway, DEFAULT_COLOURWAY_ID } from '@/vendor/fnm-core/colourway'
import { defaultBlockCountFor, generatePattern } from '@/vendor/fnm-core/generator'
import { createRng } from '@/vendor/fnm-core/prng'
import type { Grid, PatternFamily, Slope } from '@/vendor/fnm-core/types'
import { brickTemplate, templateBrick } from './brickTemplates'

export interface BrickSettings {
  family: PatternFamily
  slope: Slope
  seed: string
  /** The Pattern Builder's own settings; left out, they follow the Brick grid (see `brickDefaults`). */
  blockCount?: number
  guidance?: number
  cornerMeetLimit?: number
  /** A Brick template's key: the Brick is that template, not a generated one. */
  template?: string
}

/** The cells every Brick is drawn on, `cols` across and `rows` down. */
export interface BrickGrid {
  cols: number
  rows: number
}

export const BRICK_GRIDS: { grid: BrickGrid; label: string }[] = [
  { grid: { cols: 4, rows: 4 }, label: '4×4' },
  { grid: { cols: 8, rows: 8 }, label: '8×8' },
  { grid: { cols: 16, rows: 16 }, label: '16×16' },
  { grid: { cols: 4, rows: 6 }, label: '4×6 portrait' },
  { grid: { cols: 8, rows: 12 }, label: '8×12 portrait' },
]

export const DEFAULT_BRICK_GRID: BrickGrid = BRICK_GRIDS[0]!.grid

// The Reference set generated Bricks were made with: a newer one would redraw every seed's Brick.
const BRICK_REFERENCE_SET = 2

/** The Pattern Builder settings a Brick uses when it doesn't set its own. */
export function brickDefaults(grid: BrickGrid = DEFAULT_BRICK_GRID) {
  return { blockCount: defaultBlockCountFor({ ...grid, cellW: 1, cellH: 1 }), guidance: 60, cornerMeetLimit: 1 }
}

/** A Brick as rows of filled cells, row 0 at the top: its Brick template, or else drawn by the Pattern Builder's generator. */
export function generateBrick(settings: BrickSettings, brickGrid: BrickGrid = DEFAULT_BRICK_GRID): boolean[][] {
  const template = settings.template && brickTemplate(settings.template)
  if (template) return templateBrick(template, brickGrid)
  const grid: Grid = { ...brickGrid, cellW: 1, cellH: 1 }
  const defaults = brickDefaults(brickGrid)
  // The colourway only picks Block tints, which a single-colour Brick ignores.
  const blocks = generatePattern(grid, getColourway(DEFAULT_COLOURWAY_ID)!, createRng(settings.seed), {
    family: settings.family,
    slope: settings.slope,
    blockCount: settings.blockCount ?? defaults.blockCount,
    guidance: settings.guidance ?? defaults.guidance,
    cornerMeetLimit: settings.cornerMeetLimit ?? defaults.cornerMeetLimit,
    referenceSet: BRICK_REFERENCE_SET,
  })
  const mask = Array.from({ length: grid.rows }, () => Array<boolean>(grid.cols).fill(false))
  for (const b of blocks)
    for (let r = b.row; r < b.row + b.h; r++) for (let c = b.col; c < b.col + b.w; c++) mask[r]![c] = true
  return mask
}
