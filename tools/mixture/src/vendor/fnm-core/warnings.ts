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

/** Guideline 6.3 Highlight build: no more than a few key words. Above this count the Advisory fires. */
export const MAX_HIGHLIGHT_WORDS = 4;

/** Latin letters a headline needs before an all-caps headline is worth an Advisory. */
export const MIN_CAPS_LETTERS = 4;

/** CI guideline recommendation limit: up to 3 corner meets are permitted before warning. */
export const MAX_RECOMMENDED_CORNER_MEETS = 3;

/**
 * Returns the recommended maximum Block count for a Grid.
 */
export function recommendedMaxBlockCountFor(grid: Grid): number {
  return Math.max(4, Math.ceil(RECOMMENDED_MAX_FACTOR * defaultBlockCountFor(grid)));
}

let wordSegmenter: Intl.Segmenter | undefined;

/** Words inside the `[bracketed]` runs of a headline (Intl.Segmenter word granularity, so Thai counts too). */
export function countHighlightWords(headline: string): number {
  wordSegmenter ??= new Intl.Segmenter('th', { granularity: 'word' });
  let count = 0;
  for (const run of headline.matchAll(/\[([^\[\]]*)\]/g)) {
    for (const seg of wordSegmenter.segment(run[1]!)) if (seg.isWordLike) count++;
  }
  return count;
}

/** True when the Latin letters of a headline are all upper case (Thai has no case and is ignored). */
export function isAllCapsHeadline(headline: string): boolean {
  const letters = headline.match(/\p{Script=Latin}/gu) ?? [];
  return letters.length >= MIN_CAPS_LETTERS && letters.every((l) => l === l.toUpperCase() && l !== l.toLowerCase());
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
 * - 'advisory.headlineCaps' when a Page's headline (its layout is not 'pattern') is all upper-case Latin.
 * - 'advisory.highlightWords' when its [bracketed] Highlight runs hold more than MAX_HIGHLIGHT_WORDS words.
 */
export function computeWarnings(doc: Document): Warning[] {
  const warnings: Warning[] = [];
  const grid = gridFor(doc);
  const maxBlocks = recommendedMaxBlockCountFor(grid);
  const deck = doc.pages.length > 1;

  doc.pages.forEach((page, pageIndex) => {
    const pattern = page.pattern;
    // In a deck every message says which Page it is about.
    const about = deck ? `Page ${pageIndex + 1}: ` : '';

    if (pattern.length > maxBlocks) {
      warnings.push({
        code: 'advisory.blockCount',
        message: `${about}Block count (${pattern.length}) exceeds the recommended maximum of ${maxBlocks} for a ${grid.cols}×${grid.rows} Grid.`,
        pageIndex,
        count: pattern.length,
        max: maxBlocks,
      });
    }

    const meets = countCornerMeets(pattern);
    if (meets.length > MAX_RECOMMENDED_CORNER_MEETS) {
      warnings.push({
        code: 'advisory.cornerMeets',
        message: `${about}Corner meets (${meets.length}) exceed recommended limit of ${MAX_RECOMMENDED_CORNER_MEETS}.`,
        pageIndex,
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
        message:
          about +
          (rules.includes('disconnected')
            ? 'The Blocks do not form one connected mass; the guideline Patterns are a single shape.'
            : 'The Pattern does not touch any edge of the Page; the guideline Patterns always do.'),
        pageIndex,
        rules,
      });
    }
    const coverage = violations.find((v) => v.startsWith('coverage:'));
    if (coverage) {
      warnings.push({
        code: 'advisory.coverage',
        message: `${about}${deck ? coverage.slice('coverage: '.length) : coverage.slice('coverage: '.length).replace(/^t/, 'T')}; the guideline Patterns leave more of the Page open.`,
        pageIndex,
      });
    }

    const overlap = measureClearZoneOverlap(page);
    if (!overlap.withinLimit) {
      warnings.push({
        code: 'advisory.textOverlap',
        message:
          about +
          (overlap.reachesInterior
            ? 'Blocks reach into the middle of the Text zone, where the text sits; they may only nibble its edge.'
            : `Blocks cover ${Math.round(overlap.share * 100)}% of the Text zone; at most ${Math.round(CLEAR_ZONE_MAX_OVERLAP * 100)}% of it, at its edge, may be covered.`),
        pageIndex,
        share: overlap.share,
        reachesInterior: overlap.reachesInterior,
      });
    }

    const headline = page.layout && page.layout !== 'pattern' ? page.content?.headline : undefined;
    if (!headline) return;
    if (isAllCapsHeadline(headline)) {
      warnings.push({
        code: 'advisory.headlineCaps',
        message: 'The headline is in ALL CAPS; the guideline sets headlines in sentence case.',
        pageIndex,
      });
    }
    const words = countHighlightWords(headline);
    if (words > MAX_HIGHLIGHT_WORDS) {
      warnings.push({
        code: 'advisory.highlightWords',
        message: `${words} words are highlighted; the guideline says no more than a few key words (${MAX_HIGHLIGHT_WORDS}).`,
        pageIndex,
        count: words,
        max: MAX_HIGHLIGHT_WORDS,
      });
    }
  });

  return warnings;
}
