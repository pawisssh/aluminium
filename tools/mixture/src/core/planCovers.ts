import { generateBrick, type BrickGrid, type BrickSettings } from './brick'
import type { PatternFamily, Slope } from '@/vendor/fnm-core/types'
// Each Plan type's square artwork on the Plan Select Figma file's "Illustration / Plan Cover" page,
// read off its rectangles onto a 16×16 grid ('#' where a rectangle is).
import PLAN_COVERS from './planCovers.json'

const COVER_SIZE = 16

/** The Plan Cover of a Plan type, as rows of cells; undefined for one with none in Figma. */
export function planCover(planTypeId: string): boolean[][] | undefined {
  const cover = (PLAN_COVERS as Record<string, { mask: string[] }>)[planTypeId]
  return cover?.mask.map((row) => [...row].map((ch) => ch === '#'))
}

/**
 * How much of a Brick and a Plan Cover overlap (cells in both over cells in either), with the
 * Brick scaled up to the Plan Cover's 16×16. Null on a Brick grid that doesn't divide 16 evenly.
 */
export function coverMatch(brick: boolean[][], cover: boolean[][]): number | null {
  const rows = brick.length
  const cols = brick[0]?.length ?? 0
  if (rows === 0 || COVER_SIZE % rows !== 0 || COVER_SIZE % cols !== 0) return null
  let both = 0
  let either = 0
  for (let r = 0; r < COVER_SIZE; r++)
    for (let c = 0; c < COVER_SIZE; c++) {
      const a = brick[(r * rows) / COVER_SIZE | 0]![(c * cols) / COVER_SIZE | 0]!
      const b = cover[r]![c]!
      if (a && b) both++
      if (a || b) either++
    }
  return either === 0 ? 1 : both / either
}

export interface CoverCandidate {
  brick: BrickSettings
  match: number
}

const FAMILIES: PatternFamily[] = ['rising', 'hanging', 'mountain']
const SLOPES: Slope[] = ['flat', 'half', '75']

/**
 * The `count` Bricks closest to a Plan Cover among seeds `${seedPrefix}-${from}` up to `from + tries`,
 * over every Brick family and Slope, best first and each a different drawing.
 */
export function closestBricks(cover: boolean[][], grid: BrickGrid, seedPrefix: string, { from = 0, tries = 200, count = 8 } = {}): CoverCandidate[] {
  const seen = new Map<string, CoverCandidate>()
  for (const family of FAMILIES)
    for (const slope of SLOPES) {
      if (family === 'mountain' && slope === '75') continue
      for (let n = from; n < from + tries; n++) {
        const brick: BrickSettings = { family, slope, seed: `${seedPrefix}-${n}` }
        const mask = generateBrick(brick, grid)
        const match = coverMatch(mask, cover)
        if (match === null) return []
        const key = mask.map((row) => row.map((on) => (on ? 1 : 0)).join('')).join('/')
        if ((seen.get(key)?.match ?? -1) < match) seen.set(key, { brick, match })
      }
    }
  return [...seen.values()].sort((a, b) => b.match - a.match).slice(0, count)
}
