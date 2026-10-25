import type { Block, GeneratorParams, Grid, Page, PatternFamily, TextZone } from './types.js';
import { countCornerMeets } from './generator.js';
import { checkPatternRules, COVERAGE_LIMIT } from './patternRules.js';
import { FLAT_BELOW, patternSimilarity, slopeShapeProblem, REFERENCE_PATTERNS, REFERENCE_SIZE, trendDegrees } from './referencePatterns.js';
import { CLEAR_ZONE_MAX_OVERLAP, CLEAR_ZONE_RING_DEPTH, measureClearZoneOverlap } from './textZone.js';

/**
 * Template mode (high Guidance): instead of growing a skyline, copy a Reference Pattern of the chosen
 * Slope onto the Grid, cut it into Blocks and nudge the edges a little. The skyline path stays the
 * fallback, so this only ever returns a Pattern that passes every hard rule.
 *
 * Chance of using a template at Guidance g: clamp((g - 40) / 50, 0, 1), so none up to 40, 40% at
 * the default 60 (the rest stay free skylines), certain from 90.
 * Nothing in this mode runs (or draws from the rng) up to 40, which keeps lower Guidance byte-identical.
 */
export const TEMPLATE_FROM = 40;
const TEMPLATE_FULL = 90;
const ATTEMPTS = 8;
/** Largest edge move (share of the shorter Grid side) at Guidance 0; it shrinks linearly to 0 at 100. */
const JITTER_SHARE = 0.15;
/** Guidance g asks for similarity GUIDANCE_SIMILARITY_SHARE x g / 100: the skyline's soft goal and the template's target. */
export const GUIDANCE_SIMILARITY_SHARE = 0.9;
const GOAL_MARGIN = 0.03;
/**
 * Without a copy at the goal, any Reference whose best copy is within VARIETY_SPREAD of the closest
 * one may be picked (never below the floor while the closest clears floor + spread). Coarse Grids
 * cannot reach the 16x16 shapes exactly, and keeping only the closest gave one Pattern for every seed.
 */
const VARIETY_SPREAD = 0.15;

export function templateChance(guidance: number): number {
  return Math.min(1, Math.max(0, (guidance - TEMPLATE_FROM) / (TEMPLATE_FULL - TEMPLATE_FROM)));
}

/** A rectangle in Block coordinates (row 0 is the top). */
export interface TemplateRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

type Mask = boolean[][];

/** Nearest-neighbour by cell centre: the 16x16 reference stretched over the Grid. */
function scaleMask(mask: readonly string[], grid: Grid): Mask {
  const n = REFERENCE_SIZE;
  return Array.from({ length: grid.rows }, (_, r) =>
    Array.from({ length: grid.cols }, (_, c) => {
      const rr = Math.min(n - 1, Math.floor(((r + 0.5) * n) / grid.rows));
      const cc = Math.min(n - 1, Math.floor(((c + 0.5) * n) / grid.cols));
      return mask[rr]![cc] === '#';
    })
  );
}

/** Rectangles from merging equal horizontal runs of consecutive rows. */
function runRects(m: Mask): TemplateRect[] {
  const out: TemplateRect[] = [];
  let open = new Map<string, TemplateRect>();
  for (let r = 0; r < m.length; r++) {
    const next = new Map<string, TemplateRect>();
    const row = m[r]!;
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      const key = `${start},${c - start}`;
      const prev = open.get(key);
      if (prev) {
        prev.h++;
        next.set(key, prev);
      } else {
        const rect = { col: start, row: r, w: c - start, h: 1 };
        out.push(rect);
        next.set(key, rect);
      }
    }
    open = next;
  }
  return out;
}

function transpose(m: Mask): Mask {
  return (m[0] ?? []).map((_, c) => m.map((row) => row[c]!));
}

/** The smaller of the row-first and column-first decompositions (a tie goes to the row-first one). */
function decompose(m: Mask): TemplateRect[] {
  const a = runRects(m);
  const b = runRects(transpose(m)).map((r) => ({ col: r.row, row: r.col, w: r.h, h: r.w }));
  return b.length < a.length ? b : a;
}

/** Splits the largest splittable Block across its longer side, away from the very edge, until there are `target`. */
function splitTo(rects: TemplateRect[], target: number, fixed: number, rng: () => number): void {
  while (rects.length < target) {
    let at = -1;
    for (let i = 0; i < rects.length; i++) {
      if (i === fixed) continue;
      const r = rects[i]!;
      if (r.w * r.h > 1 && (at < 0 || r.w * r.h > rects[at]!.w * rects[at]!.h)) at = i;
    }
    if (at < 0) return;
    const r = rects[at]!;
    const alongW = r.w === r.h ? rng() < 0.5 : r.w > r.h;
    const len = alongW ? r.w : r.h;
    const lo = Math.max(1, Math.ceil(len * 0.35));
    const hi = Math.min(len - 1, Math.floor(len * 0.65));
    const cut = hi >= lo ? lo + Math.floor(rng() * (hi - lo + 1)) : Math.floor(len / 2);
    const rest: TemplateRect = alongW
      ? { col: r.col + cut, row: r.row, w: r.w - cut, h: r.h }
      : { col: r.col, row: r.row + cut, w: r.w, h: r.h - cut };
    if (alongW) r.w = cut;
    else r.h = cut;
    rects.push(rest);
  }
}

