import { BRAND_COLOURS } from './colourway.js';
import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { densityLevelsFor } from './formats.js';
import { gridFor } from './grid.js';
import type { CellRect } from './layouts.js';
import type { ArticleCoverSettings, Document, FadeDirection, HighlightColour, Page, PhotoEdge } from './types.js';

/*
 * Article cover settings and colours (GLOSSARY: Article cover; spec #67, ADR 0010). An Article cover is navy 100
 * with Blocks in navy 75 and a Highlight in a brand colour at 100 chosen apart from the Blocks: it is not a
 * Colourway, and the Document's Colourway does not apply to it.
 */

/**
 * The Highlight colours an Article cover offers (spec #67, story 9). The order is part of the share link format
 * (the colour is stored by its index): only ever append.
 */
export const HIGHLIGHT_COLOURS: readonly HighlightColour[] = ['yellow', 'green', 'blue', 'purple', 'red', 'orange', 'white'];

/** The Format and Density every Article cover is on (spec #67): Link preview 1.91:1 at its 32x16 Grid. */
export const ARTICLE_COVER_FORMAT = (() => {
  const level = densityLevelsFor('link-1-91').find((l) => l.cols === 32 && l.rows === 16)!;
  return { format: 'link-1-91', density: level.level } as const;
})();

/** True when a Page of `doc` is an Article cover: its Format, Density and background are then fixed. */
export const holdsArticleCover = (doc: Document): boolean => doc.pages.some((p) => p.layout === 'article-cover');

/**
 * Why a Document holding an Article cover breaks what the commands keep (one Page, Link preview 1.91:1 at 32x16,
 * a navy background), if it does. A loaded file or share link is checked with it, since neither went through the
 * commands.
 */
export function articleCoverDocumentProblem(doc: Document): string | null {
  if (!holdsArticleCover(doc)) return null;
  if (doc.pages.length !== 1) return 'An Article cover is a one-Page Document';
  const grid = gridFor(doc);
  if (doc.format !== ARTICLE_COVER_FORMAT.format || grid.cols !== 32 || grid.rows !== 16) {
    return 'An Article cover is always Link preview 1.91:1 at the 32x16 Grid';
  }
  if (doc.transparentBackground) return 'An Article cover is drawn on navy, so its background cannot be transparent';
  return null;
}

/** Why a colour photo is refused: the brand guideline allows only black and white, and ADR 0010 makes this one layout the exception. */
export const COLOUR_PHOTO_REFUSED = {
  code: 'photo.colourNotAllowed',
  message: 'A colour photo is only for an Article cover. Every other layout takes a black-and-white photo.',
} as const;

/**
 * Why a Document holds a colour photo where only black and white is allowed, if it does. A loaded file or share
 * link is checked with it, since neither went through `setPhoto`.
 */
export function colourPhotoProblem(doc: Document): string | null {
  const bad = doc.pages.findIndex((p) => p.content?.photo?.colour && p.layout !== 'article-cover');
  return bad < 0 ? null : `Page ${bad} holds a colour photo, which only an Article cover takes`;
}

/**
 * The Photo edges, in the order the share link stores them (by index): only ever append.
 */
export const PHOTO_EDGES: readonly PhotoEdge[] = ['fade', 'step'];

/** The Photo edge an Article cover has until it is set: the photo dissolves into the background (spec #67). */
export const DEFAULT_PHOTO_EDGE: PhotoEdge = 'fade';

/** The Fade directions, in the order the share link stores them (by index): only ever append. */
export const FADE_DIRECTIONS: readonly FadeDirection[] = ['left', 'bottom', 'full'];

/** The Fade direction an Article cover has until it is set: a photo on the right dissolving toward the headline. */
export const DEFAULT_FADE_DIRECTION: FadeDirection = 'left';

/** The fade length the user can set, in whole Grid cells (spec #67). */
export const FADE_LENGTH_RANGE = { min: 6, max: 14 } as const;

/**
 * The cells an edge runs over, from the photo's inner side: the Fade edge's ramp and the Step edge's width.
 * 10 for a Left or Full fade (the prototype verdict on #67).
 */
export const DEFAULT_FADE_LENGTH = 10;

/** The cells a Bottom fade runs over until set: 6 rows (the prototype verdict on #67). */
export const DEFAULT_LOW_FADE_LENGTH = 6;

/** The edge length a Fade direction has until the Page sets one. */
export const defaultFadeLength = (direction: FadeDirection): number => (direction === 'bottom' ? DEFAULT_LOW_FADE_LENGTH : DEFAULT_FADE_LENGTH);

/** The cells an edge of `length` cells really runs over in a slot `extent` cells long: a longer fade is shortened to the slot. */
export const fadeRampCells = (length: number, extent: number): number => Math.min(length, extent);

/** Every Article cover setting, with its default where the Page leaves it out. */
export function articleCoverSettings(page: Page): Required<ArticleCoverSettings> {
  const fadeDirection = page.articleCover?.fadeDirection ?? DEFAULT_FADE_DIRECTION;
  return {
    highlight: page.articleCover?.highlight ?? 'yellow',
    photoEdge: page.articleCover?.photoEdge ?? DEFAULT_PHOTO_EDGE,
    fadeLength: page.articleCover?.fadeLength ?? defaultFadeLength(fadeDirection),
    fadeDirection,
  };
}

