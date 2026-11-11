import { getFormatDimensions } from './formats.js';
import { gridFor } from './grid.js';
import { articleCoverEdge, cellsCovering, fadeDirectionOf, layoutSlotsFor, logoBox, type CellRect, type LogoAnchor, type PxRect } from './layouts.js';
import { LOGO_I_HEIGHT, LOGO_VIEWBOX } from './logo.js';
import { uniformFillUnder } from './textColour.js';
import type { Document } from './types.js';

export interface LogoPlacement {
  /** The corner the wordmark is drawn in. */
  corner: LogoAnchor;
  /** The layout's own corner (the first one tried). */
  defaultCorner: LogoAnchor;
  /** Whether `corner` differs from the layout's default. */
  moved: boolean;
  /** Whether the wordmark plus its clear space lies on one fill and overlaps no slot. */
  clean: boolean;
  /**
   * Whether the wordmark itself lies on one fill (a Block edge may still run through its clear space). False only
   * on the last-resort fallback to the default corner, when no corner has a wordmark on one fill clear of the slots.
   */
  onOneFill: boolean;
  /** The wordmark's exact rectangle in Format pixels. */
  box: PxRect;
  /** The whole cells the wordmark touches (what its colour is read from). */
  cells: CellRect;
}

/** Tried after the layout's default corner: the other bottom corner, then the top corners. */
const FALLBACK_ORDER: readonly LogoAnchor[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];

const overlaps = (a: PxRect, b: PxRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where the wordmark goes on a Page: the layout's default corner when the wordmark plus its clear space (one
 * "i" height all round, guideline 2.x) lies on one fill and overlaps no slot, else the first corner that does
 * (the other bottom corner, then top-left, then top-right). When no corner has a Block-free clear space, the first
 * corner whose wordmark alone lies on one fill and whose clear space overlaps no slot; if none does, the default
 * corner. Deterministic: it reads only the Pattern's Blocks and the layout table. `undefined` for the 'pattern' layout, which has no logo.
 */
export function logoPlacement(doc: Document, pageIndex = 0): LogoPlacement | undefined {
  const page = doc.pages[pageIndex];
  const layout = page?.layout ?? 'pattern';
  const direction = fadeDirectionOf(page);
  const { slots } = layoutSlotsFor(doc, layout, direction);
  if (!slots.logo) return undefined;
  const { widthPx, heightPx } = getFormatDimensions(doc);
  const grid = gridFor(doc);
  const defaultCorner = slots.logo.anchor;
  const others: PxRect[] = Object.entries(slots)
    .filter(([name]) => name !== 'logo' && !(layout === 'article-cover' && name === 'photo'))
    .map(([, slot]) => slot!.px);
  if (layout === 'article-cover' && slots.photo) {
    // An Article cover's photo is a backdrop the logo may sit on. Only the part of it the fade has left visible keeps
    // the logo off when the photo runs along x (Left, and Full from col 16). Bottom's photo is the whole top of the Page:
    // there the photo is cut away under the wordmark plus its clear space (`logoNotch`, #81), so the wordmark sits on
    // the background in whichever corner is picked here.
    const edge = articleCoverEdge(doc, direction);
    if (edge.axis === 'x') others.push({ x: edge.start * grid.cellW, y: slots.photo.px.y, w: edge.room * grid.cellW, h: slots.photo.px.h });
  }

  const attempt = (corner: LogoAnchor): LogoPlacement => {
    const box = logoBox(widthPx, heightPx, corner);
    return { corner, defaultCorner, moved: corner !== defaultCorner, clean: false, onOneFill: false, box, cells: cellsCovering(box, grid) };
  };
  const order = [defaultCorner, ...FALLBACK_ORDER.filter((c) => c !== defaultCorner)];
  const candidates = order.map((corner) => {
    const placement = attempt(corner);
    const padded = withClearSpace(placement.box);
    const freeOfSlots = !others.some((o) => overlaps(padded, o));
    const onOneFill = uniformFillUnder(doc, pageIndex, placement.box) !== null;
    const clean = freeOfSlots && uniformFillUnder(doc, pageIndex, padded) !== null;
    return { ...placement, clean, onOneFill, freeOfSlots };
  });
  const pick = candidates.find((c) => c.clean) ?? candidates.find((c) => c.freeOfSlots && c.onOneFill);
  const { freeOfSlots: _free, ...chosen } = pick ?? candidates[0]!;
  return chosen;
}

/** The wordmark's box plus its clear space: one "i" height of the wordmark all round (guideline 2.x). */
export function withClearSpace(box: PxRect): PxRect {
  const clear = (LOGO_I_HEIGHT / LOGO_VIEWBOX.height) * box.h;
  return { x: box.x - clear, y: box.y - clear, w: box.w + 2 * clear, h: box.h + 2 * clear };
}

/**
 * The logo notch (#81): on an Article cover with the Bottom Fade direction, the cells cut out of the photo under the
 * wordmark plus its clear space, rounded out to whole Grid cells, so the wordmark sits on the background. It follows
 * the wordmark to whichever corner `logoPlacement` picks, and is only the part of those cells the photo slot holds.
 * Undefined on Left and Full (their wordmark is kept off the visible photo), with no photo or the logo hidden, and
 * when the wordmark's cells miss the photo (a bottom corner).
 */
export function logoNotch(doc: Document, pageIndex = 0): CellRect | undefined {
  const page = doc.pages[pageIndex];
  if (page?.layout !== 'article-cover' || !page.content?.photo || page.content.logo?.show === false) return undefined;
  const direction = fadeDirectionOf(page);
  if (direction !== 'bottom') return undefined;
  const photo = layoutSlotsFor(doc, 'article-cover', direction).slots.photo?.cells;
  const placement = logoPlacement(doc, pageIndex);
  if (!photo || !placement) return undefined;
  const cells = cellsCovering(withClearSpace(placement.box), gridFor(doc));
  const col = Math.max(cells.col, photo.col);
  const row = Math.max(cells.row, photo.row);
  const w = Math.min(cells.col + cells.w, photo.col + photo.w) - col;
  const h = Math.min(cells.row + cells.h, photo.row + photo.h) - row;
  return w > 0 && h > 0 ? { col, row, w, h } : undefined;
}
