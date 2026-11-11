import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { generatePattern } from './generator.js';
import { createRng } from './prng.js';
import { LATEST_REFERENCE_SET, REFERENCE_SIZE, maskOverlap, patternMask } from './referencePatterns.js';
import type { PatternFamily, Slope } from './types.js';

/** The side, in cells, of a square Grid a Brick is drawn on. */
export type BrickGridSide = 2 | 4 | 8 | 16;

export type InvestmentStyle = 'one-time' | 'dollar-cost-average' | 'market-timing';
export type RiskLevel = 'low' | 'medium' | 'high';
/** One level, or a range from one level to another. */
export type Risk = RiskLevel | readonly [RiskLevel, RiskLevel];

/** The part of a Strategy that shapes its Brick. */
export interface Strategy {
  investmentStyle: InvestmentStyle;
  risk: Risk;
  initialCost: number;
}

/** One product a Preset draws a Brick for. */
export interface PresetEntry {
  /** Names the entry in its Brick and in errors. */
  id: string;
  strategy: Strategy;
  /** The product's Plan Cover: 16 rows of 16 cells, row 0 at the top, true where the artwork has a rectangle. */
  planCover?: readonly (readonly boolean[])[];
}

/** A Brick as generator settings and a seed, with what the Preset measured on it. */
export interface PresetBrick {
  id: string;
  family: Exclude<PatternFamily, 'auto'>;
  slope: Slope;
  blockCount: number;
  guidance: number;
  cornerMeetLimit: number;
  seed: string;
  /** The Block with the most cells, in cells. */
  largestBlock: { w: number; h: number };
  /** True when the largest Block meets the Initial Cost target; false when it is only the nearest found. */
  exact: boolean;
}

const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high'];
const RISK_SLOPES: readonly Slope[] = ['flat', 'half', '75'];

/** Risk sets the Slope: low Flat, medium Half, high 75%. A range takes its middle, rounded up; Market Timing stops at Half. */
function slopeFor({ investmentStyle, risk }: Strategy): Slope {
  const [from, to] = (typeof risk === 'string' ? [risk, risk] : risk).map((level) => RISK_LEVELS.indexOf(level));
  const slope = RISK_SLOPES[Math.ceil((from! + to!) / 2)]!;
  return investmentStyle === 'market-timing' && slope === '75' ? 'half' : slope;
}

type BrickFamily = PresetBrick['family'];

/** Investment Style sets the families a Brick is drawn from and the Corner meet limit the generator is given. */
const STYLE_SHAPES: Record<InvestmentStyle, { families: readonly BrickFamily[]; cornerMeetLimit: number }> = {
  'one-time': { families: ['rising', 'hanging'], cornerMeetLimit: 0 },
  'dollar-cost-average': { families: ['rising', 'hanging'], cornerMeetLimit: 2 },
  'market-timing': { families: ['mountain'], cornerMeetLimit: 1 },
};

/** The search space: every Block count and Guidance below is drawn with each seed, for each family. */
const BLOCK_COUNTS: Record<BrickGridSide, readonly number[]> = {
  2: [1, 2, 3],
  4: [2, 3, 4, 5, 6],
  8: [2, 3, 4, 6, 8, 12],
  16: [3, 5, 8, 12, 16, 24, 32],
};
const GUIDANCES: readonly number[] = [0, 60];
const SEEDS: readonly string[] = Array.from({ length: 60 }, (_, n) => `preset-${n}`);

/** The seven Initial Cost steps, in baht. */
export const INITIAL_COST_STEPS: readonly number[] = [1, 5_000, 20_000, 50_000, 500_000, 2_000_000, 10_000_000];

/** Up to 50,000 baht (steps 0 to 3) the largest Block is narrow: this wide, and this tall at each step. */
const NARROW: Record<BrickGridSide, { w: number; h: readonly number[] }> = {
  2: { w: 1, h: [1, 1, 2, 2] },
  4: { w: 1, h: [1, 2, 2, 3] },
  8: { w: 1, h: [2, 3, 4, 5] },
  16: { w: 2, h: [4, 6, 8, 10] },
};
/** From 500,000 baht (steps 4 to 6) the largest Block is wide: at least this many cells each way. */
const WIDE: Record<BrickGridSide, number> = { 2: 2, 4: 2, 8: 2, 16: 4 };

/** How far a largest Block is from the Initial Cost target of a step, in cells; 0 meets it. */
function distanceFromTarget(side: BrickGridSide, step: number, { w, h }: { w: number; h: number }): number {
  if (step <= 3) return Math.abs(w - NARROW[side].w) + Math.abs(h - NARROW[side].h[step]!);
  // A 2×2 Block is the whole 2×2 Grid, so wide there means the two cells of one row.
  if (side === 2) return Math.abs(w - 2) + Math.abs(h - 1);
  return Math.max(0, WIDE[side] - w) + Math.max(0, WIDE[side] - h);
}

/** A Brick found in the search space. */
interface Found {
  settings: Pick<PresetBrick, 'family' | 'slope' | 'blockCount' | 'guidance' | 'cornerMeetLimit' | 'seed'>;
  /** The filled cells, row by row from the top: what makes two Bricks the same drawing. */
  cells: string;
  largestBlock: { w: number; h: number };
  /** True when the cells hold together by edges alone, false when they need a corner. */
  edgeJoined: boolean;
  /** The Brick scaled up to a Plan Cover's 16×16 cells. */
  sample: boolean[];
}

