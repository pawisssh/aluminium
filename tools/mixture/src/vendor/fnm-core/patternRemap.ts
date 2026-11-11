import type { CellRect } from './layouts.js';
import { checkPatternRules, overlaps, repairPatternRules } from './patternRules.js';
import { CLEAR_ZONE_MAX_OVERLAP, measureClearZoneOverlap } from './textZone.js';
import type { Block, Grid, TextZone } from './types.js';

/*
 * Re-mapping a Pattern from one rectangle of cells onto another (ADR 0007; #78). A Format/Density change re-maps the
 * whole Grid onto the whole new Grid; an Article cover re-maps the Page onto the area outside its Text zone, the area
 * back onto the Page, and one area onto another when the Fade direction changes.
 */

/** Scales one Block side into a span of `max` cells: a whole number of cells from 1 to `max` (ADR 0007). */
function scaleSide(raw: number, max: number): number {
  return Math.max(1, Math.min(max, Math.round(raw)));
}

/**
 * Re-maps one Block proportionally from the rectangle `from` onto the rectangle `to`: its centre scales with the
 * rectangle, and its size scales with it, rounded to whole cells. A Block that sticks out of `from` is pulled inside `to`.
 */
function remapBlock(block: Block, from: CellRect, to: CellRect): Block {
  const colRatio = to.w / from.w;
  const rowRatio = to.h / from.h;
  const w = scaleSide(block.w * colRatio, to.w);
  const h = scaleSide(block.h * rowRatio, to.h);
  const col = Math.max(to.col, Math.min(to.col + to.w - w, to.col + Math.round((block.col - from.col + block.w / 2) * colRatio - w / 2)));
  const row = Math.max(to.row, Math.min(to.row + to.h - h, to.row + Math.round((block.row - from.row + block.h / 2) * rowRatio - h / 2)));
  return { ...block, col, row, w, h };
}

/**
 * Restores Edge connect after per-Block snapping: for each pair that shared an edge before
 * the remap, slide the later Block (position only, so sizes stay as they are) until the edges
 * meet again. A slide is skipped when it would leave `bounds`, overlap another Block, or lose
 * the shared stretch of edge.
 */
function reconnectEdges(old: readonly Block[], next: Block[], bounds: CellRect): void {
  const ranges = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
  for (const axis of ['x', 'y', 'x', 'y'] as const) {
    const order = old.map((_, i) => i).sort((i, j) => (axis === 'x' ? old[i]!.col - old[j]!.col : old[i]!.row - old[j]!.row));
    for (const i of order) {
      for (const j of order) {
        const a = old[i]!;
        const b = old[j]!;
        const touching =
          axis === 'x'
            ? a.col + a.w === b.col && ranges(a.row, a.row + a.h, b.row, b.row + b.h)
            : a.row + a.h === b.row && ranges(a.col, a.col + a.w, b.col, b.col + b.w);
        if (!touching) continue;
        const na = next[i]!;
        const nb = next[j]!;
        const moved = axis === 'x' ? { ...nb, col: na.col + na.w } : { ...nb, row: na.row + na.h };
        if (moved.col === nb.col && moved.row === nb.row) continue;
        if (moved.col + moved.w > bounds.col + bounds.w || moved.row + moved.h > bounds.row + bounds.h) continue;
        const stillShares =
          axis === 'x'
            ? ranges(na.row, na.row + na.h, moved.row, moved.row + moved.h)
            : ranges(na.col, na.col + na.w, moved.col, moved.col + moved.w);
        if (!stillShares) continue;
        if (next.some((o, k) => k !== j && overlaps(moved, o))) continue;
        next[j] = moved;
      }
    }
  }
}

const contains = (outer: Block, inner: Block): boolean =>
  outer.col <= inner.col && outer.row <= inner.row && outer.col + outer.w >= inner.col + inner.w && outer.row + outer.h >= inner.row + inner.h;

