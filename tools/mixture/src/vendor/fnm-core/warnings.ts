import type { Document, Grid, Warning } from './types.js';
import { countCornerMeets, defaultBlockCountFor } from './generator.js';
import { gridFor } from './grid.js';
import { checkPatternRules } from './patternRules.js';
import { CLEAR_ZONE_MAX_OVERLAP, measureClearZoneOverlap } from './textZone.js';

/**
 * The recommended maximum scales with the Grid, because the generator's Block sizes are fixed and a finer
 * Grid holds more Blocks: 1.75x the Grid's default Block count, and never below 4.
 * PROVISIONAL: To be confirmed by a designer (Refs #1, #7).
 */
export const RECOMMENDED_MAX_FACTOR = 1.75;

/** CI guideline recommendation limit: up to 3 corner meets are permitted before warning. */
export const MAX_RECOMMENDED_CORNER_MEETS = 3;

/**
 * Returns the recommended maximum Block count for a Grid.
 */
export function recommendedMaxBlockCountFor(grid: Grid): number {
  return Math.max(4, Math.ceil(RECOMMENDED_MAX_FACTOR * defaultBlockCountFor(grid)));
}

/**
 * Computes CI Advisory warnings for a Document.
 * Advisory rules warn but never reject:
 * - 'advisory.blockCount' when Block count > recommended max for the Grid.
 * - 'advisory.cornerMeets' when corner meets > 3; carries points: {col,row}[].
 * - 'advisory.disconnected' when the Blocks are not one mass touching a Page edge (manual edits,
 *   or a Format/Density remap that could not be repaired); carries the broken `rules`.
 * - 'advisory.coverage' when two or more Blocks cover more of the Page than the Pattern rules allow
 *   (e.g. an edited Pattern remapped to a coarser Density).
 * - 'advisory.textOverlap' when Blocks cover a Clear Text zone beyond the allowance (more than
 *   CLEAR_ZONE_MAX_OVERLAP of it, or any cell inside its outer ring).
 */
export function computeWarnings(doc: Document): Warning[] {
  const warnings: Warning[] = [];
  const pattern = doc.pages[0]?.pattern ?? [];

  const grid = gridFor(doc);
  const maxBlocks = recommendedMaxBlockCountFor(grid);
  if (pattern.length > maxBlocks) {
    warnings.push({
      code: 'advisory.blockCount',
      message: `Block count (${pattern.length}) exceeds the recommended maximum of ${maxBlocks} for a ${grid.cols}×${grid.rows} Grid.`,
      count: pattern.length,
      max: maxBlocks,
    });
  }

  const meets = countCornerMeets(pattern);
  if (meets.length > MAX_RECOMMENDED_CORNER_MEETS) {
    warnings.push({
      code: 'advisory.cornerMeets',
      message: `Corner meets (${meets.length}) exceed recommended limit of ${MAX_RECOMMENDED_CORNER_MEETS}.`,
      points: meets,
    });
  }

  const violations = checkPatternRules(pattern, grid).violations;
  const rules = violations
    .map((v) => v.split(':')[0])
    .filter((r): r is 'disconnected' | 'noEdge' => r === 'disconnected' || r === 'noEdge');
  if (rules.length > 0) {
    warnings.push({
      code: 'advisory.disconnected',
      message: rules.includes('disconnected')
        ? 'The Blocks do not form one connected mass; the guideline Patterns are a single shape.'
        : 'The Pattern does not touch any edge of the Page; the guideline Patterns always do.',
      rules,
    });
  }
  const coverage = violations.find((v) => v.startsWith('coverage:'));
  if (coverage) {
    warnings.push({
      code: 'advisory.coverage',
      message: `${coverage.slice('coverage: '.length).replace(/^t/, 'T')}; the guideline Patterns leave more of the Page open.`,
    });
  }

  const overlap = doc.pages[0] ? measureClearZoneOverlap(doc.pages[0]) : null;
  if (overlap && !overlap.withinLimit) {
    warnings.push({
      code: 'advisory.textOverlap',
      message: overlap.reachesInterior
        ? 'Blocks reach into the middle of the Text zone, where the text sits; they may only nibble its edge.'
        : `Blocks cover ${Math.round(overlap.share * 100)}% of the Text zone; at most ${Math.round(CLEAR_ZONE_MAX_OVERLAP * 100)}% of it, at its edge, may be covered.`,
      share: overlap.share,
      reachesInterior: overlap.reachesInterior,
    });
  }

  return warnings;
}