/** True when every filled cell is reached from the first by steps across cell edges. */
function joinedByEdges(filled: readonly boolean[], side: number): boolean {
  const reached = new Set<number>();
  const queue = [filled.indexOf(true)];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    if (reached.has(cell)) continue;
    reached.add(cell);
    const col = cell % side;
    for (const next of [cell - side, cell + side, col > 0 ? cell - 1 : -1, col < side - 1 ? cell + 1 : -1]) {
      if (filled[next]) queue.push(next);
    }
  }
  return reached.size === filled.filter(Boolean).length;
}

/**
 * Every different Brick the generator draws for a family, Slope and Corner meet limit over the search space.
 * Bricks with the same cells and the same largest Block count once, as the first one found.
 */
function search(side: BrickGridSide, family: BrickFamily, slope: Slope, cornerMeetLimit: number): Found[] {
  const grid = { cols: side, rows: side, cellW: 1, cellH: 1 };
  // The Colourway only picks Block tints, which a single-colour Brick ignores.
  const colourway = getColourway(DEFAULT_COLOURWAY_ID)!;
  const found = new Map<string, Found>();
  for (const blockCount of BLOCK_COUNTS[side])
    for (const guidance of GUIDANCES)
      for (const seed of SEEDS) {
        const settings = { family, slope, blockCount, guidance, cornerMeetLimit };
        const blocks = generatePattern(grid, colourway, createRng(seed), { ...settings, referenceSet: LATEST_REFERENCE_SET });
        if (blocks.length === 0) continue;
        const filled = Array<boolean>(side * side).fill(false);
        for (const b of blocks)
          for (let row = b.row; row < b.row + b.h; row++)
            for (let col = b.col; col < b.col + b.w; col++) filled[row * side + col] = true;
        const cells = filled.map((on) => (on ? '#' : '.')).join('');
        // The largest Block is the one with the most cells; of equals, the first the generator drew.
        const largest = blocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
        const key = `${cells}|${largest.w}x${largest.h}`;
        if (found.has(key)) continue;
        found.set(key, {
          settings: { ...settings, seed },
          cells,
          largestBlock: { w: largest.w, h: largest.h },
          edgeJoined: joinedByEdges(filled, side),
          sample: patternMask(blocks, grid),
        });
      }
  return [...found.values()];
}

/**
 * A Preset: the Brick of each entry's Strategy on a square Grid of `side` cells, as generator settings and a
 * seed that redraw it with the newest Reference set.
 *
 * Investment Style sets the family and how the Brick is joined, Risk the Slope, Initial Cost the largest Block.
 * Of the Bricks a Strategy allows, an entry gets the one nearest its Initial Cost target; of those, one no
 * earlier entry took; of those, the one overlapping its Plan Cover most. So the order of the entries matters,
 * and an entry whose Strategy allows no Brick in the search space gets null.
 */
export function presetBricks(side: BrickGridSide, entries: readonly PresetEntry[]): (PresetBrick | null)[] {
  const searched = new Map<string, Found[]>();
  const searchOnce = (family: BrickFamily, slope: Slope, cornerMeetLimit: number): Found[] => {
    const key = [family, slope, cornerMeetLimit].join();
    if (!searched.has(key)) searched.set(key, search(side, family, slope, cornerMeetLimit));
    return searched.get(key)!;
  };
  // Checked before the search, which is slow on a fine Grid.
  for (const { id, strategy, planCover } of entries) {
    if (!INITIAL_COST_STEPS.includes(strategy.initialCost)) {
      throw new Error(`Preset entry "${id}": Initial Cost ${strategy.initialCost} is not one of the steps ${INITIAL_COST_STEPS.join(', ')}.`);
    }
    if (planCover && (planCover.length !== REFERENCE_SIZE || planCover.some((row) => row.length !== REFERENCE_SIZE))) {
      throw new Error(`Preset entry "${id}": a Plan Cover is ${REFERENCE_SIZE} rows of ${REFERENCE_SIZE} cells.`);
    }
  }
  /** The cells of the Bricks earlier entries took. */
  const taken = new Set<string>();
  return entries.map(({ id, strategy, planCover }) => {
    const style = strategy.investmentStyle;
    const { families, cornerMeetLimit } = STYLE_SHAPES[style];
    const slope = slopeFor(strategy);
    // One-time keeps the Bricks joined by edges alone, Dollar Cost Average those that are not, Market Timing both.
    const allowed = families
      .flatMap((family) => searchOnce(family, slope, cornerMeetLimit))
      .filter((brick) => style === 'market-timing' || brick.edgeJoined === (style === 'one-time'));
    const step = INITIAL_COST_STEPS.indexOf(strategy.initialCost);
    const cover = planCover?.flat();
    // Nearest the Initial Cost target, then a Brick no earlier entry took, then the most overlap with the Plan Cover.
    let best: { brick: Found; distance: number; fresh: boolean; overlap: number } | null = null;
    for (const brick of allowed) {
      const distance = distanceFromTarget(side, step, brick.largestBlock);
      const fresh = !taken.has(brick.cells);
      const overlap = cover ? maskOverlap(brick.sample, cover) : 0;
      const better =
        !best ||
        distance < best.distance ||
        (distance === best.distance && (fresh !== best.fresh ? fresh : overlap > best.overlap));
      if (better) best = { brick, distance, fresh, overlap };
    }
    if (!best) return null;
    taken.add(best.brick.cells);
    return { id, ...best.brick.settings, largestBlock: best.brick.largestBlock, exact: best.distance === 0 };
  });
}
