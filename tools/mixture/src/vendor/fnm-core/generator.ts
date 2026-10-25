import type {
  Block,
  Colourway,
  GeneratorParams,
  Grid,
  Page,
  PatternFamily,
  Slope,
  TextZone,
} from './types.js';
import { checkPatternRules, COVERAGE_LIMIT, patternMasses, repairPatternRules } from './patternRules.js';
import { patternSimilarity, slopeShapeProblem, trendDegrees } from './referencePatterns.js';
import { maybeAddCornerMeet } from './cornerMeet.js';
import { measureClearZoneOverlap } from './textZone.js';
import { GUIDANCE_SIMILARITY_SHARE, TEMPLATE_FROM, templateChance, templatePattern } from './templateMode.js';

/** The generator's preferred Block sizes, in cells per side. Not a rule: any size 1..Grid is valid (ADR 0007). */
export const BASE_BLOCK_SIZES = [1, 2, 3, 4, 6, 8] as const;

export const SLOPES: readonly Slope[] = ['flat', 'half', '75'];
export const PATTERN_FAMILIES: readonly PatternFamily[] = ['auto', 'rising', 'hanging', 'mountain'];

/** Widest Block (cells) and the typical column width the default count is sized for. */
const TYPICAL_COLUMN_WIDTH = 4;
/** Typical Block height (cells) in a stack, and the share of the Page the stacks should cover. */
const TYPICAL_BLOCK_HEIGHT = 3;
const TARGET_COVERAGE = 0.45;
/** Upper limit for any Block count (validation, default and slider range). */
export const MAX_BLOCK_COUNT = 400;

/** Columns the skyline aims for: enough to tile the width with widths <= 8, about 4 cells wide. */
function typicalColumns(grid: Grid): number {
  const minColumns = Math.ceil(grid.cols / BASE_BLOCK_SIZES[BASE_BLOCK_SIZES.length - 1]!);
  return Math.max(grid.cols >= 6 ? 3 : 2, minColumns, Math.round(grid.cols / TYPICAL_COLUMN_WIDTH));
}

/**
 * Default Block count for a Grid: the columns that tile its width (about 4 cells each, at least
 * enough for widths <= 8) times the Blocks stacked per column to cover about 45% of its height
 * (about 3 cells each, heights <= 8). Block sizes are fixed, so a finer Grid gets more Blocks.
 */
export function defaultBlockCountFor(grid: Grid): number {
  // An Extra fine Grid is built at half size (see halvedGrid), so it takes that Grid's count.
  const half = halvedGrid(grid);
  if (half) return defaultBlockCountFor(half);
  const perColumn = Math.max(1, Math.round((TARGET_COVERAGE * grid.rows) / TYPICAL_BLOCK_HEIGHT));
  // At least 3: two Blocks on a Coarse Grid read as a bare corner shape (review verdicts: 3 of 42 approved).
  return Math.max(MIN_DEFAULT_BLOCK_COUNT, Math.min(MAX_BLOCK_COUNT / 2, typicalColumns(grid) * perColumn));
}

const MIN_DEFAULT_BLOCK_COUNT = 3;

/**
 * Grids whose short side is at least this (Square and Portrait Extra fine, custom 32+) are built at
 * half size and doubled. Story and Screen Extra fine (27 across) are only 1.5x their Fine Grid, so
 * halving would make their Blocks bigger than Fine's; they keep the per-cell build.
 */
const HALVE_FROM = 32;

/**
 * The half-size Grid an Extra fine Pattern is built on, or null for other Grids. Built cell by cell
 * at 32 across, the staircase gets twice the steps of a Fine one and its Blocks read as too small
 * (review verdicts: none of 53 approved); doubling a Fine-sized Pattern keeps the brand's rhythm.
 */
function halvedGrid(grid: Grid): Grid | null {
  if (Math.min(grid.cols, grid.rows) < HALVE_FROM) return null;
  return {
    cols: Math.ceil(grid.cols / 2),
    rows: Math.ceil(grid.rows / 2),
    cellW: grid.cellW * 2,
    cellH: grid.cellH * 2,
    ...(grid.cellPx !== undefined ? { cellPx: grid.cellPx * 2 } : {}),
  };
}

/** A Text zone on the half-size Grid that still contains the whole zone once doubled. */
function halveZone(zone: TextZone): TextZone {
  const col = Math.floor(zone.col / 2);
  const row = Math.floor(zone.row / 2);
  return { ...zone, col, row, w: Math.ceil((zone.col + zone.w) / 2) - col, h: Math.ceil((zone.row + zone.h) / 2) - row };
}

/** Blocks from the half-size Grid, doubled and clipped to the full Grid (an odd side loses half a cell). */
function doubleBlocks(blocks: readonly Block[], grid: Grid): Block[] {
  return blocks
    .map((b) => {
      const col = b.col * 2;
      const row = b.row * 2;
      return { ...b, col, row, w: Math.min(b.w * 2, grid.cols - col), h: Math.min(b.h * 2, grid.rows - row) };
    })
    .filter((b) => b.w > 0 && b.h > 0);
}

/** Range the Block count control offers for a Grid: 1 up to about twice the default (at least 4). */
export function blockCountRangeFor(grid: Grid): { min: number; max: number } {
  return { min: 1, max: Math.min(MAX_BLOCK_COUNT, Math.max(4, 2 * defaultBlockCountFor(grid))) };
}

/** Guidance of a new Document; Documents saved before Guidance existed load with 0. */
export const DEFAULT_GUIDANCE = 90;

export function defaultGeneratorParams(grid: Grid): GeneratorParams {
  return { slope: 'half', blockCount: defaultBlockCountFor(grid), cornerMeetLimit: 2, guidance: DEFAULT_GUIDANCE };
}

/** Returns an error message, or null when the (partial) params are valid. */
export function validateGeneratorParams(p: Partial<GeneratorParams>): string | null {
  if (p.slope !== undefined && !SLOPES.includes(p.slope)) {
    return `slope must be one of ${SLOPES.join(', ')}.`;
  }
  if (
    p.blockCount !== undefined &&
    !(Number.isInteger(p.blockCount) && p.blockCount >= 1 && p.blockCount <= MAX_BLOCK_COUNT)
  ) {
    return `blockCount must be an integer from 1 to ${MAX_BLOCK_COUNT}.`;
  }
  if (
    p.cornerMeetLimit !== undefined &&
    !(Number.isInteger(p.cornerMeetLimit) && p.cornerMeetLimit >= 0 && p.cornerMeetLimit <= 10)
  ) {
    return 'cornerMeetLimit must be an integer from 0 to 10.';
  }
  if (p.guidance !== undefined && !(Number.isInteger(p.guidance) && p.guidance >= 0 && p.guidance <= 100)) {
    return 'guidance must be an integer from 0 to 100.';
  }
  if (p.family !== undefined && !PATTERN_FAMILIES.includes(p.family)) {
    return `family must be one of ${PATTERN_FAMILIES.join(', ')}.`;
  }
  return null;
}

/**
 * The generator's preferred Block sizes per side, in cells: {1,2,3,4,6,8} that fit the
 * Grid side, doubled on an Extra fine Grid (built at half size, see halvedGrid). This is the
 * generator's aesthetic palette only, NOT a validity rule: edited Blocks may be any whole number
 * of cells from 1 to the Grid side (`isValidBlockSize`, ADR 0007).
 */
