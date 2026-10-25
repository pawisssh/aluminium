import { REFERENCE_PATTERN_MASKS } from './referencePatternMasks.js';
import type { Block, Grid, Slope } from './types.js';

/**
 * Reference Patterns: the allowed shape set. 18 come from the Figma "Patterns (v1)" page, 40 from the
 * artworks in use on "[v2] Design - Plan Select" (Playlist Cover and Plan Cover pages), and the rest
 * from generated Patterns approved on the review page (scripts/promote-approved-references.ts).
 * `patternSimilarity` tells how close a Page is to one of them. The masks are generated into
 * referencePatternMasks.ts from the test fixtures (scripts/figma-reference-masks.mjs).
 */

export type ReferenceFamily = 'rising' | 'hanging' | 'mountain' | 'accent';

export interface ReferencePattern {
  figmaNode: string;
  /** 'patterns-v1': the guideline page; 'in-use': an artwork shipped on Plan Select; 'approved': a review ✓. */
  source: 'patterns-v1' | 'in-use' | 'approved';
  /** 16 rows of 16 characters, '#' = Block cell. */
  mask: readonly string[];
  family: ReferenceFamily;
  /** Null for an accent (one corner Block has no trend); accents fit any Slope filter. */
  slope: Slope | null;
}

export const REFERENCE_SIZE = 16;

/** Hangs from the top edge, steps down to the left, does not touch the bottom. */
const HANGING = new Set([
  '71:1986', '71:892', '71:2772', '71:261',
  // in use
  '18:1855', '18:1877', '18:1886', '387:871', '18:936', '18:985', '17:407', '17:436', '386:272',
  '386:188', '6:833', '6:682', '10:4568', '10:4596', '14:611', '10:4648', '6:959', '668:199', '6:878', '18:1034',
]);
/**
 * A mass floating off the left/right edges: touches the top only (71:635), top and bottom (71:957) or the
 * top-right corner only (14:630).
 */
const MOUNTAIN = new Set(['71:635', '71:957', '14:630']);
/** A single Block in a corner. Everything not listed here is `rising`. */
const ACCENT = new Set(['111:451', '111:510']);

/** Trends (degrees, y up, over covered cell centres) below FLAT_BELOW are flat, below STEEP_FROM half. */
export const FLAT_BELOW = 12;
const STEEP_FROM = 30;

/**
 * Least-squares trend of centre points (x right, y up), in degrees: how a shape rises to the right.
 * Null for fewer than two points; with no horizontal spread it is 90, -90 or 0 by the vertical spread.
 * The generator, template mode and the Reference Pattern classification all measure growth with it.
 */
export function trendDegrees(points: readonly (readonly [number, number])[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0) return sxy > 0 ? 90 : sxy < 0 ? -90 : 0;
  return (Math.atan(sxy / sxx) * 180) / Math.PI;
}

/** Trend of a mask's covered cell centres, in degrees (y up). */
function maskTrend(mask: readonly string[]): number {
  const pts: [number, number][] = [];
  mask.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '#') pts.push([c + 0.5, mask.length - r - 0.5]);
    })
  );
  return trendDegrees(pts) ?? 0;
}

/** Covered cell centres of Blocks (x right, y up). */
function cellPoints(blocks: readonly Block[], grid: Grid): [number, number][] {
  const seen = new Set<number>();
  const pts: [number, number][] = [];
  for (const b of blocks) {
    for (let c = b.col; c < b.col + b.w; c++) {
      for (let r = b.row; r < b.row + b.h; r++) {
        const k = r * grid.cols + c;
        if (seen.has(k)) continue;
        seen.add(k);
        pts.push([c + 0.5, grid.rows - r - 0.5]);
      }
    }
  }
  return pts;
}

/**
 * Trend of the covered cells, in degrees (y up). A wide Grid is squeezed to a square first, so it is not
 * held to a steepness it cannot reach; a tall Grid is measured in cells, as the review verdicts were.
 */
export function cellTrend(blocks: readonly Block[], grid: Grid): number | null {
  const sx = grid.cols > grid.rows ? grid.rows / grid.cols : 1;
  return trendDegrees(cellPoints(blocks, grid).map(([x, y]) => [x * sx, y] as const));
}

/** Steps in the top profile: how often the highest covered row changes from one column to the next. */
export function staircaseSteps(blocks: readonly Block[], grid: Grid): number {
  const tops = Array.from({ length: grid.cols }, () => -1);
  for (const b of blocks) {
    for (let c = Math.max(0, b.col); c < Math.min(grid.cols, b.col + b.w); c++) {
      if (tops[c] === -1 || b.row < tops[c]!) tops[c] = b.row;
    }
  }
  let steps = 0;
  for (let c = 1; c < grid.cols; c++) if (tops[c] !== tops[c - 1]) steps++;
  return steps;
}

/** Most steps a Reference Pattern has across 16 columns; more reads as a busy staircase (verdicts). */
export const MAX_STEPS_PER_16 = 7;

