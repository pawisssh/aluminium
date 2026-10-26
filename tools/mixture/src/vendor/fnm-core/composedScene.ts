import { textColourOnFill } from './colourway.js';
import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { getFormatDimensions } from './formats.js';
import { gridFor } from './grid.js';
import { layoutSlots, type LayoutSlot, type PxRect } from './layouts.js';
import { logoPlacement } from './logoPlacement.js';
import { fillUnderSlot, textColourFor, TEXT_NAVY, TEXT_WHITE } from './textColour.js';
import {
  layoutOutline,
  layoutPrepared,
  prepareText,
  TYPE_STYLES,
  layoutText,
  parseMarkup,
  type FaceId,
  type LayoutLine,
  type Shaper,
  type TextAlign,
  type TextLayout,
} from './text/index.js';
import type { Document, Page, PageLayoutId } from './types.js';

/*
 * The composed scene (spec "Phase 3" and "Phase 5"; ADR 0008): the Pattern plus the Page layout's slots, filled
 * with the Page's content, as plain data in Page pixels. `composeScene` decides every position, size and colour;
 * the serializers only write it out: `renderComposed` (composedRenderer.ts) as an SVG with outlined text, and
 * the PPTX export as native shapes and editable text boxes. The scene is the single place the layout rules live.
 *
 * Paint order, bottom to top (the order the serializers follow):
 *   1. background and Blocks;
 *   2. the photo, cropped to its slot;
 *   3. every Highlight box and Wick (before any text, because neighbouring lines' boxes overlap);
 *   4. the headline, secondary copy and label;
 *   5. the Ticker: its strip, then its two texts;
 *   6. the wordmark.
 * No transparency anywhere. Text and the wordmark are White or Navy only; Highlight fills are a Colourway colour.
 *
 * Which fonts the text is laid out with is the shaper's business: give it the Trek faces and the lines match the
 * app; give it Plex Sans Thai under the Trek face ids and the lines, Highlight boxes and Wicks match Plex text.
 */

/** Ticker strip height as a multiple of the type's cap height (guideline 6.6: "2x the type height"). */
export const TICKER_HEIGHT_OF_CAP = 2;

/** Largest type size per layout, as a share of the Page's short side. The slot decides when it is smaller. */
export const HEADLINE_MAX_OF_SHORT: Record<Exclude<PageLayoutId, 'pattern'>, number> = {
  headline: 0.12,
  cover: 0.09,
  'product-cover': 0.1,
  'section-divider': 0.12,
  content: 0.08,
  closing: 0.12,
};
/** The secondary copy is at most this share of the headline size (or of the short side when there is none). */
export const SECONDARY_OF_HEADLINE = 0.4;
export const SECONDARY_MAX_OF_SHORT = 0.035;
/** A content Page's body copy is the point of the Page: it is sized from the Page, not from the headline. */
export const CONTENT_SECONDARY_MAX_OF_SHORT = 0.04;
export const LABEL_MAX_OF_SHORT = 0.025;
export const TICKER_MAX_OF_SHORT = 0.03;
/** Where a text sits in its slot, per layout. Absent means top-left. */
const PLACEMENT: Partial<Record<PageLayoutId, Partial<Record<'headline' | 'label', { v?: 'top' | 'bottom'; align?: TextAlign }>>>> = {
  cover: { label: { v: 'bottom', align: 'right' } },
  'product-cover': { headline: { v: 'bottom' } },
};

/** A solid rectangle in Page pixels. */
export interface SceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hex colour, `#RRGGBB`. */
  fill: string;
}

/** The photo, filling its slot like `object-fit: cover`, centred. */
export interface ScenePhoto {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The image as the user imported it: a data URL. */
  href: string;
  /** The image's own size in px. */
  width: number;
  height: number;
  /** Share of the image cut off on each side, 0 to 1; one of the two pairs is always 0. */
  crop: { left: number; top: number; right: number; bottom: number };
}

/** A piece of a text line that takes its own colour: a Highlighted word, or the words around it. */
export interface SceneTextRun {
  text: string;
  fill: string;
}