/**
 * Takes the overlaps out of a re-mapped Pattern: squeezing a finer Grid into a part of the Page makes Blocks that
 * rounding puts on top of each other, and overlapping Blocks count their cells twice in the coverage rule. A Block
 * wholly inside another adds nothing to the shape and is dropped; any other later Block of an overlapping pair is cut
 * back to its largest piece clear of the earlier one. Repeats until nothing overlaps.
 */
function resolveOverlaps(blocks: readonly Block[]): Block[] {
  const out = blocks.map((b) => ({ ...b }));
  const dropped = new Set<number>();
  for (let guard = 0; guard < out.length * 4; guard++) {
    let changed = false;
    for (let j = 0; j < out.length && !changed; j++) {
      if (dropped.has(j)) continue;
      for (let i = 0; i < out.length && !changed; i++) {
        if (i === j || dropped.has(i) || !overlaps(out[i]!, out[j]!)) continue;
        const a = out[i]!;
        const b = out[j]!;
        if (contains(a, b) && (i < j || !contains(b, a))) dropped.add(j);
        else if (i > j) continue;
        else {
          const pieces: Block[] = [
            { ...b, w: a.col - b.col },
            { ...b, col: a.col + a.w, w: b.col + b.w - (a.col + a.w) },
            { ...b, h: a.row - b.row },
            { ...b, row: a.row + a.h, h: b.row + b.h - (a.row + a.h) },
          ].filter((p) => p.w >= 1 && p.h >= 1 && !overlaps(p, a));
          pieces.sort((p, q) => q.w * q.h - p.w * p.h);
          if (pieces[0]) out[j] = pieces[0];
          else dropped.add(j);
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out.filter((_, k) => !dropped.has(k));
}

const cellsInZone = (b: Block, z: TextZone): number =>
  Math.max(0, Math.min(b.col + b.w, z.col + z.w) - Math.max(b.col, z.col)) * Math.max(0, Math.min(b.row + b.h, z.row + z.h) - Math.max(b.row, z.row));

/** Every way to move one Block clear of `zone` that keeps it in `bounds` and off the other Blocks, the cheapest first. */
function clearingMoves(b: Block, zone: TextZone, bounds: CellRect, others: readonly Block[]): Block[] {
  const zoneEndCol = zone.col + zone.w;
  const zoneEndRow = zone.row + zone.h;
  // Cuts: drop the cells of the Block that lie on the zone's side of one of the zone's edges (the Block keeps the rest).
  const cuts: Block[] = [];
  if (b.row < zone.row) cuts.push({ ...b, h: zone.row - b.row });
  if (b.row + b.h > zoneEndRow) cuts.push({ ...b, row: zoneEndRow, h: b.row + b.h - zoneEndRow });
  if (b.col < zone.col) cuts.push({ ...b, w: zone.col - b.col });
  if (b.col + b.w > zoneEndCol) cuts.push({ ...b, col: zoneEndCol, w: b.col + b.w - zoneEndCol });
  const keepsSome = cuts.filter((c) => c.w >= 1 && c.h >= 1 && cellsInZone(c, zone) === 0).sort((x, y) => y.w * y.h - x.w * x.h);
  // Shifts: for a Block with no room to give up cells, move the whole Block one way out of the zone.
  const shifts: Block[] = [
    { ...b, row: zone.row - b.h },
    { ...b, row: zoneEndRow },
    { ...b, col: zone.col - b.w },
    { ...b, col: zoneEndCol },
  ]
    .filter((s) => s.col >= bounds.col && s.row >= bounds.row && s.col + s.w <= bounds.col + bounds.w && s.row + s.h <= bounds.row + bounds.h)
    .filter((s) => cellsInZone(s, zone) === 0 && !others.some((o) => overlaps(s, o)))
    .sort((x, y) => Math.abs(x.col - b.col) + Math.abs(x.row - b.row) - (Math.abs(y.col - b.col) + Math.abs(y.row - b.row)));
  return [...keepsSome, ...shifts];
}

/**
 * Brings a Clear Text zone's overlap within the rule (at most 15% of its cells, all in its outer ring) by trimming
 * the Blocks that reach into it, in place: each trimmed Block gives up the cells on the zone's side (or moves out
 * if it is one cell thin there), and the Block that gives up the fewest cells beyond what is needed goes first.
 * Returns false when no Block can give way.
 */
function trimClearZone(blocks: Block[], zone: TextZone, bounds: CellRect): boolean {
  const skipped = new Set<number>();
  for (let guard = 0; guard < blocks.length * 2 + 4; guard++) {
    const overlap = measureClearZoneOverlap({ pattern: blocks, textZone: zone });
    if (overlap.withinLimit) return true;
    const allowed = Math.floor(zone.w * zone.h * CLEAR_ZONE_MAX_OVERLAP);
    const need = Math.max(1, overlap.covered - allowed);
    const reaching = blocks
      .map((b, i) => ({ i, n: cellsInZone(b, zone) }))
      .filter((x) => x.n > 0 && !skipped.has(x.i))
      .sort((x, y) => x.n - y.n);
    if (reaching.length === 0) return false;
    const pick = reaching.find((x) => x.n >= need) ?? reaching[reaching.length - 1]!;
    const others = blocks.filter((_, k) => k !== pick.i);
    const move = clearingMoves(blocks[pick.i]!, zone, bounds, others)[0];
    if (move) blocks[pick.i] = move;
    else skipped.add(pick.i);
  }
  return measureClearZoneOverlap({ pattern: blocks, textZone: zone }).withinLimit;
}

export interface RemapSpec {
  /** The cells the Pattern lies in now (the whole Grid, or an Article cover's area), on `fromGrid`. */
  from: CellRect;
  /** The cells it is to lie in, on `toGrid`. */
  to: CellRect;
  fromGrid: Grid;
  toGrid: Grid;
  /** A Clear Text zone of the Page the Pattern lands on: its overlap is then kept within the rule. */
  zone?: TextZone;
  /** Take out the overlaps the re-map makes (an Article cover squeezes a Grid into part of the Page). */
  resolveOverlaps?: boolean;
}

/**
 * Re-maps a Pattern from `from` onto `to`: every Block's centre and size scale with the rectangle (rounded to whole
 * cells), Edge connects are restored, and a Pattern that followed the Pattern rules and no longer does is repaired by
 * sliding masses inside `to`, keeping every Block. With `resolveOverlaps`, Blocks the re-map put on top of each other are
 * cut apart first (a Block wholly covered by another is dropped). With a Clear `zone`, the Blocks that reach into it are trimmed to
 * the Clear zone rule. The whole Grid onto the whole Grid is the Format/Density change.
 */
export function remapPattern(blocks: readonly Block[], spec: RemapSpec): Block[] {
  const { from, to, fromGrid, toGrid, zone } = spec;
  let pattern = blocks.map((b) => remapBlock(b, from, to));
  reconnectEdges(blocks, pattern, to);
  if (spec.resolveOverlaps) pattern = resolveOverlaps(pattern);
  const followedRules = checkPatternRules(blocks, fromGrid).ok;
  const repair = (): void => {
    if (!followedRules || checkPatternRules(pattern, toGrid).ok) return;
    const repaired = repairPatternRules(pattern, toGrid, new Set(), to);
    if (repaired && checkPatternRules(repaired, toGrid).ok) pattern = repaired;
  };
  repair();
  if (zone && zone.mode === 'clear') {
    // Trimming can cut a Block off its mass and repairing can slide a mass back into the zone: a few rounds settle it.
    for (let round = 0; round < 3; round++) {
      if (!trimClearZone(pattern, zone, to)) break;
      if (!followedRules || checkPatternRules(pattern, toGrid).ok) break;
      repair();
    }
  }
  return pattern;
}
