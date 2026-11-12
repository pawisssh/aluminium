import type { CellRect } from './layouts.js';
import type { Block, Grid } from './types.js';

/**
 * Pattern rules: the part of the brand guideline that decides whether a set of Blocks is a
 * Pattern at all (as opposed to scattered rectangles). Measured on the reference Patterns:
 * every one is a single mass (cells touching by edge or corner), and every mass touches the Page edge.
 */

/** Coverage (share of the Page) a multi-Block Pattern may have; the references sit at 31-60%. */
export const COVERAGE_LIMIT: readonly [number, number] = [0.2, 0.75];

export interface PatternRulesResult {
  ok: boolean;
  /** Human-readable reasons, each starting with its rule: `disconnected`, `noEdge` or `coverage`. */
  violations: string[];
}

/** True when two Blocks overlap or touch by an edge or a corner (8-connectivity on cells). */
function adjacent(a: Block, b: Block): boolean {
  return a.col <= b.col + b.w && b.col <= a.col + a.w && a.row <= b.row + b.h && b.row <= a.row + a.h;
}

/** Splits Blocks into masses of 8-connected Blocks; returns the Block indexes of each mass. */
export function patternMasses(blocks: readonly Block[]): number[][] {
  const parent = blocks.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (adjacent(blocks[i]!, blocks[j]!)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  blocks.forEach((_, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  });
  return [...groups.values()];
}

/** True when any Block lies against an edge of the Page. */
export function touchesPageEdge(blocks: readonly Block[], grid: Grid): boolean {
  return blocks.some(
    (b) => b.col === 0 || b.row === 0 || b.col + b.w === grid.cols || b.row + b.h === grid.rows
  );
}

/**
 * Checks a Page's Blocks against the Pattern rules:
 * (a) all Blocks form ONE mass (edge or corner contact; Corner meets stay limited by the generator's limit);
 * (b) the mass touches at least one Page edge;
 * (c) two or more Blocks cover no more than the upper COVERAGE_LIMIT. A single Block is an "accent" and
 *     may cover any share. The lower coverage limit is a generator preference, not a rule: with few
 *     Blocks on a fine Grid it cannot be reached.
 * No Blocks is fine (nothing to violate, e.g. a Text zone that fills the Page).
 */
export function checkPatternRules(blocks: readonly Block[], grid: Grid): PatternRulesResult {
  const violations: string[] = [];
  if (blocks.length === 0) return { ok: true, violations };

  const masses = patternMasses(blocks).length;
  if (masses > 1) violations.push(`disconnected: the Blocks form ${masses} separate masses instead of one`);
  if (!touchesPageEdge(blocks, grid)) violations.push('noEdge: the Pattern does not touch any edge of the Page');
  if (blocks.length >= 2) {
    const covered = blocks.reduce((a, b) => a + b.w * b.h, 0) / (grid.cols * grid.rows);
    if (covered > COVERAGE_LIMIT[1]) {
      violations.push(`coverage: the Blocks cover ${Math.round(covered * 100)}% of the Page (at most ${COVERAGE_LIMIT[1] * 100}%)`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/** True when two rectangles of cells (Blocks, slots) share at least one cell. */
export const overlaps = (a: CellRect, b: CellRect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/**
 * Minimal repair that keeps the user's Blocks (sizes never change): slides each stray mass the
 * shortest way until it touches the main mass, then slides the whole mass to the nearest Page
 * edge if it floats. Returns the new Blocks, or null when nothing could be done.
 * Moves are whole masses, so shapes inside a mass are untouched.
 * `bounds` keeps every move inside a part of the Page (an Article cover's Pattern area, #78): masses are slid only
 * inside it, and a floating mass goes only to a Page edge that the bounds reach. It defaults to the whole Page.
 */
export function repairPatternRules(
  blocks: readonly Block[],
  grid: Grid,
  /** Indexes of Blocks that must not move (e.g. the Block covering a flat Text zone): their mass is the anchor. */
  fixed: ReadonlySet<number> = new Set(),
  bounds: CellRect = { col: 0, row: 0, w: grid.cols, h: grid.rows }
): Block[] | null {
  let out = blocks.map((b) => ({ ...b }));
  const inGrid = (b: Block) =>
    b.col >= bounds.col && b.row >= bounds.row && b.col + b.w <= bounds.col + bounds.w && b.row + b.h <= bounds.row + bounds.h;

  for (let guard = 0; guard < blocks.length; guard++) {
    const masses = patternMasses(out);
    if (masses.length <= 1) break;
    // The mass with fixed Blocks (else the most area) stays; the nearest stray mass moves to it.
    const area = (m: number[]) => m.reduce((a, i) => a + out[i]!.w * out[i]!.h, 0);
    const anchored = (m: number[]) => (m.some((i) => fixed.has(i)) ? 1 : 0);
    masses.sort((a, b) => anchored(b) - anchored(a) || area(b) - area(a));
    // Two fixed masses cannot be joined by moving anything.
    if (masses.slice(1).some((m) => anchored(m))) return null;
    const main = masses[0]!.map((i) => out[i]!);
    let best: { mass: number[]; dc: number; dr: number; dist: number } | null = null;
    for (const mass of masses.slice(1)) {
      const others = out.filter((_, i) => !mass.includes(i));
      // Nearest free spot (fewest cells moved) where the mass touches the main mass.
      for (let d = 1; d <= grid.cols + grid.rows && (!best || d < best.dist); d++) {
        for (let dc = -d; dc <= d; dc++) {
          const rem = d - Math.abs(dc);
          for (const dr of rem === 0 ? [0] : [-rem, rem]) {
            const moved = mass.map((i) => ({ ...out[i]!, col: out[i]!.col + dc, row: out[i]!.row + dr }));
            if (!moved.every(inGrid)) continue;
            if (moved.some((m) => others.some((o) => overlaps(m, o)))) continue;
            if (moved.some((m) => main.some((o) => adjacent(m, o))) && (!best || d < best.dist)) {
              best = { mass, dc, dr, dist: d };
            }
          }
        }
      }
    }
    if (!best) return null;
    const { mass, dc, dr } = best;
    out = out.map((b, i) => (mass.includes(i) ? { ...b, col: b.col + dc, row: b.row + dr } : b));
  }

  if (!touchesPageEdge(out, grid)) {
    if (fixed.size > 0) return null;
    // The Page edges the bounds reach, and how far the mass is from each (left, bottom, right, top: ties go in that order).
    const gaps = [
      { dc: -Math.min(...out.map((b) => b.col)), dr: 0, reach: bounds.col === 0 },
      { dc: 0, dr: grid.rows - Math.max(...out.map((b) => b.row + b.h)), reach: bounds.row + bounds.h === grid.rows },
      { dc: grid.cols - Math.max(...out.map((b) => b.col + b.w)), dr: 0, reach: bounds.col + bounds.w === grid.cols },
      { dc: 0, dr: -Math.min(...out.map((b) => b.row)), reach: bounds.row === 0 },
    ].filter((g) => g.reach);
    if (gaps.length === 0) return null;
    const nearest = gaps.reduce((best, g) => (Math.abs(g.dc + g.dr) < Math.abs(best.dc + best.dr) ? g : best));
    out = out.map((b) => ({ ...b, col: b.col + nearest.dc, row: b.row + nearest.dr }));
  }
  return out;
}