/** One line of text, positioned for an editable export. */
export interface SceneTextLine {
  /** The line's characters, brackets removed, spaces at its ends trimmed. */
  text: string;
  /** The line cut into colour runs: one run unless the line holds Highlighted words. Their texts join to `text`. */
  runs: SceneTextRun[];
  /** Where the line's first pen position is, in Page px from the left. */
  x: number;
  /** The baseline, in Page px from the top. */
  baselineY: number;
  /** Font size in px. */
  fontSize: number;
  /** The face the line was measured in. */
  face: FaceId;
  /** The colour of the line (of its runs outside any Highlight). */
  fill: string;
  /** The measured advance width of the line in px. */
  width: number;
  /** How the text is aligned in its slot; an editable export anchors the text box on this side. */
  align: TextAlign;
}

/** The glyph outlines of (part of) a text as one path: what the SVG draws. */
export interface SceneOutline {
  role: string;
  d: string;
  fill: string;
}

export type SceneTextRole = 'headline' | 'secondary' | 'label' | 'ticker-left' | 'ticker-right';

export interface SceneText {
  role: SceneTextRole;
  lines: SceneTextLine[];
  /** Empty when the scene was composed with `outlines: false`. */
  outlines: SceneOutline[];
}

export interface SceneLogo {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface ComposedScene {
  /** Page size in px. */
  width: number;
  height: number;
  /** The Colourway background, drawn over the whole Page; absent when the Document's background is transparent. */
  background?: string;
  /** The Pattern's Blocks in paint order. */
  blocks: SceneRect[];
  photo?: ScenePhoto;
  /** Highlight boxes, drawn after the photo and before any text. */
  highlights: SceneRect[];
  /** Wicks of the Highlights, drawn after the boxes. */
  wicks: SceneRect[];
  /** Headline, secondary copy and label, in paint order. */
  texts: SceneText[];
  ticker?: { strip: SceneRect; texts: SceneText[] };
  logo?: SceneLogo;
}

export interface ComposeOptions {
  /** Compute the glyph outlines (`SceneText.outlines`). Default true; an editable export does not need them. */
  outlines?: boolean;
}

const rectOf = (x: number, y: number, w: number, h: number, fill: string): SceneRect => ({ x, y, w, h, fill });

/** Mono text falls back to Trek Regular when Plex Mono lacks a character (Thai) or is not loaded. */
function monoFace(shaper: Shaper, text: string): FaceId | null {
  if (shaper.has('plex-mono')) {
    const run = shaper.shape('plex-mono', text.replace(/[[\]\n\r]/g, ''), 10);
    if (run.missingGlyphs === 0) return 'plex-mono';
  }
  return shaper.has('trek-regular') ? 'trek-regular' : null;
}

/**
 * How far glyphs reach beyond the cap-top-to-baseline band, in em, measured on the brand faces: Thai tone marks
 * and upper vowels rise about 0.37 em above the cap height and lower vowels and tails hang about 0.28 em below
 * the baseline; Latin has descenders (about 0.22 em) and brackets and parentheses that rise about 0.06 em above the cap height.
 */
const THAI = /[\u0E00-\u0E7F]/;
const reachEm = (text: string): { top: number; bottom: number } =>
  THAI.test(text) ? { top: 0.38, bottom: 0.28 } : { top: 0.08, bottom: 0.22 };

interface Fitted {
  layout: TextLayout;
  /** px the text (with its Highlights and glyph reach) extends above its cap top, below its last baseline, and left of its pen start. */
  top: number;
  bottom: number;
  left: number;
}

/**
 * Lay `markup` out in `slot` at the largest whole-px size, up to `maxSize`, where it fits with everything it
 * reaches: the glyphs' own reach (`reachEm`) and, for a headline, its Highlights (boxes 2u and Wicks 4u beyond
 * the text, 1.5u at the sides). `fitText` measures cap top to last baseline only, which would let marks run into
 * the copy above or below and Highlights run off the Page. A text too long for the slot is scaled down until it
 * fits (down to 1 px), so nothing ever leaves the slot, and so never the Page.
 */
function fitInSlot(
  shaper: Shaper,
  markup: string,
  face: FaceId,
  leading: number,
  slot: PxRect,
  maxSize: number,
  align: TextAlign,
  highlights = false
): Fitted {
  const prepared = prepareText(shaper, markup, face);
  const reach = reachEm(prepared.text);
  const hasRuns = highlights && prepared.runs.length > 0;
  let fitted: Fitted | undefined;
  for (let size = Math.max(1, Math.floor(maxSize)); size >= 1; size--) {
    const unit = (prepared.tittle * size) / prepared.upem;
    const width = slot.w - (hasRuns ? 1.5 * unit : 0);
    const layout = layoutPrepared(shaper, prepared, { size, leading, width, align });
    let top = reach.top * size;
    let bottom = reach.bottom * size;
    let left = 0;
    for (const h of highlights ? layout.highlights : []) {
      top = Math.max(top, -h.box.y, h.wickTopRight ? -h.wickTopRight.y : 0);
      bottom = Math.max(bottom, h.box.y + h.box.height - layout.height, h.wickBottomLeft ? h.wickBottomLeft.y + h.wickBottomLeft.height - layout.height : 0);
      left = Math.max(left, -h.box.x);
    }
    fitted = { layout, top, bottom, left };
    if (!layout.overflowX && layout.height + top + bottom <= slot.h + 1e-6) break;
  }
  return fitted!;
}

/** Where a fitted text's origin (its first cap top, at the pen start) goes in its slot. */
function originOf(f: Fitted, slot: PxRect, v: 'top' | 'bottom'): { x: number; y: number } {
  return {
    x: slot.x + Math.max(0, f.left - slot.x),
    y: v === 'bottom' ? slot.y + slot.h - f.bottom - f.layout.height : slot.y + f.top,
  };
}


/** Lines of a laid-out text as scene lines, with `origin` the layout's cap-top origin in Page px. */
function sceneLines(
  layout: TextLayout,
  origin: { x: number; y: number },
  fill: string,
  align: TextAlign,
  runsOf?: (line: LayoutLine) => SceneTextRun[]
): SceneTextLine[] {
  return layout.lines
    .filter((line) => line.text !== '')
    .map((line) => ({
      text: line.text,
      runs: runsOf ? runsOf(line) : [{ text: line.text, fill }],
      x: origin.x + line.x,
      baselineY: origin.y + line.baseline,
      fontSize: layout.size,
      face: layout.face,
      fill,
      width: line.width,
      align,
    }));
}

/**
 * The composed scene of a Page: every shape, photo, text line, Ticker and the wordmark, in Page pixels, with the
 * colour of each. Works for any layout; a 'pattern' Page has only its background and Blocks.
 */
export function composeScene(doc: Document, pageIndex: number, shaper: Shaper, options: ComposeOptions = {}): ComposedScene {
  const withOutlines = options.outlines !== false;
  const page: Page = doc.pages[pageIndex] ?? { pattern: [] };
  const layoutId = page.layout ?? 'pattern';
  const content = page.content ?? {};
  const grid = gridFor(doc);
  const colourway = getColourway(doc.colourway) ?? getColourway(DEFAULT_COLOURWAY_ID)!;
  const { widthPx: width, heightPx: height } = getFormatDimensions(doc);
  const short = Math.min(width, height);
  const { slots } = layoutSlots(doc, pageIndex);
  const placement = PLACEMENT[layoutId] ?? {};

  // 1. Background and Blocks.
  const blocks: SceneRect[] = [];
  for (const block of page.pattern) {
    const count = colourway.tints.length;
    const tint = count > 0 ? ((block.tint % count) + count) % count : 0;
    const fill = colourway.tints[tint] ?? colourway.tints[0] ?? colourway.background;
    blocks.push(rectOf(block.col * grid.cellW, block.row * grid.cellH, block.w * grid.cellW, block.h * grid.cellH, fill));
  }

  // 2. Photo, solid, cropped to its slot like object-fit: cover.
  let photo: ScenePhoto | undefined;
  const photoSlot = slots.photo;
  if (content.photo && photoSlot) {
    const { x, y, w, h } = photoSlot.px;
    const { width: iw, height: ih } = content.photo;
    const crop = { left: 0, top: 0, right: 0, bottom: 0 };
    if (iw > 0 && ih > 0 && w > 0 && h > 0) {
      const scale = Math.max(w / iw, h / ih);
      const shareX = Math.min(1, w / scale / iw);
      const shareY = Math.min(1, h / scale / ih);
      crop.left = crop.right = (1 - shareX) / 2;
      crop.top = crop.bottom = (1 - shareY) / 2;
    }
    photo = { x, y, w, h, href: content.photo.src, width: iw, height: ih, crop };
  }

  // Headline, with its Highlights.
  const texts: SceneText[] = [];
  const highlights: SceneRect[] = [];
  const wicks: SceneRect[] = [];
  const headlineSlot = slots.headline;
  const headlineMarkup = content.headline?.trim() ?? '';
  let headlineSize: number | undefined;
  if (headlineMarkup && headlineSlot && layoutId !== 'pattern' && shaper.has(TYPE_STYLES.headline.face)) {
    const slot = headlineSlot.px;
    const align = placement.headline?.align ?? 'left';
    const style = TYPE_STYLES.headline;
    const fitted = fitInSlot(shaper, headlineMarkup, style.face, style.leading, slot, short * HEADLINE_MAX_OF_SHORT[layoutId], align, true);
    const layout = fitted.layout;
    headlineSize = layout.size;
    const { x, y } = originOf(fitted, slot, placement.headline?.v ?? 'top');

    const colour = textColourFor(doc, pageIndex, headlineSlot.cells);
    const under = fillUnderSlot(doc, pageIndex, headlineSlot.cells);
    // Tint when the headline sits on the background, the background colour when it sits on a flat Block.
    const highlightFill = under.onBlock ? colourway.background : (colourway.tints[0] ?? colourway.background);
    const highlightColour = textColourOnFill(highlightFill);

    for (const s of layout.highlights) {
      highlights.push(rectOf(x + s.box.x, y + s.box.y, s.box.width, s.box.height, highlightFill));
      for (const wick of [s.wickBottomLeft, s.wickTopRight]) {
        if (wick) wicks.push(rectOf(x + wick.x, y + wick.y, wick.width, wick.height, highlightFill));
      }
    }

    // Highlighted words take the colour that reads on the Highlight fill; the rest take the slot's colour.
    const { runs } = parseMarkup(headlineMarkup);
    const inRun = (offset: number): boolean => runs.some((r) => offset >= r.start && offset < r.end);
    const split = (keep: boolean): TextLayout => ({
      ...layout,
      lines: layout.lines.map((line) => ({ ...line, glyphs: line.glyphs.filter((g) => inRun(g.cluster) === keep) })),
    });
    const outlines: SceneOutline[] = [];
    if (withOutlines) {
      outlines.push({ role: 'headline', d: layoutOutline(shaper, split(false), x, y), fill: colour });
      if (runs.length > 0) outlines.push({ role: 'headline-highlight', d: layoutOutline(shaper, split(true), x, y), fill: highlightColour });
    }
    // The same colour split, per line, for an editable export.
    const runsOf = (line: LayoutLine): SceneTextRun[] => {
      const pieces: SceneTextRun[] = [];
      for (let o = line.start; o < line.end; o++) {
        const fill = inRun(o) ? highlightColour : colour;
        const char = layout.text[o]!;
        const last = pieces[pieces.length - 1];
        if (last && last.fill === fill) last.text += char;
        else pieces.push({ text: char, fill });
      }
      return pieces;
    };
    texts.push({ role: 'headline', lines: sceneLines(layout, { x, y }, colour, align, runsOf), outlines });
  }

  // Secondary copy and label.
  const secondary = content.secondary?.trim();
  if (secondary && slots.secondary && shaper.has(TYPE_STYLES.secondary.face)) {
    texts.push(
      fitSlotText(doc, pageIndex, shaper, 'secondary', secondary, TYPE_STYLES.secondary.face, slots.secondary, withOutlines, {
        maxSize:
          layoutId === 'content'
            ? short * CONTENT_SECONDARY_MAX_OF_SHORT
            : headlineSize
              ? Math.round(headlineSize * SECONDARY_OF_HEADLINE)
              : short * SECONDARY_MAX_OF_SHORT,
        leading: TYPE_STYLES.secondary.leading,
      })
    );
  }
  const label = content.label?.trim();
  const labelFace = label ? monoFace(shaper, label) : null;
  if (label && slots.label && labelFace) {
    texts.push(
      fitSlotText(doc, pageIndex, shaper, 'label', label, labelFace, slots.label, withOutlines, {
        maxSize: short * LABEL_MAX_OF_SHORT,
        leading: TYPE_STYLES.mono.leading,
        align: placement.label?.align,
        bottom: placement.label?.v === 'bottom',
      })
    );
  }

  // 5. Ticker.
  let ticker: ComposedScene['ticker'];
  const tickerContent = content.ticker;
  // The strip is one line: no markup, and newlines and runs of spaces become one space.
  const oneLine = (t: string | undefined): string => parseMarkup(t ?? '').text.replace(/\s+/g, ' ').trim();
  const left = oneLine(tickerContent?.left);
  const right = oneLine(tickerContent?.right);
  if (tickerContent?.show && slots.ticker && (left || right)) {
    const faceOf = monoFace(shaper, `${left}${right}`);
    if (faceOf) {
      const navyBackground = colourway.background.toUpperCase() === TEXT_NAVY.toUpperCase();
      const stripFill = navyBackground ? TEXT_WHITE : TEXT_NAVY;
      const textFill = navyBackground ? TEXT_NAVY : TEXT_WHITE;
      const slot = slots.ticker.px;
      const m = shaper.metrics(faceOf);
      const capRatio = m.capHeight / m.upem;
      const pad = headlineSlot?.px.x ?? short * 0.05;
      let size = Math.floor(Math.min(slot.h / (TICKER_HEIGHT_OF_CAP * capRatio), short * TICKER_MAX_OF_SHORT));
      const need = (s: number): number =>
        (left ? shaper.shape(faceOf, left, s).width : 0) + (right ? shaper.shape(faceOf, right, s).width : 0) + (left && right ? 2 * s : 0);
      while (size > 1 && need(size) > width - 2 * pad) size--;
      const cap = capRatio * size;
      const stripH = TICKER_HEIGHT_OF_CAP * cap;
      const stripY = slot.y + (slot.h - stripH) / 2;
      const style = { face: faceOf, size, leading: TYPE_STYLES.mono.leading, width: Infinity } as const;
      // The layout's origin is the cap top: centre the cap height in the strip.
      const textY = stripY + (stripH - cap) / 2;
      const tickerTexts: SceneText[] = [];
      if (left) {
        const l = layoutText(shaper, left, style);
        const origin = { x: pad, y: textY };
        tickerTexts.push({
          role: 'ticker-left',
          lines: sceneLines(l, origin, textFill, 'left'),
          outlines: withOutlines ? [{ role: 'ticker-left', d: layoutOutline(shaper, l, origin.x, origin.y), fill: textFill }] : [],
        });
      }
      if (right) {
        const l = layoutText(shaper, right, style);
        const origin = { x: width - pad - l.width, y: textY };
        tickerTexts.push({
          role: 'ticker-right',
          lines: sceneLines(l, origin, textFill, 'right'),
          outlines: withOutlines ? [{ role: 'ticker-right', d: layoutOutline(shaper, l, origin.x, origin.y), fill: textFill }] : [],
        });
      }
      ticker = { strip: rectOf(0, stripY, width, stripH, stripFill), texts: tickerTexts };
    }
  }

  // 6. Wordmark.
  let logo: SceneLogo | undefined;
  const logoAt = logoPlacement(doc, pageIndex);
  if (logoAt && content.logo?.show !== false) {
    const { box } = logoAt;
    logo = { x: box.x, y: box.y, w: box.w, h: box.h, fill: textColourFor(doc, pageIndex, logoAt.cells) };
  }

  const scene: ComposedScene = { width, height, blocks, highlights, wicks, texts };
  if (!doc.transparentBackground) scene.background = colourway.background;
  if (photo) scene.photo = photo;
  if (ticker) scene.ticker = ticker;
  if (logo) scene.logo = logo;
  return scene;
}

/** Fit plain copy into its slot, colour it by what sits under the slot, and return it as a scene text. */
function fitSlotText(
  doc: Document,
  pageIndex: number,
  shaper: Shaper,
  role: 'secondary' | 'label',
  markup: string,
  face: FaceId,
  slot: LayoutSlot,
  withOutlines: boolean,
  opts: { maxSize: number; leading: number; align?: TextAlign | undefined; bottom?: boolean }
): SceneText {
  const align = opts.align ?? 'left';
  const fitted = fitInSlot(shaper, markup, face, opts.leading, slot.px, opts.maxSize, align);
  const origin = originOf(fitted, slot.px, opts.bottom ? 'bottom' : 'top');
  const fill = textColourFor(doc, pageIndex, slot.cells);
  return {
    role,
    lines: sceneLines(fitted.layout, origin, fill, align),
    outlines: withOutlines ? [{ role, d: layoutOutline(shaper, fitted.layout, origin.x, origin.y), fill }] : [],
  };
}