const invalid = (message: string) => ({ code: 'articleCover.invalid', message });

/** Why a patch of Article cover settings is not valid, if it is not. */
export function articleCoverProblem(settings: unknown): { code: string; message: string } | null {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return invalid('Article cover settings must be an object.');
  }
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'highlight') {
      if (!HIGHLIGHT_COLOURS.includes(value as HighlightColour)) {
        return invalid(`The Highlight colour must be one of ${HIGHLIGHT_COLOURS.join(', ')}; got ${JSON.stringify(value)}.`);
      }
    } else if (key === 'photoEdge') {
      if (!PHOTO_EDGES.includes(value as PhotoEdge)) {
        return invalid(`The Photo edge must be one of ${PHOTO_EDGES.join(', ')}; got ${JSON.stringify(value)}.`);
      }
    } else if (key === 'fadeLength') {
      const { min, max } = FADE_LENGTH_RANGE;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        return invalid(`The fade length must be a whole number of cells from ${min} to ${max}; got ${JSON.stringify(value)}.`);
      }
    } else if (key === 'fadeDirection') {
      if (!FADE_DIRECTIONS.includes(value as FadeDirection)) {
        return invalid(`The fade direction must be one of ${FADE_DIRECTIONS.join(', ')}; got ${JSON.stringify(value)}.`);
      }
    } else {
      return invalid(`Unknown Article cover setting: ${key}`);
    }
  }
  return null;
}

/**
 * The cells the Step edge cuts out of an Article cover's photo, as the prototype drew it: four bands, the cut changing
 * band by band so the staircase rises from bottom-left to top-right. `edge` is where the photo is fully the background
 * (`articleCoverEdge`); it defaults to the slot's left side, the Left direction.
 *  - along x: four bands of equal height from the top, each cut running from the slot's left side to `edge.start` plus
 *    `length * (3 - band) / 3` cells, so the photo starts further right at the top. Where the slot reaches left of
 *    `edge.start` (Full) every band is cut at least that far.
 *  - along y: four bands of equal width from the left, each cut `length * band / 3` cells up from `edge.start`, so the
 *    photo ends higher toward the right.
 * A band whose cut rounds to nothing is left out. `length` is shortened to the cells the photo has beyond `edge.start`.
 */
export function stepEdgeCuts(slot: CellRect, length: number, edge: { axis: 'x' | 'y'; start: number } = { axis: 'x', start: slot.col }): CellRect[] {
  const bands = 4;
  const cuts: CellRect[] = [];
  if (edge.axis === 'y') {
    const len = fadeRampCells(length, edge.start - slot.row);
    for (let band = 0; band < bands; band++) {
      const col = slot.col + Math.round((band * slot.w) / bands);
      const end = slot.col + Math.round(((band + 1) * slot.w) / bands);
      const h = Math.round((len * band) / (bands - 1));
      if (h > 0 && end > col) cuts.push({ col, row: edge.start - h, w: end - col, h });
    }
    return cuts;
  }
  const len = fadeRampCells(length, slot.col + slot.w - edge.start);
  for (let band = 0; band < bands; band++) {
    const row = slot.row + Math.round((band * slot.h) / bands);
    const end = slot.row + Math.round(((band + 1) * slot.h) / bands);
    const w = edge.start - slot.col + Math.round((len * (bands - 1 - band)) / (bands - 1));
    if (w > 0 && end > row) cuts.push({ col: slot.col, row, w, h: end - row });
  }
  return cuts;
}

/** The solid fills a Page is drawn in: its background and the fill of each Block Tint index. */
export interface PageFills {
  background: string;
  tints: readonly string[];
}

const ARTICLE_COVER_FILLS: PageFills = { background: BRAND_COLOURS.navy[100], tints: [BRAND_COLOURS.navy[75]] };

/**
 * The fills of Page `pageIndex`: navy 100 and navy 75 on an Article cover, the Colourway's background and Tints
 * on every other Page. Everything that reads what sits under a slot (text colour, logo placement) and the
 * serializers read it here, so the Editor, the SVG and the exports agree.
 */
export function pageFills(doc: Document, pageIndex: number): PageFills {
  if (doc.pages[pageIndex]?.layout === 'article-cover') return ARTICLE_COVER_FILLS;
  const colourway = getColourway(doc.colourway) ?? getColourway(DEFAULT_COLOURWAY_ID)!;
  return { background: colourway.background, tints: colourway.tints };
}

/** The fill of a Block's Tint index on a Page of these fills (an index past the Tints wraps round). */
export function tintFill(fills: PageFills, tint: number): string {
  const count = fills.tints.length;
  const i = count > 0 ? ((tint % count) + count) % count : 0;
  return fills.tints[i] ?? fills.background;
}

/** The hex of an Article cover's Highlight colour: the brand colour at 100. */
export const highlightHex = (colour: HighlightColour): string => BRAND_COLOURS[colour][100];