/**
 * Moves outer edges of Blocks by up to `amp` cells (never an edge shared with another Block, never
 * into one), so a template is close to its reference but not a copy. Mutates `rects`.
 */
function jitter(rects: TemplateRect[], grid: Grid, amp: number, fixed: number, rng: () => number): void {
  const owner = Array.from({ length: grid.rows }, () => new Array<number>(grid.cols).fill(-1));
  rects.forEach((r, i) => {
    for (let y = r.row; y < r.row + r.h; y++) for (let x = r.col; x < r.col + r.w; x++) owner[y]![x] = i;
  });
  const free = (x: number, y: number) => x < 0 || y < 0 || x >= grid.cols || y >= grid.rows || owner[y]![x] === -1;
  const clear = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!free(x, y)) return false;
    return true;
  };
  const set = (x0: number, x1: number, y0: number, y1: number, v: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) owner[y]![x] = v;
  };
  rects.forEach((r, i) => {
    if (i === fixed) return;
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const d = Math.round((rng() * 2 - 1) * amp);
      if (d === 0) continue;
      const vertical = side === 'left' || side === 'right';
      const len = vertical ? r.h : r.w;
      // The cells just outside the edge, along its whole length, must be empty (an outer edge).
      let outer = true;
      for (let k = 0; k < len && outer; k++) {
        const x = side === 'left' ? r.col - 1 : side === 'right' ? r.col + r.w : r.col + k;
        const y = side === 'top' ? r.row - 1 : side === 'bottom' ? r.row + r.h : r.row + k;
        if (!free(x, y)) outer = false;
      }
      if (!outer) continue;
      // d > 0 grows the Block outward, d < 0 shrinks it (at least one cell stays).
      const grow = Math.max(0, d);
      const shrink = Math.max(0, -d);
      if (shrink >= (vertical ? r.w : r.h)) continue;
      const x0 = r.col;
      const x1 = r.col + r.w;
      const y0 = r.row;
      const y1 = r.row + r.h;
      if (side === 'left') {
        if (x0 - grow < 0 || !clear(x0 - grow, x0, y0, y1)) continue;
        set(x0 - grow, x0, y0, y1, i);
        set(x0, x0 + shrink, y0, y1, -1);
        r.col += shrink - grow;
        r.w += grow - shrink;
      } else if (side === 'right') {
        if (x1 + grow > grid.cols || !clear(x1, x1 + grow, y0, y1)) continue;
        set(x1, x1 + grow, y0, y1, i);
        set(x1 - shrink, x1, y0, y1, -1);
        r.w += grow - shrink;
      } else if (side === 'top') {
        if (y0 - grow < 0 || !clear(x0, x1, y0 - grow, y0)) continue;
        set(x0, x1, y0 - grow, y0, i);
        set(x0, x1, y0, y0 + shrink, -1);
        r.row += shrink - grow;
        r.h += grow - shrink;
      } else {
        if (y1 + grow > grid.rows || !clear(x0, x1, y1, y1 + grow)) continue;
        set(x0, x1, y1, y1 + grow, i);
        set(x0, x1, y1 - shrink, y1, -1);
        r.h += grow - shrink;
      }
    }
  });
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Removes the cells of a Clear zone that would be overlapped beyond the allowance. */
function trimClearZone(m: Mask, z: TextZone): void {
  const area = z.w * z.h;
  const ring: [number, number][] = [];
  for (let r = z.row; r < z.row + z.h; r++) {
    for (let c = z.col; c < z.col + z.w; c++) {
      if (!m[r]?.[c]) continue;
      const inRing =
        c - z.col < CLEAR_ZONE_RING_DEPTH ||
        z.col + z.w - 1 - c < CLEAR_ZONE_RING_DEPTH ||
        r - z.row < CLEAR_ZONE_RING_DEPTH ||
        z.row + z.h - 1 - r < CLEAR_ZONE_RING_DEPTH;
      if (inRing) ring.push([r, c]);
      else m[r]![c] = false;
    }
  }
  if (ring.length > Math.floor(area * CLEAR_ZONE_MAX_OVERLAP)) for (const [r, c] of ring) m[r]![c] = false;
}

/** Trend of the Block centres (y up), in degrees; null for fewer than two Blocks. */
function blocksTrend(blocks: readonly Block[], grid: Grid): number | null {
  return trendDegrees(blocks.map((b) => [b.col + b.w / 2, grid.rows - b.row - b.h / 2] as const));
}

export type TemplateZone =
  | { mode: 'clear'; zone: TextZone }
  /** A flat zone: one of these Blocks covers it. */
  | { mode: 'flat'; zone: TextZone; covers: readonly TemplateRect[] };

/**
 * Whether a copy keeps its family's anchor once scaled: rising stands on the bottom, hanging touches
 * the top but not the bottom, mountain is inset from the left. A coarse Grid can lose a thin edge row.
 */
