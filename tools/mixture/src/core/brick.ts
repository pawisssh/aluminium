import { getColourway, DEFAULT_COLOURWAY_ID } from '@/vendor/fnm-core/colourway'
import { generatePattern } from '@/vendor/fnm-core/generator'
import { createRng } from '@/vendor/fnm-core/prng'
import type { Grid, PatternFamily, Slope } from '@/vendor/fnm-core/types'

export const BRICK_SIZE = 4

export interface BrickSettings {
  family: PatternFamily
  slope: Slope
  seed: string
  /** The Pattern Builder's own settings; the defaults suit a 4x4 grid. */
  blockCount?: number
  guidance?: number
  cornerMeetLimit?: number
}

export const BRICK_DEFAULTS = { blockCount: 3, guidance: 60, cornerMeetLimit: 1 } as const

const GRID: Grid = { cols: BRICK_SIZE, rows: BRICK_SIZE, cellW: 1, cellH: 1 }

/** A Brick as rows of filled cells, row 0 at the top, drawn by the Pattern Builder's generator. */
export function generateBrick(settings: BrickSettings): boolean[][] {
  // The colourway only picks Block tints, which a single-colour Brick ignores.
  const blocks = generatePattern(GRID, getColourway(DEFAULT_COLOURWAY_ID)!, createRng(settings.seed), {
    family: settings.family,
    slope: settings.slope,
    blockCount: settings.blockCount ?? BRICK_DEFAULTS.blockCount,
    guidance: settings.guidance ?? BRICK_DEFAULTS.guidance,
    cornerMeetLimit: settings.cornerMeetLimit ?? BRICK_DEFAULTS.cornerMeetLimit,
  })
  const mask = Array.from({ length: BRICK_SIZE }, () => Array<boolean>(BRICK_SIZE).fill(false))
  for (const b of blocks)
    for (let r = b.row; r < b.row + b.h; r++) for (let c = b.col; c < b.col + b.w; c++) mask[r]![c] = true
  return mask
}