export function generatorBlockSizesFor(grid: Grid): { w: number[]; h: number[] } {
  const k = halvedGrid(grid) ? 2 : 1;
  return {
    w: BASE_BLOCK_SIZES.map((s) => s * k).filter((s) => s <= grid.cols),
    h: BASE_BLOCK_SIZES.map((s) => s * k).filter((s) => s <= grid.rows),
  };
}

/**
 * Corner meets: pairs of Blocks that touch only at a single corner point.
 * Returns the grid-vertex coordinate (col, row; row 0 is the top) of each one.
 */
export function countCornerMeets(blocks: readonly Block[]): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const p = cornerPoint(blocks[i]!, blocks[j]!);
      if (p) out.push(p);
    }
  }
  return out;
}

function cornerPoint(a: Block, b: Block): { col: number; row: number } | null {
  let col: number;
  if (a.col + a.w === b.col) col = b.col;
  else if (b.col + b.w === a.col) col = a.col;
  else return null;
  let row: number;
  if (a.row + a.h === b.row) row = b.row;
  else if (b.row + b.h === a.row) row = a.row;
  else return null;
  return { col, row };
}

// ---------------------------------------------------------------------------
// Skyline generator
// ---------------------------------------------------------------------------

/** Working rectangle with y pointing up: x/y0 is the bottom-left cell. */
interface Rect {
  x: number;
  y0: number;
  w: number;
  h: number;
  tint: number;
}

/** First/last upper-profile height as a fraction of the Grid height, per Slope. */
const RISE: Record<Slope, [number, number]> = {
  flat: [0.2, 0.5],
  half: [0.18, 0.65],
  '75': [0.15, 0.95],
};
/** Band thickness as a fraction of the Grid height, per Slope. */
const BAND_THICKNESS: Record<Slope, number> = { flat: 0.2, half: 0.38, '75': 0.4 };
const COVERAGE_RANGE: [number, number] = [0.3, 0.6];

/**
 * Reference Pattern families the skyline can build (Figma "Patterns (v1)"):
 * - rising: the ground-anchored staircase (a Solid or Band style, see skyline()).
 * - hanging: a Band lifted off the bottom edge whose last column reaches the top, so it touches
 *   top, left and right but not the bottom, stepping down towards the left. Any Slope.
 * - mountain: the staircase inset from the left and right edges, its last column reaching the top;
 *   either lifted off the bottom (touches the top only) or ground-anchored (top and bottom).
 *   Flat and Half only.
 */
type Variant = 'rising' | 'hanging' | 'mountain';
/** Share of seeds per variant: hanging at every Slope, mountain at Flat/Half only, the rest rising. */
const HANGING_SHARE = 0.22;
const MOUNTAIN_SHARE = 0.1;
/** Hanging top profile (fractions of the Grid height) from the first to the last column, per Slope. */
const HANG_RISE: Record<Slope, [number, number]> = {
  flat: [0.7, 1],
  half: [0.5, 1],
  '75': [0.3, 1],
};
/** Mountain top profile, like HANG_RISE; the last column is pinned to the top. Never used at 75%. */
const MOUNTAIN_RISE: Record<Slope, [number, number]> = {
  flat: [0.55, 1],
  half: [0.4, 1],
  '75': [0.4, 1],
};
/** Hanging/lifted Band thickness as a fraction of the Grid height, per Slope. */
const HANG_THICKNESS: Record<Slope, number> = { flat: 0.3, half: 0.38, '75': 0.4 };
/** Smallest Grid side (cells) the hanging and mountain variants are tried on. */
const MIN_VARIANT_SIDE = 8;
const skylineBuilds = (grid: Grid): boolean => grid.cols >= MIN_VARIANT_SIDE && grid.rows >= MIN_VARIANT_SIDE;

/**
 * Coverage below this is a miss (only kept when no attempt does better). One or two Blocks are
 * accent-style Patterns that cover little by nature, and few Blocks on a fine Grid cannot reach
 * the limit at all, so it is capped by what `count` Blocks of the largest size could cover.
 */
function coverageFloor(grid: Grid, count: number): number {
  if (count <= 2) return 0;
  const maxArea = BASE_BLOCK_SIZES[BASE_BLOCK_SIZES.length - 1]! ** 2;
  return Math.min(COVERAGE_LIMIT[0], (0.5 * count * maxArea) / (grid.cols * grid.rows));
}
/** [share of the wanted Block count, attempts] per pass; see skyline(). */
const PASSES: ReadonlyArray<readonly [number, number]> = [
  [1, 40],
  [0.7, 20],
  [0.5, 20],
  [0.3, 20],
];
/**
 * Guidance: at guidance g the skyline prefers attempts whose similarity (IoU) to the Reference Patterns
 * of the Slope is at least GUIDANCE_SIMILARITY_SHARE * g / 100: a soft penalty per missing IoU, small next to the
 * hard-rule penalties. An otherwise good attempt no longer ends the search on its own while it is below
 * that; the search goes on (within the pass's attempts) until one reaches it or GUIDANCE_ATTEMPTS valid
 * attempts have been scored, which bounds the cost on big Grids.
 */
const GUIDANCE_PENALTY = 1000;
const GUIDANCE_ATTEMPTS = 16;
/**
 * Low Guidance frees the skyline (user: Guidance 0 looked like the same Pattern every time): freedom is 1
 * at Guidance 0 and fades to 0 at FREE_UNTIL, where template mode starts taking over. With freedom f the
 * seed draws uneven column widths, a wider spread of column counts, a curved profile with moved ends,
 * a rougher profile and band, fewer and taller Blocks per stack, and more hanging and mountain Patterns.
 * Every extra rng() draw sits behind f > 0, so Guidance >= FREE_UNTIL builds exactly what it did before.
 */
const FREE_UNTIL = TEMPLATE_FROM;
export function freedomFor(guidance: number): number {
  return Math.min(1, Math.max(0, 1 - guidance / FREE_UNTIL));
}
/** Extra hanging / mountain share at full freedom. */
const FREE_VARIANT_SHARE = 0.1;
/** Average stacked Block height (cells) the skyline tries not to go below. */
const MIN_BLOCK_HEIGHT = 2.5;

/** Trend of the Block centres (y up), in degrees; null for fewer than two Blocks. */
function rectsTrend(rects: readonly Rect[]): number | null {
  return trendDegrees(rects.map((r) => [r.x + r.w / 2, r.y0 + r.h / 2] as const));
}