/** Grids with a shorter side than this are too coarse to measure a trend by (review verdicts). */
const TREND_MEASURABLE_FROM = 8;

/**
 * Guideline shape checks the generator applies on top of the Pattern rules (from the review verdicts):
 * a 75% Pattern rises at least STEEP_FROM degrees (on a Coarse Grid the cells are too few to tell, and
 * half the approved Coarse 75% Patterns measured less), and no Pattern has more staircase steps than
 * the references, scaled to the Grid width. Returns the problem, or null.
 */
export function slopeShapeProblem(blocks: readonly Block[], grid: Grid, slope: Slope): 'shallow75' | 'steps' | null {
  const measurable = Math.min(grid.cols, grid.rows) >= TREND_MEASURABLE_FROM;
  if (slope === '75' && measurable && blocks.length >= 2 && (cellTrend(blocks, grid) ?? 90) < STEEP_FROM) return 'shallow75';
  const maxSteps = Math.max(MAX_STEPS_PER_16, Math.round((MAX_STEPS_PER_16 * grid.cols) / REFERENCE_SIZE));
  if (staircaseSteps(blocks, grid) > maxSteps) return 'steps';
  return null;
}

/** The Slope a reference mask belongs to, by its trend and family (null for an accent). */
export function classifyReferenceSlope(mask: readonly string[], family: ReferenceFamily): Slope | null {
  if (family === 'accent') return null;
  const trend = maskTrend(mask);
  if (trend < FLAT_BELOW) return 'flat';
  // A 75% Slope must reach the top-right corner, and mountains never exceed half.
  if (trend < STEEP_FROM || family === 'mountain' || mask[0]![mask[0]!.length - 1] !== '#') return 'half';
  return '75';
}

export const REFERENCE_PATTERNS: readonly ReferencePattern[] = REFERENCE_PATTERN_MASKS.map(
  ({ figmaNode, source, mask, family: given }) => {
    // Approved references carry their family (by edges); the Figma ones are listed above.
    const family: ReferenceFamily = given ?? (ACCENT.has(figmaNode)
      ? 'accent'
      : MOUNTAIN.has(figmaNode)
        ? 'mountain'
        : HANGING.has(figmaNode)
          ? 'hanging'
          : 'rising');
    return { figmaNode, source, mask, family, slope: classifyReferenceSlope(mask, family) };
  }
);

export interface SimilarityFilter {
  family?: ReferenceFamily;
  /** Matches references of this Slope, plus accents (which have none). */
  slope?: Slope;
}

export interface SimilarityResult {
  /** Best intersection-over-union, 0 to 1. */
  iou: number;
  /** The Reference Pattern that scored it; null when nothing overlaps. */
  match: ReferencePattern | null;
}

/** Resamples a Page to 16x16: a cell is covered when its centre lies inside a Block. */
function resample(blocks: readonly Block[], grid: Pick<Grid, 'cols' | 'rows'>): boolean[] {
  const n = REFERENCE_SIZE;
  const out = new Array<boolean>(n * n).fill(false);
  // Each Block marks the sample centres it contains: x in [col, col + w) <=> c in [lo, hi).
  const span = (start: number, len: number, side: number): [number, number] => [
    Math.max(0, Math.ceil((start * n) / side - 0.5)),
    Math.min(n, Math.ceil(((start + len) * n) / side - 0.5)),
  ];
  for (const b of blocks) {
    const [c0, c1] = span(b.col, b.w, grid.cols);
    const [r0, r1] = span(b.row, b.h, grid.rows);
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) out[r * n + c] = true;
  }
  return out;
}

/** Each reference's '#' cells as indices into the 16x16 sample, built once. */
const REF_CELLS = new Map<ReferencePattern, number[]>();
function refCells(ref: ReferencePattern): number[] {
  let cells = REF_CELLS.get(ref);
  if (!cells) {
    cells = [];
    const flat = ref.mask.join('');
    for (let i = 0; i < flat.length; i++) if (flat[i] === '#') cells.push(i);
    REF_CELLS.set(ref, cells);
  }
  return cells;
}

/**
 * How close a Page's Blocks are to the Reference Patterns: the Page is resampled to 16x16, then the best
 * IoU over the references (optionally only those matching `filter`) is returned. No mirroring.
 */
export function patternSimilarity(
  blocks: readonly Block[],
  grid: Pick<Grid, 'cols' | 'rows'>,
  filter: SimilarityFilter = {}
): SimilarityResult {
  const cells = resample(blocks, grid);
  const covered = cells.filter(Boolean).length;
  let best: SimilarityResult = { iou: 0, match: null };
  for (const ref of REFERENCE_PATTERNS) {
    if (filter.family && ref.family !== filter.family) continue;
    if (filter.slope && ref.slope !== null && ref.slope !== filter.slope) continue;
    const own = refCells(ref);
    let inter = 0;
    for (const i of own) if (cells[i]) inter++;
    const iou = inter / (covered + own.length - inter);
    if (iou > best.iou) best = { iou, match: ref };
  }
  return best;
}