function keepsAnchor(blocks: readonly Block[], grid: Grid, family: Exclude<PatternFamily, 'auto'>): boolean {
  const bottom = blocks.some((b) => b.row + b.h === grid.rows);
  if (family === 'rising') return bottom;
  if (family === 'hanging') return !bottom && blocks.some((b) => b.row === 0);
  return !blocks.some((b) => b.col === 0);
}

/**
 * Builds a Pattern from a Reference Pattern of the chosen Slope, or null when no attempt within the
 * budget satisfies the hard rules (the caller then uses the skyline). Needs a Block count of 2 or more.
 */
export function templatePattern(
  grid: Grid,
  rng: () => number,
  params: GeneratorParams,
  zoned: TemplateZone | null
): Block[] | null {
  const count = Math.max(1, Math.floor(params.blockCount));
  if (count < 2) return null;
  const { slope, guidance, cornerMeetLimit } = params;
  const family = params.family ?? 'auto';
  const refs = shuffled(
    REFERENCE_PATTERNS.filter((p) => p.slope === slope && (family === 'auto' || p.family === family)),
    rng
  );
  if (refs.length === 0) return null;
  const tolerance = Math.max(2, Math.round(count * 0.2));
  const amp0 = (1 - guidance / 100) * JITTER_SHARE * Math.min(grid.cols, grid.rows);

  // Scaling a 16x16 reference to a coarse Grid loses detail, so prefer a candidate that keeps its similarity.
  const floor = (GUIDANCE_SIMILARITY_SHARE * guidance) / 100;
  const goal = floor + GOAL_MARGIN;
  // The closest valid copy of each reference, in the shuffled order.
  const bestPerRef: ({ blocks: Block[]; iou: number } | undefined)[] = [];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const refIndex = attempt % refs.length;
    const mask = scaleMask(refs[refIndex]!.mask, grid);
    let cover: TemplateRect | null = null;
    if (zoned?.mode === 'clear') trimClearZone(mask, zoned.zone);
    if (zoned?.mode === 'flat') {
      cover = zoned.covers[attempt % zoned.covers.length]!;
      for (let r = cover.row; r < cover.row + cover.h; r++) {
        for (let c = cover.col; c < cover.col + cover.w; c++) mask[r]![c] = false;
      }
    }
    const base = decompose(mask);
    if (base.length + (cover ? 1 : 0) > count + tolerance) continue;

    for (const factor of [1, 0.5, 0]) {
      const rects: TemplateRect[] = (cover ? [cover, ...base] : base).map((r) => ({ ...r }));
      const fixed = cover ? 0 : -1;
      splitTo(rects, count, fixed, rng);
      if (factor > 0 && amp0 > 0.5) jitter(rects, grid, amp0 * factor, fixed, rng);
      const blocks: Block[] = rects.map((r, i) => ({ id: `block-${i + 1}`, ...r, tint: 0 }));
      if (Math.abs(blocks.length - count) > tolerance) break;
      if (!checkPatternRules(blocks, grid).ok) continue;
      // The rules cap coverage only from above; a copy cropped by a zone or a coarse Grid can fall short.
      const covered = blocks.reduce((a, b) => a + b.w * b.h, 0) / (grid.cols * grid.rows);
      if (covered < COVERAGE_LIMIT[0]) continue;
      if (countCornerMeets(blocks).length > cornerMeetLimit) continue;
      if (family !== 'auto' && !keepsAnchor(blocks, grid, family)) continue;
      if (slopeShapeProblem(blocks, grid, slope)) continue;
      // Growth: the Blocks' centres trend upward to the right, like the skyline requires. Flat may dip
      // within the flat band, as Reference 71:261 does.
      const trend = blocksTrend(blocks, grid);
      if (trend !== null && (slope === 'flat' ? trend <= -FLAT_BELOW : trend <= 0)) continue;
      // A 75% Slope reaches the top-right corner unless a Clear zone holds that cell.
      const z = zoned?.zone;
      const cornerInClearZone = zoned?.mode === 'clear' && z!.row === 0 && z!.col + z!.w === grid.cols;
      if (slope === '75' && !cornerInClearZone && !blocks.some((b) => b.row === 0 && b.col + b.w === grid.cols)) continue;
      if (
        zoned?.mode === 'clear' &&
        !measureClearZoneOverlap({ textZone: zoned.zone, pattern: blocks } as unknown as Page).withinLimit
      ) {
        continue;
      }
      // Valid. The first reference in the shuffled order to reach the goal wins outright.
      const iou = patternSimilarity(blocks, grid, { slope, ...(family === 'auto' ? {} : { family }) }).iou;
      if (iou >= goal && bestPerRef.slice(0, refIndex).every((b) => b === undefined)) return blocks;
      if (!bestPerRef[refIndex] || iou > bestPerRef[refIndex].iou) bestPerRef[refIndex] = { blocks, iou };
    }
  }
  const found = bestPerRef.filter((b) => b !== undefined);
  if (found.length === 0) return null;
  const top = Math.max(...found.map((b) => b.iou));
  const threshold = Math.min(floor, top - VARIETY_SPREAD);
  return found.find((b) => b.iou >= threshold)!.blocks;
}
