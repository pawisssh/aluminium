import { countCornerMeets } from './generator.js';
import { FLAT_BELOW, trendDegrees } from './referencePatterns.js';
import type { Block, Grid, Slope } from './types.js';

/**
 * Chance that a Pattern with no Corner meet gets one. The guideline allows up to 2 per Page, and
 * about a quarter of the Figma references show one; skyline steers its cuts away from them, so
 * without this step the tall and coarse-celled Grids almost never show one.
 */
export const CORNER_MEET_CHANCE = 0.35;

const transpose = (blocks: readonly Block[]): Block[] =>
  blocks.map((b) => ({ ...b, col: b.row, row: b.col, w: b.h, h: b.w }));

/**
 * Moves the cut between two stacked Blocks of one column onto a horizontal edge of a Block beside
 * that column, so the seams meet at a point: a Corner meet inside the Mass (a crossing gives two), or
 * one on a step of the outline. The cells and the Block count stay as they are, so the shape, the
 * Pattern rules and the similarity to the references do too.
 */
function alignedCuts(blocks: readonly Block[], grid: Grid): Block[][] {
  // A sliver left over reads as a too-small Block (review verdicts).
  const minSide = Math.min(grid.cols, grid.rows) < 16 ? 1 : 2;
  const out: Block[][] = [];
  blocks.forEach((upper, i) => {
    const j = blocks.findIndex((b) => b.col === upper.col && b.w === upper.w && b.row === upper.row + upper.h);
    if (j < 0) return;
    const lower = blocks[j]!;
    const beside = blocks.filter((b) => b.col + b.w === upper.col || b.col === upper.col + upper.w);
    for (const y of new Set(beside.flatMap((b) => [b.row, b.row + b.h]))) {
      if (y === lower.row || y - upper.row < minSide || lower.row + lower.h - y < minSide) continue;
      const next = blocks.slice();
      next[i] = { ...upper, h: y - upper.row };
      next[j] = { ...lower, row: y, h: lower.row + lower.h - y };
      out.push(next);
    }
  });
  return out;
}

/**
 * Moving a cut keeps the cells but shifts the Block centres, so the growth the generator holds every
 * Pattern to is checked again: Block centres trend up to the right (Flat may dip within the flat band).
 */
function keepsGrowth(blocks: readonly Block[], grid: Grid, slope: Slope): boolean {
  const trend = trendDegrees(blocks.map((b) => [b.col + b.w / 2, grid.rows - b.row - b.h / 2] as const));
  return trend === null || (slope === 'flat' ? trend > -FLAT_BELOW : trend > 0);
}

/**
 * Gives a Pattern with no Corner meet one or two, with CORNER_MEET_CHANCE, by aligning a cut with a
 * neighbouring seam (see alignedCuts), within the Corner-meet limit and the Slope's growth. Draws from `rng` only for
 * Patterns of 3+ Blocks with no meet.
 */
export function maybeAddCornerMeet(
  blocks: Block[],
  grid: Grid,
  rng: () => number,
  cornerMeetLimit: number,
  slope: Slope
): Block[] {
  if (blocks.length < 3 || cornerMeetLimit < 1 || countCornerMeets(blocks).length > 0) return blocks;
  if (rng() >= CORNER_MEET_CHANCE) return blocks;
  const turned = { ...grid, cols: grid.rows, rows: grid.cols };
  const candidates = [...alignedCuts(blocks, grid), ...alignedCuts(transpose(blocks), turned).map(transpose)].filter(
    (v) => {
      const meets = countCornerMeets(v).length;
      return meets >= 1 && meets <= cornerMeetLimit && keepsGrowth(v, grid, slope);
    }
  );
  if (candidates.length === 0) return blocks;
  return candidates[Math.floor(rng() * candidates.length)]!;
}
