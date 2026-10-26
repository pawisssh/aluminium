import { getColourway } from './constants.js';
import { generatePatternDetailed } from './generator.js';
import { gridFor } from './grid.js';
import { createRng } from './prng.js';
import { LATEST_REFERENCE_SET, maskOverlap, patternMask } from './referencePatterns.js';
import type { Candidate, Document, PatternFamily } from './types.js';

export type { Candidate };

/** How many Candidates a Candidate set holds. */
export const CANDIDATE_COUNT = 12;

/** Two Candidates this close (IoU of their 16x16 samples) count as the same shape. */
export const NEAR_DUPLICATE = 0.85;

/** Extra seeds a Candidate tries at the set's Guidance before it loosens Guidance. */
const MAX_REROLLS = 20;

/**
 * Where a Candidate whose seeds keep landing on taken shapes looks next: lower Guidance, a few seeds each. Many
 * References scale to the same shape on a small or wide Grid (Medium Flat has about ten), so 12 distinct ones
 * can need the freer skyline.
 */
const LOOSER_GUIDANCE = [60, 30, 0];
const REROLLS_PER_STEP = 8;

export interface CandidateSetOptions {
  /** The Page the set is drawn for; absent means the first. */
  pageIndex?: number;
}

/** One step of `candidateSet`: the Candidate that step finished, or undefined while it is still rolling. */
export type CandidateStep = { index: number; candidate: Candidate } | undefined;

/**
 * The Family each Candidate of a set is generated with. Under Auto the set mixes them: 6 rising, 4 hanging and
 * 2 mountain, or 7 rising and 5 hanging at 75% (Mountain has no 75% form), placed by the set seed. A chosen
 * Family fills the whole set.
 */
export function candidateFamilies(doc: Document, setSeed: string): PatternFamily[] {
  const chosen = doc.generator.family ?? 'auto';
  if (chosen !== 'auto') return Array<PatternFamily>(CANDIDATE_COUNT).fill(chosen);
  const counts: [PatternFamily, number][] =
    doc.generator.slope === '75'
      ? [['rising', 7], ['hanging', 5]]
      : [['rising', 6], ['hanging', 4], ['mountain', 2]];
  const families = counts.flatMap(([family, n]) => Array<PatternFamily>(n).fill(family));
  const rng = createRng(`${setSeed}-families`);
  for (let i = families.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [families[i], families[j]] = [families[j]!, families[i]!];
  }
  return families;
}

/** The seeds and Guidance Candidate `index` tries, in order, until one gives a shape not already in the set. */
function candidateTries(doc: Document, setSeed: string, index: number): { seed: string; guidance: number }[] {
  const seed = `${setSeed}-${index + 1}`;
  const own = doc.generator.guidance;
  const tries = [{ seed, guidance: own }];
  for (let k = 1; k <= MAX_REROLLS; k++) tries.push({ seed: `${seed}r${k}`, guidance: own });
  for (const guidance of LOOSER_GUIDANCE.filter((g) => g < own)) {
    for (let k = 0; k < REROLLS_PER_STEP; k++) tries.push({ seed: `${seed}g${guidance}r${k}`, guidance });
  }
  return tries;
}

/**
 * The Candidate set for Page `pageIndex` of `doc`, one Generate per step, so a caller can spread a slow set
 * (Extra fine 16:9, many re-rolls) over several frames. Each try is a new roll with the Candidate's Family on
 * the newest Reference set; the first shape under NEAR_DUPLICATE of every earlier Candidate wins, else the
 * least similar one. A set seed and the Page's settings fix all 12 Candidates.
 */
export function* candidateSet(
  doc: Document,
  setSeed: string,
  options: CandidateSetOptions = {}
): Generator<CandidateStep, void, void> {
  const pageIndex = options.pageIndex ?? 0;
  const page = doc.pages[pageIndex];
  if (!page) throw new Error(`There is no Page at index ${pageIndex}.`);
  const grid = gridFor(doc);
  const colourway = getColourway(doc.colourway)!;
  const zone = page.textZone ? { textZone: page.textZone } : {};
  const families = candidateFamilies(doc, setSeed);
  const taken: boolean[][] = [];
  for (let index = 0; index < CANDIDATE_COUNT; index++) {
    let best: { candidate: Candidate; mask: boolean[]; overlap: number } | null = null;
    for (const { seed, guidance } of candidateTries(doc, setSeed, index)) {
      if (best) yield undefined;
      const params = { ...doc.generator, family: families[index]!, guidance, referenceSet: LATEST_REFERENCE_SET };
      const { blocks } = generatePatternDetailed(grid, colourway, createRng(seed), params, zone);
      const mask = patternMask(blocks, grid);
      const overlap = Math.max(0, ...taken.map((t) => maskOverlap(t, mask)));
      if (!best || overlap < best.overlap) best = { candidate: { seed, pattern: blocks }, mask, overlap };
      if (overlap < NEAR_DUPLICATE) break;
    }
    taken.push(best!.mask);
    yield { index, candidate: best!.candidate };
  }
}

/** The whole Candidate set at once (see `candidateSet`). */
export function generateCandidates(doc: Document, setSeed: string, options: CandidateSetOptions = {}): Candidate[] {
  const set: Candidate[] = [];
  for (const step of candidateSet(doc, setSeed, options)) if (step) set.push(step.candidate);
  return set;
}

/**
 * What a Candidate set depends on: the Grid, Colourway, generator settings and the Page's layout and Text zone,
 * not the Document's own Patterns, seeds, text or Reference set. A change in anything else leaves the set as it is.
 */
export function candidateSetKey(doc: Document, setSeed: string, options: CandidateSetOptions = {}): string {
  const page = doc.pages[options.pageIndex ?? 0];
  const { referenceSet: _set, ...generator } = doc.generator;
  return JSON.stringify([
    doc.format,
    doc.customSize ?? null,
    doc.density,
    doc.colourway,
    generator,
    doc.blockCountExplicit ?? false,
    page?.textZone ?? null,
    page?.layout ?? 'pattern',
    setSeed,
  ]);
}
