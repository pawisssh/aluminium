import { getFormatDimensions } from './formats.js';
import { gridFor } from './grid.js';
import { cellsCovering, layoutSlotsFor, logoBox, type CellRect, type LogoAnchor, type PxRect } from './layouts.js';
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
  const layout = doc.pages[pageIndex]?.layout ?? 'pattern';
  const { slots } = layoutSlotsFor(doc, layout);
  if (!slots.logo) return undefined;
  const { widthPx, heightPx } = getFormatDimensions(doc);
  const grid = gridFor(doc);
  const defaultCorner = slots.logo.anchor;
  const others: PxRect[] = Object.entries(slots)
    .filter(([name]) => name !== 'logo')
    .map(([, slot]) => slot!.px);

  const attempt = (corner: LogoAnchor): LogoPlacement => {
    const box = logoBox(widthPx, heightPx, corner);
    return { corner, defaultCorner, moved: corner !== defaultCorner, clean: false, onOneFill: false, box, cells: cellsCovering(box, grid) };
  };
  const order = [defaultCorner, ...FALLBACK_ORDER.filter((c) => c !== defaultCorner)];
  const candidates = order.map((corner) => {
    const placement = attempt(corner);
    const clear = (LOGO_I_HEIGHT / LOGO_VIEWBOX.height) * placement.box.h;
    const padded: PxRect = {
      x: placement.box.x - clear,
      y: placement.box.y - clear,
      w: placement.box.w + 2 * clear,
      h: placement.box.h + 2 * clear,
    };
    const freeOfSlots = !others.some((o) => overlaps(padded, o));
    const onOneFill = uniformFillUnder(doc, pageIndex, placement.box) !== null;
    const clean = freeOfSlots && uniformFillUnder(doc, pageIndex, padded) !== null;
    return { ...placement, clean, onOneFill, freeOfSlots };
  });
  const pick = candidates.find((c) => c.clean) ?? candidates.find((c) => c.freeOfSlots && c.onOneFill);
  const { freeOfSlots: _free, ...chosen } = pick ?? candidates[0]!;
  return chosen;
}