function nearest(list: readonly number[], v: number): number {
  let best = list[0]!;
  for (const x of list) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

/** Can `sum` cells be made from exactly `parts` palette sizes? */
type Feasible = (sum: number, parts: number) => boolean;

/**
 * Feasibility of a sum of exactly `parts` sizes. With the full CI list {1,2,3,4,6,8} every sum
 * from `parts` to 8 * parts works except 8 * parts - 1 and 8 * parts - 3, so no table is needed
 * (Grids can be hundreds of cells wide). Shorter lists only occur on Grids under 8 cells
 * on that axis, where `limit` (the Grid side) bounds the table.
 */
function feasibility(sizes: readonly number[], limit: number): Feasible {
  if (sizes.length === BASE_BLOCK_SIZES.length) {
    return (sum, parts) =>
      parts === 0
        ? sum === 0
        : parts > 0 && sum >= parts && sum <= 8 * parts && sum !== 8 * parts - 1 && sum !== 8 * parts - 3;
  }
  const table: boolean[][] = Array.from({ length: limit + 1 }, () => new Array(limit + 1).fill(false));
  table[0]![0] = true;
  for (let sum = 1; sum <= limit; sum++) {
    for (let parts = 1; parts <= limit; parts++) {
      table[sum]![parts] = sizes.some((z) => z <= sum && table[sum - z]![parts - 1]!);
    }
  }
  return (sum, parts) => table[sum]?.[parts] ?? false;
}

/** Fewest and most parts a stack of `len` cells can have (heights from the size palette, 1 included). */
function partRange(feas: Feasible, len: number, maxSize: number): [number, number] {
  let lo = Math.ceil(len / maxSize);
  while (lo < len && !feas(len, lo)) lo++;
  return [lo, len];
}

/**
 * Splits the Page width into exactly `k` palette widths, as even as the palette allows.
 * Tiles the whole width when possible, otherwise as much of it as the palette allows.
 */
function composeWidths(
  cols: number,
  k: number,
  widths: readonly number[],
  wfeas: Feasible,
  rng: () => number,
  noise = 0.3
): number[] | null {
  let total = cols;
  while (total > 0 && !wfeas(total, k)) total--;
  if (total === 0) return null;
  const out: number[] = [];
  for (let left = k; left > 0; left--) {
    const options = widths
      .filter((w) => w <= total && wfeas(total - w, left - 1))
      .map((w) => ({ w, key: Math.abs(w - total / left) + rng() * (total / left) * noise }))
      .sort((a, b) => a.key - b.key);
    const w = options[0]!.w;
    out.push(w);
    total -= w;
  }
  return out;
}

interface Context {
  grid: Grid;
  sizes: { w: number[]; h: number[] };
  feas: Feasible;
  wfeas: Feasible;
  lens: number[];
  slope: Slope;
  count: number;
  band: boolean;
  shadow: boolean;
  shadowHeight: number;
  /** Hanging / lifted Band: the lower profile stays at least `lift` cells above the bottom edge. */
  lift: number;
  variant: Variant;
  /** Hangs from the top: the last column reaches the top edge at every Slope. */
  pinTop: boolean;
  /** Empty columns kept at the left and right Page edges (mountain). */
  inset: { left: number; right: number };
  /** Area no Block may touch (y up, half-open: x0 <= x < x1, y0 <= y < y1). */
  obstacle: Obstacle | null;
  /** Low-Guidance freedom, 0..1 (see freedomFor); 0 builds exactly as before it existed. */
  free: number;
  /** Free mode's per-seed profile: curvature exponent and end offsets (fractions of the height). */
  profile: { gamma: number; first: number; last: number };
  /** Free mode's column widths without slivers (no 1-cell columns, no 2-cell ones on 16+ Grids). */
  freeWidths: { w: number[]; wfeas: Feasible } | null;
}

interface Obstacle {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function hitsObstacle(r: Rect, o: Obstacle | null): boolean {
  return !!o && r.x < o.x1 && o.x0 < r.x + r.w && r.y0 < o.y1 && o.y0 < r.y0 + r.h;
}

/** Random stack of exactly `parts` palette heights summing to `len`, avoiding `avoid` edges. */
function decompose(
  ctx: Context,
  len: number,
  parts: number,
  y0: number,
  avoid: ReadonlySet<number>,
  rng: () => number
): number[] {
  let best: number[] = [];
  let bestConflicts = Infinity;
  for (let t = 0; t < 8 && bestConflicts > 0; t++) {
    const seq: number[] = [];
    let remaining = len;
    for (let p = parts; p > 0; p--) {
      const feasible = ctx.sizes.h.filter((z) => z <= remaining && ctx.feas(remaining - z, p - 1));
      // Steer the cut away from the neighbour's edges (a shared cut makes Corner meets).
      const clean = feasible.filter((z) => z === remaining || !avoid.has(y0 + len - remaining + z));
      let options = clean.length > 0 ? clean : feasible;
      // Free mode leaves out 1-cell slivers where it can (review: "Block เล็กเกิน").
      if (ctx.free > 0 && ctx.grid.rows >= MIN_VARIANT_SIDE) {
        const noSliver = (o: number) => o > 1 && remaining - o >= 2 * (p - 1);
        const pool = [options, clean, feasible].map((l) => l.filter(noSliver)).find((l) => l.length > 0);
        if (pool) options = pool;
      }
      // Heights near the even split, so stacks are made of a few sizeable Blocks, not slivers.
      const even = remaining / p;
      let z = options[0]!;
      let zKey = Infinity;
      for (const o of options) {
        const key = Math.abs(o - even) + rng() * even * 0.6;
        if (key < zKey) {
          zKey = key;
          z = o;
        }
      }
      seq.push(z);
      remaining -= z;
    }
    let y = y0;
    let conflicts = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      y += seq[i]!;
      if (avoid.has(y)) conflicts++;
    }
    if (conflicts < bestConflicts) {
      bestConflicts = conflicts;
      best = seq;
    }
  }
  return best;
}

/** One randomized skyline: columns with a lower and an upper profile, split into stacks. */
function buildSkyline(ctx: Context, rng: () => number): Rect[] | null {
  const { cols, rows } = ctx.grid;
  const { count, band, shadow, feas } = ctx;
  const minH = ctx.sizes.h[0]!;

  // Columns: widths from the size palette that tile the Page width exactly.
  // Widths stay in the palette (<= 8), so a wider Grid simply gets more columns.
  const spread = 1 + Math.round(ctx.free);
  const kWanted = typicalColumns(ctx.grid) + Math.floor(rng() * (2 * spread + 1)) - spread;
  const span = cols - ctx.inset.left - ctx.inset.right;
  const kMin = Math.ceil(span / ctx.sizes.w[ctx.sizes.w.length - 1]!);
  const kStart = Math.min(span, Math.max(2, kMin, Math.min(kWanted, shadow ? Math.floor(count / 3) : count)));
  // Prefer a column count whose widths tile the Page width exactly (nearest to kStart
  // first); otherwise tile as much as possible and leave the remainder at the left edge.
  const kLow = Math.max(2, kMin);
  const order: number[] = [];
  for (let d = 0; d <= span; d++) {
    for (const k of d === 0 ? [kStart] : [kStart + d, kStart - d]) {
      if (k >= kLow && k <= span) order.push(k);
    }
  }
  let widths: number[] | null = null;
  // Free mode: uneven widths from the palette without slivers; falls back to the even split below.
  const fw = ctx.freeWidths;
  if (fw) {
    for (const k of order) {
      if (!fw.wfeas(span, k)) continue;
      widths = composeWidths(span, k, fw.w, fw.wfeas, rng, 0.3 + 2 * ctx.free);
      if (widths) break;
    }
  }
  if (!widths) for (const k of order) {
    if (!ctx.wfeas(span, k)) continue;
    widths = composeWidths(span, k, ctx.sizes.w, ctx.wfeas, rng);
    if (widths) break;
  }
  if (!widths) {
    for (const k of order) {
      widths = composeWidths(span, k, ctx.sizes.w, ctx.wfeas, rng);
      if (widths) break;
    }
  }
  if (!widths) return null;
  // A column that must reach the top edge but crosses the obstacle would be lifted above it and
  // float. Give the last column just the strip right of the obstacle, so it climbs from the bottom.
  const ob0 = ctx.obstacle;
  const right = cols - ctx.inset.right;
  if (ob0 && (ctx.slope === '75' || ctx.pinTop) && ob0.x1 < right && ob0.x1 > right - widths[widths.length - 1]!) {
    const lastW = Math.max(0, ...ctx.sizes.w.filter((w) => w <= right - ob0.x1));
    const restSpan = span - lastW;
    if (lastW > 0 && restSpan > 0) {
      // As many columns as before where they tile the rest exactly, else the nearest count that does.
      for (const n of order.map((o) => o - 1).filter((n) => n >= 1 && ctx.wfeas(restSpan, n))) {
        const rest = composeWidths(restSpan, n, ctx.sizes.w, ctx.wfeas, rng);
        if (rest) {
          widths = [...rest, lastW];
          break;
        }
      }
    }
  }
  const k = widths.length;

  // Profiles, as fractions of the Grid height.
  const [first, last] = (
    ctx.variant === 'hanging' ? HANG_RISE : ctx.variant === 'mountain' ? MOUNTAIN_RISE : RISE
  )[ctx.slope];
  const { gamma, first: dFirst, last: dLast } = ctx.profile;
  const from = Math.max(0.08, first + dFirst);
  const to = Math.min(1, Math.max(from + 0.1, last + dLast));
  const roughness = 0.06 + 0.12 * ctx.free;
  const upper = widths.map((_, i) => {
    const t = (k === 1 ? 1 : i / (k - 1)) ** gamma;
    return from + (to - from) * t + (rng() - 0.5) * roughness;
  });
  if (k >= 4 && ctx.slope !== 'flat' && rng() < 0.5) {
    const j = 2 + Math.floor(rng() * (k - 2));
    upper[j]! -= 0.06 + rng() * 0.1;
  }
  // A band thick enough that its columns hold the wanted Blocks at about 2.5 cells each.
  const thick = Math.max(
    (ctx.variant !== 'rising' ? HANG_THICKNESS : BAND_THICKNESS)[ctx.slope] + (rng() - 0.5) * (0.1 + 0.2 * ctx.free),
    Math.min(0.6, ((count / k) * MIN_BLOCK_HEIGHT) / rows)
  );

  let x = cols - ctx.inset.right - widths.reduce((a, b) => a + b, 0);
  const xs = widths.map((w) => {
    const at = x;
    x += w;
    return at;
  });

  /** Corner meets between a candidate column and the previous one. */
  const meetsBetween = (left: readonly Rect[], right: readonly Rect[]): number => {
    let m = 0;
    for (const a of left) {
      for (const b of right) {
        if (
          (a.x + a.w === b.x || b.x + b.w === a.x) &&
          (a.y0 + a.h === b.y0 || b.y0 + b.h === a.y0)
        ) {
          m++;
        }
      }
    }
    return m;
  };

  // Columns left to right. Each tries a few variants (length, stack split, cap) and
  // keeps the one that makes the fewest Corner meets with its left neighbour.
  const capRects: Rect[] = [];
  const mainRects: Rect[] = [];
  let prev: Rect[] = [];
  let used = 0;
  // Wanted height of every column from the right, so the Block count is shared out by height:
  // tall columns get tall stacks of sizeable Blocks, short ones a Block or two (no slivers).
  const wantedHeight = upper.map((u) => {
    const top = Math.max(minH, u * rows);
    return band ? Math.max(minH, Math.min(top, thick * rows)) : top;
  });
  const heightLeft: number[] = new Array(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) heightLeft[i] = heightLeft[i + 1]! + wantedHeight[i]!;
  for (let i = 0; i < k; i++) {
    // A 75% Slope climbs to the top-right corner: the last column always reaches the top edge.
    const pinTop = (ctx.slope === '75' || ctx.pinTop) && i === k - 1;
    const topWanted = pinTop ? rows : Math.max(minH + ctx.lift, upper[i]! * rows);
    let lowWanted = 0;
    if (band) lowWanted = topWanted - thick * rows;
    // A lifted or inset Band is pinned to the top, so its steps can be taller than the Band is thick:
    // its lower edge must never end above the previous column's top, or the two would not touch.
    const maxLow =
      ctx.variant !== 'rising' && prev.length > 0 ? Math.max(...prev.map((r) => r.y0 + r.h)) - 1 : Infinity;
    lowWanted = Math.min(lowWanted, maxLow);
    // Vertical room for this column: the whole Page height, unless it crosses the
    // obstacle, in which case it is capped below it or starts above it (whichever
    // is nearer the wanted height). With no room on either side the column is skipped.
    let floor = ctx.lift;
    let ceil = rows;
    const ob = ctx.obstacle;
    if (ob && xs[i]! < ob.x1 && ob.x0 < xs[i]! + widths[i]!) {
      const below = ob.y0 - ctx.lift >= minH;
      const above = rows - Math.max(ob.y1, ctx.lift) >= minH;
      if (!below && !above) {
        prev = [];
        continue;
      }
      // Keep the mass in one piece: take the side that still touches the column on the left.
      const prevLow = Math.min(...prev.map((r) => r.y0));
      const prevTop = Math.max(...prev.map((r) => r.y0 + r.h));
      const touchesBelow = prev.length === 0 || prevLow < ob.y0;
      const touchesAbove = prev.length === 0 || prevTop > Math.max(ob.y1, ctx.lift);
      const nearerBelow = Math.max(0, topWanted - ob.y0) <= Math.max(0, ob.y1 - topWanted);
      if (below && (!above || (touchesBelow && (nearerBelow || !touchesAbove)))) {
        ceil = ob.y0;
      } else {
        floor = Math.max(floor, ob.y1);
      }
    }
    const lows = lowWanted >= floor + minH / 2
      ? [floor, ...ctx.lens.filter((l) => l >= floor && l <= ceil - minH)]
      : [floor];
    const avgHeight = Math.min(
      ctx.sizes.h[ctx.sizes.h.length - 1]!,
      Math.max(minH, heightLeft[i]! / Math.max(1, count - used))
    );

    let bestCol: { main: Rect[]; cap: Rect | null } | null = null;
    let bestScore = Infinity;
    let bestMeets = Infinity;
    // Eight variants, and up to 32 while the best one still makes a Corner meet with its neighbour.
    for (let t = 0; t < 8 || (bestMeets > 0 && t < 32); t++) {
      const pickedLow = lows.length === 1 ? floor : nearest(lows, lowWanted + (rng() - 0.5) * minH * 2);
      const low = Math.max(floor, Math.min(pickedLow, maxLow));
      const room = ctx.lens.filter((l) => l <= ceil - low);
      if (room.length === 0) continue;
      const ranked = [...room].sort(
        (a, b) => Math.abs(a - (topWanted - low)) - Math.abs(b - (topWanted - low))
      );
      const len =
        pinTop && ceil === rows && room.includes(rows - low)
          ? rows - low
          : ranked[Math.min(ranked.length - 1, Math.floor(rng() * rng() * (3 + t / 4)))]!;

      let cap: Rect | null = null;
      if (shadow) {
        const avail = ceil - (low + len);
        const h = Math.max(0, ...ctx.sizes.h.filter((z) => z <= Math.min(ctx.shadowHeight, avail)));
        if (h > 0) cap = { x: xs[i]!, y0: low + len, w: widths[i]!, h, tint: 1 };
      }
      const [lo, hi] = partRange(feas, len, ctx.sizes.h[ctx.sizes.h.length - 1]!);
      const budget = Math.max(1, Math.round(len / avgHeight));
      let np = Math.min(hi, Math.max(lo, budget - (cap ? 1 : 0)));
      if (np > lo && rng() < 0.25 + 0.25 * ctx.free) np--;
      else if (np < hi && rng() < 0.25) np++;
      // Free mode keeps stacked Blocks at least 2 cells tall where the column allows it.
      if (ctx.free > 0 && ctx.grid.rows >= MIN_VARIANT_SIDE) np = Math.max(lo, Math.min(np, Math.floor(len / 2)));
      const stack = decompose(ctx, len, np, low, new Set(prevEdges(prev)), rng);
      const main: Rect[] = [];
      let y = low;
      for (const h of stack) {
        main.push({ x: xs[i]!, y0: y, w: widths[i]!, h, tint: 0 });
        y += h;
      }
      const col = cap ? [...main, cap] : main;
      const meets = meetsBetween(prev, col);
      const score =
        meets * 1000 +
        Math.abs(len + low - topWanted) +
        Math.abs(col.length - budget) * 3;
      if (score < bestScore) {
        bestScore = score;
        bestMeets = meets;
        bestCol = { main, cap };
      }
    }
    if (!bestCol) return null;
    mainRects.push(...bestCol.main);
    if (bestCol.cap) capRects.push(bestCol.cap);
    prev = bestCol.cap ? [...bestCol.main, bestCol.cap] : bestCol.main;
    used += prev.length;
  }
  return [...capRects, ...mainRects];
}

function prevEdges(col: readonly Rect[]): number[] {
  const ys: number[] = [];
  for (const r of col) ys.push(r.y0, r.y0 + r.h);
  return ys;
}

function toBlocks(rects: readonly Rect[], grid: Grid, tintCount: number): Block[] {
  return rects.map((r, i) => ({
    id: `block-${i + 1}`,
    col: r.x,
    row: grid.rows - r.y0 - r.h,
    w: r.w,
    h: r.h,
    tint: Math.min(r.tint, tintCount - 1),
  }));
}

/**
 * Deterministic last resort that always satisfies the Pattern rules: a staircase of edge-connected
 * Blocks grown from the free spot against a Page edge nearest the bottom-left (so it is one mass
 * touching the edge by construction), never on the obstacle. Has as many Blocks as fit, up to `count`.
 * Empty only when the obstacle leaves no free cell.
 */
function fallbackChain(
  grid: Grid,
  sizes: { w: number[]; h: number[] },
  count: number,
  obstacle: Obstacle | null,
  cornerMeetLimit: number
): Rect[] {
  const fits = (r: Rect) =>
    r.x >= 0 && r.y0 >= 0 && r.x + r.w <= grid.cols && r.y0 + r.h <= grid.rows && !hitsObstacle(r, obstacle);
  const onEdge = (r: Rect) =>
    r.x === 0 || r.y0 === 0 || r.x + r.w === grid.cols || r.y0 + r.h === grid.rows;
  const small: [number, number] = [sizes.w[0]!, sizes.h[0]!];
  const mid: [number, number] = [sizes.w.includes(2) ? 2 : small[0], sizes.h.includes(2) ? 2 : small[1]];
  const options = mid[0] === small[0] && mid[1] === small[1] ? [small] : [mid, small];

  let first: Rect | null = null;
  for (const [w, h] of options) {
    let bestD = Infinity;
    for (let y0 = 0; y0 + h <= grid.rows; y0++) {
      for (let x = 0; x + w <= grid.cols; x++) {
        const r: Rect = { x, y0, w, h, tint: 0 };
        if (x + y0 < bestD && onEdge(r) && fits(r)) {
          first = r;
          bestD = x + y0;
        }
      }
    }
    if (first) break;
  }
  if (!first) return [];

  const out: Rect[] = [first];
  const asBlocks = (rs: readonly Rect[]) => rs.map((r, i) => ({ id: `b${i}`, col: r.x, row: grid.rows - r.y0 - r.h, w: r.w, h: r.h, tint: 0 }));
  while (out.length < count) {
    const prev = out[out.length - 1]!;
    let added = false;
    for (const [w, h] of options) {
      // Right of the previous Block, one step up (they share rows only if it is two or more tall), or above it.
      const cands: Rect[] = [
        { x: prev.x + prev.w, y0: prev.y0 + (prev.h >= 2 ? 1 : 0), w, h, tint: 0 },
        { x: prev.x + (prev.w >= 2 ? 1 : 0), y0: prev.y0 + prev.h, w, h, tint: 0 },
      ];
      const next = cands.find(
        (c) =>
          fits(c) &&
          !out.some((o) => c.x < o.x + o.w && o.x < c.x + c.w && c.y0 < o.y0 + o.h && o.y0 < c.y0 + c.h) &&
          countCornerMeets(asBlocks([...out, c])).length <= cornerMeetLimit
      );
      if (next) {
        out.push(next);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return out;
}

/**
 * Deterministic seeded search for a CI-faithful Pattern, built as a skyline.
 *
 * The Page width is tiled by a few columns whose widths come from the Block size
 * size palette. Each column is a vertical run from a lower to an upper profile height,
 * so neighbours share a vertical edge (Edge connect). The upper profile rises with the
 * Slope (with an occasional dip). The seed picks a Solid (lower profile on the
 * bottom edge, a filled staircase) or a Band (lower profile rises too, a thick stepped
 * diagonal) and whether a lighter-tint shadow staircase sits on top. Columns taller
 * than one palette height are stacked from several Blocks. Each attempt is scored
 * on Block count and coverage (30-60% of the Page); rejects non-rising trends, too many
 * Corner meets and, as a HARD rule, anything that breaks the Pattern rules (one mass touching
 * the Page edge, see checkPatternRules). Keeps the best of a bounded number of attempts and
 * returns null when no attempt passes; the caller then uses the always-valid fallbackChain.
 * `extra` are fixed Blocks (a flat Text zone's cover) that count towards the rules.
 */
function skyline(
  grid: Grid,
  colourway: Colourway,
  rng: () => number,
  params: GeneratorParams,
  obstacle: Obstacle | null,
  extra: readonly Rect[] = [],
  /** Keep attempts that break the Pattern rules (heavily penalised) so the caller can repair them. */
  lenient = false
): Rect[] | null {
  const sizes = generatorBlockSizesFor(grid);
  const { slope, cornerMeetLimit } = params;
  const count = Math.max(1, Math.floor(params.blockCount));
  const tintCount = Math.max(1, colourway.tints.length);

  // Any length can be stacked: the smallest palette height is 1.
  const feas = feasibility(sizes.h, grid.rows);
  const lens: number[] = Array.from({ length: grid.rows }, (_, i) => i + 1);

  // Chosen by the seed, once.
  let band = rng() < 0.5;
  const wantShadow = tintCount >= 2 && rng() < 0.55;
  const shadowHeights = sizes.h.filter((z) => z <= Math.max(sizes.h[0]!, Math.min(4, grid.rows / 4)));
  // The family: hanging at every Slope, mountain at Flat/Half only, otherwise the rising staircase.
  // A chosen family replaces the roll (still drawn, so 'auto' keeps its seeds); mountain has no 75%.
  const roll = rng();
  const free = freedomFor(params.guidance);
  const hangingShare = HANGING_SHARE + FREE_VARIANT_SHARE * free;
  const mountainShare = MOUNTAIN_SHARE + FREE_VARIANT_SHARE * free;
  const roomy = grid.cols >= MIN_VARIANT_SIDE && grid.rows >= MIN_VARIANT_SIDE;
  const chosen = params.family ?? 'auto';
  const variant: Variant = !roomy
    ? 'rising'
    : chosen !== 'auto'
      ? chosen === 'mountain' && slope === '75'
        ? 'rising'
        : chosen
      : roll < hangingShare
      ? 'hanging'
      : roll < hangingShare + mountainShare && slope !== '75'
        ? 'mountain'
        : 'rising';
  // A lifted Band (hanging, or the mountain that touches only the top) stays off the bottom edge.
  const liftedMountain = variant === 'mountain' && rng() < 0.5;
  const lift = variant === 'hanging' || liftedMountain ? Math.max(1, Math.round(grid.rows * (0.1 + 0.1 * rng()))) : 0;
  if (lift > 0) band = true;
  const inset =
    variant === 'mountain'
      ? {
          left: Math.max(1, Math.round(grid.cols * (0.15 + 0.12 * rng()))),
          right: Math.max(1, Math.round(grid.cols * (0.04 + 0.06 * rng()))),
        }
      : { left: 0, right: 0 };
  const ctx: Context = {
    grid,
    sizes,
    feas,
    wfeas: feasibility(sizes.w, grid.cols),
    lens,
    slope,
    count,
    band,
    shadow:
      wantShadow && count >= Math.max(6, 2 * Math.ceil(grid.cols / sizes.w[sizes.w.length - 1]!)),
    shadowHeight: shadowHeights[Math.floor(rng() * shadowHeights.length)]!,
    obstacle,
    lift,
    variant,
    pinTop: variant !== 'rising',
    inset,
    free,
    // Drawn after everything above, so a Guidance without freedom keeps its rng() sequence.
    profile:
      free > 0
        ? { gamma: 2 ** ((rng() * 2 - 1) * free), first: (rng() - 0.5) * 0.2 * free, last: (rng() - 0.5) * 0.2 * free }
        : { gamma: 1, first: 0, last: 0 },
    freeWidths: null,
  };
  if (free > 0 && grid.cols >= MIN_VARIANT_SIDE) {
    const w = sizes.w.filter((z) => z >= (grid.cols >= 16 ? 3 : 2));
    ctx.freeWidths = { w, wfeas: feasibility(w, grid.cols) };
  }

  let best: Rect[] | null = null;
  let bestScore = Infinity;
  const area = grid.cols * grid.rows;
  const floor = coverageFloor(grid, count);
  // Guidance 0 skips all of this, so it makes the same attempts (and rng() calls) as before Guidance.
  const threshold = (GUIDANCE_SIMILARITY_SHARE * params.guidance) / 100;
  const guided = threshold > 0;
  let scored = 0;

  // A pass aims at `scale` x the wanted count. Later passes only run when an earlier one found
  // nothing inside the coverage limits (e.g. too many Blocks for the Corner-meet limit).
  // The seed picks Solid or Band once; when that style yields nothing acceptable (e.g. a Band
  // cannot form one connected mass with so few Blocks), the other style gets its turn.
  for (const flip of [false, true]) {
    ctx.band = flip ? !band : band;
    // A hanging or mountain variant that yields nothing falls back to the plain rising staircase.
    if (flip && variant !== 'rising') {
      ctx.variant = 'rising';
      ctx.lift = 0;
      ctx.pinTop = false;
      ctx.inset = { left: 0, right: 0 };
    }
    for (const [scale, attempts] of PASSES) {
      ctx.count = Math.max(1, Math.round(count * scale));
      for (let attempt = 0; attempt < attempts; attempt++) {
        const built = buildSkyline(ctx, rng);
        if (!built) {
          if (diag) diag.rejected.unbuilt++;
          continue;
        }
        // Safety net: whatever the columns did, never keep a Block on the obstacle.
        const rects = built.filter((r) => !hitsObstacle(r, obstacle));
        if (rects.length === 0) {
          if (diag) diag.rejected.empty++;
          continue;
        }
        const trend = rectsTrend(rects);
        if (trend !== null && (slope === 'flat' ? trend < 0 : trend <= 0)) {
          if (diag) diag.rejected.trend++;
          continue;
        }
        const blocks = toBlocks(rects, grid, tintCount);
        // Guideline shape (review verdicts): 75% rises at least 30 degrees, no busy staircase. Kept only
        // as a last resort (scored below any good shape): with very few Blocks it beats the fallback.
        const shapeOk = !slopeShapeProblem(blocks, grid, slope);
        if (!shapeOk && diag) diag.rejected.shape++;
        const meets = countCornerMeets(blocks).length;
        if (meets > cornerMeetLimit) {
          if (diag) diag.rejected.cornerMeets++;
          continue;
        }
        // Hard rule: never keep an attempt that is not one mass touching the Page edge.
        const withExtra = extra.length > 0 ? toBlocks([...rects, ...extra], grid, tintCount) : blocks;
        const rules = checkPatternRules(withExtra, grid);
        const rulesOk = rules.ok;
        if (!rulesOk && diag) {
          diag.rejected.rules++;
          if (diag.ruleSamples.length < RULE_SAMPLES) {
            diag.ruleSamples.push({ violations: rules.violations, blocks: withExtra.map((b) => [b.col, b.row, b.w, b.h]) });
          }
        }
        if (!rulesOk && !lenient) continue;
        const covered = rects.reduce((a, r) => a + r.w * r.h, 0) / area;
        const coverageErr = Math.max(0, COVERAGE_RANGE[0] - covered, covered - COVERAGE_RANGE[1]);
        const outOfLimit = covered < floor;
        const miss = Math.abs(count - rects.length);
        scored++;
        const sim = guided
          ? patternSimilarity(extra.length > 0 ? toBlocks([...rects, ...extra], grid, tintCount) : blocks, grid, { slope, ...(chosen === 'auto' ? {} : { family: ctx.variant }) }).iou
          : 0;
        const score =
          (rulesOk ? 0 : 50_000) +
          (shapeOk ? 0 : 20_000) +
          (outOfLimit ? 10_000 : 0) +
          miss * 100 +
          coverageErr * 100 +
          Math.max(0, threshold - sim) * GUIDANCE_PENALTY;
        if (score < bestScore) {
          best = rects;
          bestScore = score;
        }
        // Good enough: on target (within 10%) and inside the preferred coverage (and close enough to the references).
        if (
          rulesOk &&
          shapeOk &&
          !outOfLimit &&
          coverageErr === 0 &&
          miss <= Math.max(1, Math.round(count * 0.1)) &&
          (sim >= threshold || scored >= GUIDANCE_ATTEMPTS)
        ) {
          break;
        }
      }
      // Fewer Blocks rarely fix a shape problem: with a valid candidate whose only fault is its shape,
      // skip the smaller passes and let the other style try.
      if (bestScore < 30_000) break;
    }
    if (bestScore < 10_000) break;
  }

  return best;
}

/** Share of the Page a single covering Block may take before 'flat' gives up. */
const MAX_COVER_SHARE = 0.6;
const MAX_COVER_TRIES = 8;

function toObstacle(zone: Pick<TextZone, 'col' | 'row' | 'w' | 'h'>, grid: Grid): Obstacle {
  return {
    x0: zone.col,
    x1: zone.col + zone.w,
    y0: grid.rows - zone.row - zone.h,
    y1: grid.rows - zone.row,
  };
}

/** Candidate covering Blocks for a 'flat' zone, best first (y up). */
function coverCandidates(zone: TextZone, grid: Grid, sizes: { w: number[]; h: number[] }): Rect[] {
  // Palette sizes that contain the zone: the two smallest per axis. The size palette is
  // broken only where it must be: when the zone is larger than the biggest palette
  // size on an axis, the covering Block is exactly as long as the zone on that axis.
  const fit = (list: number[], need: number): number[] => {
    const ok = list.filter((s) => s >= need).slice(0, 2);
    return ok.length > 0 ? ok : [need];
  };
  const spans = (pos: number, len: number, size: number, max: number): number[] => {
    const lo = Math.max(0, pos + len - size);
    const hi = Math.min(pos, max - size);
    return [...new Set([lo, hi, Math.floor((lo + hi) / 2)])];
  };
  const out: Rect[] = [];
  const pairs = fit(sizes.w, zone.w).flatMap((w) => fit(sizes.h, zone.h).map((h) => ({ w, h })));
  pairs.sort((a, b) => a.w * a.h - b.w * b.h);
  for (const { w, h } of pairs) {
    for (const col of spans(zone.col, zone.w, w, grid.cols)) {
      for (const row of spans(zone.row, zone.h, h, grid.rows)) {
        out.push({ x: col, y0: grid.rows - row - h, w, h, tint: 0 });
      }
    }
  }
  return out;
}

/**
 * Why the generator took the path it did. Pass an empty object as `options.diagnostics` to have it
 * filled in: the first stop when a Pattern looks wrong (e.g. the staircase fallback where a skyline
 * was expected), instead of instrumenting the generator.
 */
export interface GeneratorDiagnostics {
  /** Which builder made the returned Blocks. */
  path?: 'template' | 'skyline' | 'flatCover' | 'fallback';
  /** Skyline attempts thrown away, per reason (summed over every skyline run of this call). */
  rejected?: { unbuilt: number; empty: number; trend: number; cornerMeets: number; rules: number; shape: number };
  /** The first few attempts rejected by the Pattern rules: their violations and Blocks [col, row, w, h]. */
  ruleSamples?: { violations: string[]; blocks: [number, number, number, number][] }[];
}

/** The diagnostics of the generatePatternDetailed call in progress, if its caller asked for them. */
let diag: (GeneratorDiagnostics & Required<Pick<GeneratorDiagnostics, 'rejected' | 'ruleSamples'>>) | null = null;
const RULE_SAMPLES = 3;

export interface DetailedPattern {
  blocks: Block[];
  /** True when the zone asked for 'flat' but no single Block could cover it, so it was kept clear. */
  flatFallback: boolean;
  /** True when template mode (high Guidance) made the Blocks rather than the skyline. */
  template?: boolean;
}

/**
 * Joins stray masses to the mass of the fixed `anchor` Block (a flat zone's cover) by growing a
 * straight pillar of palette Blocks out of it, towards the nearest stray, until it touches.
 * Keeps every existing Block where it is. Returns null when no pillar can reach.
 */
function bridgeToAnchor(
  blocks: readonly Block[],
  anchor: number,
  grid: Grid,
  sizes: { w: number[]; h: number[] }
): Block[] | null {
  const out = [...blocks];
  const cover = blocks[anchor]!;
  type Pillar = { col: number; row: number; w: number; h: number; vertical: boolean };
  const hits = (p: Pillar, list: readonly Block[]) =>
    list.some((o) => p.col < o.col + o.w && o.col < p.col + p.w && p.row < o.row + o.h && o.row < p.row + p.h);
  const near = (p: Pillar, list: readonly Block[]) =>
    list.some((o) => p.col <= o.col + o.w && o.col <= p.col + p.w && p.row <= o.row + o.h && o.row <= p.row + p.h);
  const wp = Math.max(...sizes.w.filter((z) => z <= cover.w));
  const hp = Math.max(...sizes.h.filter((z) => z <= cover.h));
  for (let round = 0; round < 8; round++) {
    const masses = patternMasses(out);
    if (masses.length <= 1) return out;
    const mine = masses.find((m) => m.includes(anchor))!;
    const strays = out.filter((_, i) => !mine.includes(i));
    const own = out.filter((_, i) => mine.includes(i) && i !== anchor);
    let best: Pillar | null = null;
    for (const dir of ['down', 'up', 'right', 'left'] as const) {
      for (let len = 1; len <= Math.max(grid.cols, grid.rows); len++) {
        const p: Pillar =
          dir === 'down' ? { col: cover.col, row: cover.row + cover.h, w: wp, h: len, vertical: true }
          : dir === 'up' ? { col: cover.col, row: cover.row - len, w: wp, h: len, vertical: true }
          : dir === 'right' ? { col: cover.col + cover.w, row: cover.row, w: len, h: hp, vertical: false }
          : { col: cover.col - len, row: cover.row, w: len, h: hp, vertical: false };
        if (p.col < 0 || p.row < 0 || p.col + p.w > grid.cols || p.row + p.h > grid.rows) break;
        if (hits(p, strays) || hits(p, own)) break;
        if (near(p, strays)) {
          if (!best || p.w * p.h < best.w * best.h) best = p;
          break;
        }
      }
    }
    if (!best) return null;
    // Cut the pillar into palette pieces along its long axis.
    const list = best.vertical ? sizes.h : sizes.w;
    let left = best.vertical ? best.h : best.w;
    let at = best.vertical ? best.row : best.col;
    while (left > 0) {
      const z = Math.max(...list.filter((x) => x <= left));
      out.push({
        id: `block-${out.length + 1}`,
        col: best.vertical ? best.col : at,
        row: best.vertical ? at : best.row,
        w: best.vertical ? best.w : z,
        h: best.vertical ? z : best.h,
        tint: 0,
      });
      at += z;
      left -= z;
    }
  }
  return null;
}

/**
 * The cover Block of a flat zone is too far from any strict arrangement: take the best attempt,
 * then join its stray masses to the (fixed) cover with a pillar, or failing that slide them to it.
 * Null when that still breaks the rules.
 */
function arrangeAroundCover(
  grid: Grid,
  colourway: Colourway,
  rng: () => number,
  params: GeneratorParams,
  cover: Rect,
  tintCount: number
): Block[] | null {
  const rects = skyline(
    grid,
    colourway,
    rng,
    params,
    { x0: cover.x, x1: cover.x + cover.w, y0: cover.y0, y1: cover.y0 + cover.h },
    [{ ...cover, tint: 0 }],
    true
  );
  const blocks = toBlocks([...(rects ?? []), { ...cover, tint: 0 }], grid, tintCount);
  if (checkPatternRules(blocks, grid).ok) return blocks;
  const bridged = bridgeToAnchor(blocks, blocks.length - 1, grid, generatorBlockSizesFor(grid));
  if (bridged && checkPatternRules(bridged, grid).ok) return bridged;
  const slid = repairPatternRules(blocks, grid, new Set([blocks.length - 1]));
  return slid && checkPatternRules(slid, grid).ok ? slid : null;
}

/**
 * Same as {@link generatePattern}, and also reports whether a 'flat' Text zone had to
 * fall back to 'clear'.
 *
 * Text zone, 'clear': the zone is an obstacle for the skyline. A column that crosses it
 * is capped below the zone or starts above it, and any Block still touching the zone is
 * dropped, so the Pattern uses fewer Blocks rather than overlap the zone.
 *
 * Text zone, 'flat': one Block covers the zone entirely (one Tint, no edges inside it).
 * It is the smallest palette size that contains the zone, placed to contain it
 * (grid edges first) with the Corner-meet limit respected; only if the zone is larger
 * than the biggest palette size on an axis does the Block take the zone's own length
 * there. The rest of the Pattern is generated with that Block as the obstacle. If the
 * covering Block would take more than 60% of the Page, the zone is kept clear instead.
 */
export function generatePatternDetailed(
  grid: Grid,
  colourway: Colourway,
  rng: () => number,
  params: GeneratorParams,
  options: { textZone?: TextZone; diagnostics?: GeneratorDiagnostics } = {}
): DetailedPattern {
  const half = halvedGrid(grid);
  if (half) {
    const built = generatePatternDetailed(half, colourway, rng, params, {
      ...(options.textZone ? { textZone: halveZone(options.textZone) } : {}),
      ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
    });
    const blocks = doubleBlocks(built.blocks, grid);
    const zone = options.textZone;
    // Doubling rounds the zone outwards, but check the Clear zone allowance on the real zone anyway.
    const zoneOk = !zone || measureClearZoneOverlap({ pattern: blocks, textZone: zone } satisfies Page).withinLimit;
    if (zoneOk && checkPatternRules(blocks, grid).ok) return { ...built, blocks };
    // A clipped odd edge can break a rule, or the coarser zone outline can overlap a Clear zone:
    // build at full size instead.
  }
  const out = options.diagnostics;
  const built = !out ? generateDetailed(grid, colourway, rng, params, options.textZone, null) : diagnosed(out);
  // A flat zone's cover Block stays as built; elsewhere a Pattern may get a Corner meet (cornerMeet.ts).
  if (options.textZone?.mode === 'flat') return built;
  return { ...built, blocks: maybeAddCornerMeet(built.blocks, grid, rng, params.cornerMeetLimit, params.slope) };

  function diagnosed(d: GeneratorDiagnostics): DetailedPattern {
    d.rejected = { unbuilt: 0, empty: 0, trend: 0, cornerMeets: 0, rules: 0, shape: 0 };
    d.ruleSamples = [];
    diag = d as NonNullable<typeof diag>;
    try {
      return generateDetailed(grid, colourway, rng, params, options.textZone, d);
    } finally {
      diag = null;
    }
  }
}

function generateDetailed(
  grid: Grid,
  colourway: Colourway,
  rng: () => number,
  params: GeneratorParams,
  zone: TextZone | undefined,
  out: GeneratorDiagnostics | null
): DetailedPattern {
  const took = <T>(path: GeneratorDiagnostics['path'], result: T): T => {
    if (out) out.path = path;
    return result;
  };
  const tintCount = Math.max(1, colourway.tints.length);
  const sizes = generatorBlockSizesFor(grid);
  const count = Math.max(1, Math.floor(params.blockCount));

  /** Skyline for the obstacle, else the always-valid fallback staircase. */
  const around = (obstacle: Obstacle | null): Block[] => {
    const rects = skyline(grid, colourway, rng, params, obstacle) ?? [];
    const blocks = toBlocks(rects, grid, tintCount);
    if (rects.length > 0 && checkPatternRules(blocks, grid).ok) return took('skyline', blocks);
    return took('fallback', toBlocks(fallbackChain(grid, sizes, count, obstacle, params.cornerMeetLimit), grid, tintCount));
  };

  // Template mode: a drawn chance that rises with Guidance; nothing is drawn at or below TEMPLATE_FROM.
  // A chosen family the skyline cannot build on this Grid (too small for its variants) goes to the
  // references instead, whatever the Guidance.
  const family = params.family ?? 'auto';
  const skylineLacks = family !== 'auto' && family !== 'rising' && !skylineBuilds(grid);
  const useTemplate =
    count >= 2 && (skylineLacks || (params.guidance > TEMPLATE_FROM && rng() < templateChance(params.guidance)));
  if (useTemplate) {
    const covers =
      zone?.mode === 'flat'
        ? coverCandidates(zone, grid, sizes)
            .filter((c) => (c.w * c.h) / (grid.cols * grid.rows) <= MAX_COVER_SHARE)
            .slice(0, MAX_COVER_TRIES)
            .map((c) => ({ col: c.x, row: grid.rows - c.y0 - c.h, w: c.w, h: c.h }))
        : [];
    const zoned = !zone
      ? null
      : zone.mode === 'clear'
        ? ({ mode: 'clear', zone } as const)
        : covers.length > 0
          ? ({ mode: 'flat', zone, covers } as const)
          : undefined;
    const blocks = zoned === undefined ? null : templatePattern(grid, rng, params, zoned);
    if (blocks) return took('template', { blocks, flatFallback: false, template: true });
  }

  if (!zone) return { blocks: around(null), flatFallback: false };

  if (zone.mode === 'flat') {
    const cands = coverCandidates(zone, grid, sizes).filter(
      (c) => (c.w * c.h) / (grid.cols * grid.rows) <= MAX_COVER_SHARE
    );
    let best: { blocks: Block[]; meets: number } | null = null;
    for (const cover of cands.slice(0, MAX_COVER_TRIES)) {
      const blocks = arrangeAroundCover(grid, colourway, rng, params, cover, tintCount);
      // No arrangement around this cover makes one mass touching the Page edge: try the next cover.
      if (!blocks) continue;
      const meets = countCornerMeets(blocks).length;
      if (!best || meets < best.meets) best = { blocks, meets };
      if (meets <= params.cornerMeetLimit) break;
    }
    if (best) return took('flatCover', { blocks: best.blocks, flatFallback: false });
  }

  return { blocks: around(toObstacle(zone, grid)), flatFallback: zone.mode === 'flat' };
}

export function generatePattern(
  grid: Grid,
  colourway: Colourway,
  rng: () => number,
  params: GeneratorParams,
  options: { textZone?: TextZone } = {}
): Block[] {
  return generatePatternDetailed(grid, colourway, rng, params, options).blocks;
}

/** A Block side is valid when it is a whole number of cells from 1 up to the Grid's size on that axis (ADR 0007). */
export function isValidBlockSize(size: number, gridSide: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= gridSide;
}
