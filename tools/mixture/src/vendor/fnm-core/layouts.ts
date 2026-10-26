import { getFormatDimensions } from './formats.js';
import { gridFor } from './grid.js';
import { CLEAR_ZONE_RING_DEPTH } from './textZone.js';
import type { Document, Grid, PageLayoutId, TextZone, TextZoneMode } from './types.js';

/**
 * Page layouts as data (GLOSSARY: Page layout; the Figma guideline 6.3 "four ways to lay out", 6.6 Ticker and
 * 11.14 deck cover). For each layout and orientation the table gives the slot rectangles and the Text zone as
 * fractions of the Page. `layoutSlots` snaps them to the Grid, so one table serves every Format and Density.
 * There is no rendering here.
 */

export type Orientation = 'portrait' | 'landscape' | 'square';

/**
 * The things a layout can hold. The product cover's name is its `headline` slot; a section divider's number is
 * its `label` slot.
 */
export type SlotName = 'headline' | 'secondary' | 'label' | 'ticker' | 'photo' | 'logo';

/** A rectangle as fractions of the Page (0 to 1, y from the top). */
export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A slot snapped to the Grid: whole cells, and the same rectangle in Format pixels. */
export interface LayoutSlot {
  cells: CellRect;
  px: PxRect;
}

/** The corner the wordmark sits in. Layouts name a bottom corner; `logoPlacement` may move it to another. */
export type LogoAnchor = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface LogoSlot extends LayoutSlot {
  anchor: LogoAnchor;
  /** Where the wordmark itself sits, in Format pixels, inside the slot's cells (see LOGO_*). */
  box: PxRect;
}

export interface LayoutSlots {
  layout: PageLayoutId;
  orientation: Orientation;
  /**
   * Every slot the layout has. A slot with no free cell left on a very coarse Grid (for example the
   * secondary copy on a 4x4 Grid) is left out; the headline and the logo are never left out.
   */
  slots: Partial<Record<Exclude<SlotName, 'logo'>, LayoutSlot>> & { logo?: LogoSlot };
  /** The layout's Text zone in cells, inside the Grid and at least 1x1. Absent for 'pattern'. */
  textZone?: TextZone;
}

type FlatSlotName = Exclude<SlotName, 'logo'>;

interface OrientationSpec {
  zone: { rect: FracRect; mode: TextZoneMode };
  slots: Partial<Record<FlatSlotName, FracRect>>;
  logo: LogoAnchor;
}

type LayoutSpec = Record<Orientation, OrientationSpec>;

const r = (x: number, y: number, w: number, h: number): FracRect => ({ x, y, w, h });

/** Wordmark proportions (PROVISIONAL: the guideline gives placement but no size; see the Phase 3 spec). */
export const LOGO_WIDTH_OF_SHORT_SIDE = 0.2;
/** Wordmark height / width. */
export const LOGO_ASPECT = 126 / 840;
/** Distance of the wordmark from the Page edge, as a share of the short side; at least its own height. */
export const LOGO_MARGIN_OF_SHORT_SIDE = 0.05;
/** Guideline 2.x: the wordmark is never smaller than 10 px high. */
export const LOGO_MIN_HEIGHT_PX = 10;

const HEADLINE_UPRIGHT: OrientationSpec = {
  zone: { rect: r(0, 0, 1, 0.44), mode: 'clear' },
  slots: {
    headline: r(0.06, 0.06, 0.88, 0.19),
    secondary: r(0.06, 0.27, 0.88, 0.08),
    ticker: r(0, 0.37, 1, 0.06),
  },
  logo: 'bottom-left',
};

const COVER_UPRIGHT: OrientationSpec = {
  zone: { rect: r(0.4, 0, 0.6, 0.45), mode: 'flat' },
  slots: {
    headline: r(0.46, 0.06, 0.48, 0.25),
    secondary: r(0.46, 0.32, 0.48, 0.07),
    label: r(0.52, 0.4, 0.42, 0.04),
  },
  logo: 'bottom-left',
};

// 6.3 #03 puts the mono code label top-left. Deliberate deviation: it is a mono line just above the name, inside
// the clear zone, so no Block edge can cross it (a clear zone lets Blocks nibble its outer ring; the slots below
// keep to the zone minus that ring).
const PRODUCT_UPRIGHT: OrientationSpec = {
  zone: { rect: r(0, 0.64, 0.7, 0.36), mode: 'clear' },
  slots: {
    label: r(0.06, 0.7, 0.62, 0.05),
    photo: r(0.4, 0.1, 0.54, 0.52),
    headline: r(0.06, 0.76, 0.62, 0.19),
  },
  logo: 'bottom-right',
};

// Deck layouts (Phase 5). The Pattern keeps at least one free row or column beside each zone.

/** Large headline left, clear column on the left; the section number is the mono `label` slot. */
const SECTION_UPRIGHT: OrientationSpec = {
  zone: { rect: r(0, 0, 0.6, 1), mode: 'clear' },
  slots: {
    label: r(0.06, 0.06, 0.4, 0.05),
    headline: r(0.06, 0.16, 0.5, 0.62),
  },
  logo: 'bottom-left',
};

/** Text on top, the Pattern a low accent along the bottom edge. */
const CONTENT_UPRIGHT: OrientationSpec = {
  zone: { rect: r(0, 0, 1, 0.8), mode: 'clear' },
  slots: {
    label: r(0.06, 0.05, 0.5, 0.04),
    headline: r(0.06, 0.11, 0.88, 0.15),
    secondary: r(0.06, 0.29, 0.88, 0.45),
  },
  logo: 'bottom-left',
};

/** Large headline top-left, the Ticker (carrying the URL) closing the clear zone, the Pattern below. */
const CLOSING_UPRIGHT: OrientationSpec = {
  zone: { rect: r(0, 0, 1, 0.5), mode: 'clear' },
  slots: {
    headline: r(0.06, 0.08, 0.88, 0.26),
    secondary: r(0.06, 0.36, 0.88, 0.06),
    ticker: r(0, 0.43, 1, 0.07),
  },
  logo: 'bottom-left',
};

/** The layout table. Add a layout by adding an entry here (and its id to PageLayoutId). */
export const LAYOUT_TABLE: Record<Exclude<PageLayoutId, 'pattern'>, LayoutSpec> = {
  // 6.3 #01/#02: headline top-left, clear above, optional Ticker closing the zone, the Pattern rises below.
  headline: {
    portrait: HEADLINE_UPRIGHT,
    square: HEADLINE_UPRIGHT,
    landscape: {
      zone: { rect: r(0, 0, 1, 0.46), mode: 'clear' },
      slots: {
        headline: r(0.05, 0.07, 0.7, 0.21),
        secondary: r(0.05, 0.3, 0.7, 0.07),
        ticker: r(0, 0.39, 1, 0.07),
      },
      logo: 'bottom-left',
    },
  },
  // 6.3 #04, 11.14: headline on a flat Block area top-right, a small mono label bottom-right. Deliberate deviation
  // from 11.14 ("date bottom-right of the Page"): the label sits bottom-right of the flat zone, under the secondary
  // copy and right-aligned to the headline column, so no Block edge can cross it.
  cover: {
    portrait: COVER_UPRIGHT,
    square: COVER_UPRIGHT,
    landscape: {
      zone: { rect: r(0.38, 0, 0.62, 0.46), mode: 'flat' },
      slots: {
        headline: r(0.43, 0.06, 0.51, 0.22),
        secondary: r(0.43, 0.3, 0.51, 0.08),
        label: r(0.62, 0.395, 0.32, 0.055),
      },
      logo: 'bottom-left',
    },
  },
  // 6.3 #03, 7.3: the name large bottom-left with its mono code label just above it, a photo upper right.
  'product-cover': {
    portrait: PRODUCT_UPRIGHT,
    square: PRODUCT_UPRIGHT,
    landscape: {
      zone: { rect: r(0, 0.4, 0.55, 0.6), mode: 'clear' },
      slots: {
        label: r(0.05, 0.46, 0.46, 0.06),
        photo: r(0.58, 0.06, 0.36, 0.68),
        headline: r(0.05, 0.53, 0.46, 0.38),
      },
      logo: 'bottom-right',
    },
  },
  // Deck: a large headline and an optional mono section number; clear on the left, the Pattern fills the rest.
  'section-divider': {
    portrait: SECTION_UPRIGHT,
    square: SECTION_UPRIGHT,
    landscape: {
      zone: { rect: r(0, 0, 0.55, 1), mode: 'clear' },
      slots: {
        label: r(0.05, 0.08, 0.4, 0.06),
        headline: r(0.05, 0.18, 0.45, 0.6),
      },
      logo: 'bottom-left',
    },
  },
  // Deck: headline, multi-paragraph secondary copy and an optional label. The Pattern is a small accent along
  // one edge (the bottom, or the right on a landscape Page).
  content: {
    portrait: CONTENT_UPRIGHT,
    square: CONTENT_UPRIGHT,
    landscape: {
      zone: { rect: r(0, 0, 0.82, 1), mode: 'clear' },
      slots: {
        label: r(0.05, 0.07, 0.5, 0.05),
        headline: r(0.05, 0.14, 0.72, 0.2),
        secondary: r(0.05, 0.38, 0.72, 0.45),
      },
      logo: 'bottom-left',
    },
  },
  // Deck: a large headline with the Ticker (the URL) closing the clear zone at the top.
  closing: {
    portrait: CLOSING_UPRIGHT,
    square: CLOSING_UPRIGHT,
    landscape: {
      zone: { rect: r(0, 0, 1, 0.55), mode: 'clear' },
      slots: {
        headline: r(0.05, 0.08, 0.8, 0.3),
        secondary: r(0.05, 0.4, 0.8, 0.06),
        ticker: r(0, 0.47, 1, 0.08),
      },
      logo: 'bottom-left',
    },
  },
};

/** A Page is square when its pixel aspect is within 10% of 1:1. */
export function orientationFor(widthPx: number, heightPx: number): Orientation {
  if (Math.max(widthPx, heightPx) * 10 <= Math.min(widthPx, heightPx) * 11) return 'square';
  return widthPx > heightPx ? 'landscape' : 'portrait';
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Rounds a fractional span onto `n` cells, keeping it inside [lo, hi) and at least one cell. */
function snapSpan(f0: number, f1: number, n: number, lo: number, hi: number): [number, number] {
  const a = clamp(Math.round(f0 * n), lo, hi - 1);
  const b = clamp(Math.round(f1 * n), a + 1, hi);
  return [a, b];
}

function snapRect(f: FracRect, grid: Grid, within?: CellRect): CellRect {
  const c0 = within?.col ?? 0;
  const r0 = within?.row ?? 0;
  const [a, b] = snapSpan(f.x, f.x + f.w, grid.cols, c0, within ? c0 + within.w : grid.cols);
  const [c, d] = snapSpan(f.y, f.y + f.h, grid.rows, r0, within ? r0 + within.h : grid.rows);
  return { col: a, row: c, w: b - a, h: d - c };
}

const overlaps = (a: CellRect, b: CellRect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/** The largest piece of `a` left after removing `fixed`, or null when nothing of at least 1x1 is left. */
function cutAround(a: CellRect, fixed: CellRect): CellRect | null {
  const pieces: CellRect[] = [];
  if (fixed.col > a.col) pieces.push({ ...a, w: fixed.col - a.col });
  const fr = fixed.col + fixed.w;
  if (fr < a.col + a.w) pieces.push({ ...a, col: fr, w: a.col + a.w - fr });
  if (fixed.row > a.row) pieces.push({ ...a, h: fixed.row - a.row });
  const fb = fixed.row + fixed.h;
  if (fb < a.row + a.h) pieces.push({ ...a, row: fb, h: a.row + a.h - fb });
  return pieces.sort((p, q) => q.w * q.h - p.w * p.h)[0] ?? null;
}

const toPx = (c: CellRect, grid: Grid): PxRect => ({
  x: c.col * grid.cellW,
  y: c.row * grid.cellH,
  w: c.w * grid.cellW,
  h: c.h * grid.cellH,
});

/** The wordmark's exact rectangle in Format pixels (20% of the short side, never under 10 px high). */
export function logoBox(widthPx: number, heightPx: number, anchor: LogoAnchor): PxRect {
  const short = Math.min(widthPx, heightPx);
  const h = Math.max(LOGO_MIN_HEIGHT_PX, short * LOGO_WIDTH_OF_SHORT_SIDE * LOGO_ASPECT);
  const w = h / LOGO_ASPECT;
  const margin = Math.max(h, short * LOGO_MARGIN_OF_SHORT_SIDE);
  const x = anchor.endsWith('left') ? margin : widthPx - margin - w;
  const y = anchor.startsWith('top') ? margin : heightPx - margin - h;
  return { x: Math.max(0, x), y: Math.max(0, y), w, h };
}

/** The whole cells a pixel rectangle touches, inside the Grid and at least 1x1. */
export function cellsCovering(box: PxRect, grid: Grid): CellRect {
  const c0 = clamp(Math.floor(box.x / grid.cellW + EPS), 0, grid.cols - 1);
  const r0 = clamp(Math.floor(box.y / grid.cellH + EPS), 0, grid.rows - 1);
  const c1 = clamp(Math.ceil((box.x + box.w) / grid.cellW - EPS), c0 + 1, grid.cols);
  const r1 = clamp(Math.ceil((box.y + box.h) / grid.cellH - EPS), r0 + 1, grid.rows);
  return { col: c0, row: r0, w: c1 - c0, h: r1 - r0 };
}

/** Priority when two slots collide after snapping: the earlier one keeps its cells, the later one is cut. */
const PRIORITY: readonly SlotName[] = ['logo', 'headline', 'photo', 'ticker', 'secondary', 'label'];

const EPS = 1e-9;

/**
 * Slots and Text zone of `layout` on the Grid of `doc` (a Document's Format and Density, not a particular Page).
 * Everything is in whole cells inside the Grid. The Text zone is at least 1x1; every text slot lies inside it
 * where the table puts it there; no two slots overlap.
 */
export function layoutSlotsFor(doc: Document, layout: PageLayoutId): LayoutSlots {
  const { widthPx, heightPx } = getFormatDimensions(doc);
  const orientation = orientationFor(widthPx, heightPx);
  if (layout === 'pattern') return { layout, orientation, slots: {} };

  const grid = gridFor(doc);
  const spec = LAYOUT_TABLE[layout][orientation];
  const zoneCells = snapRect(spec.zone.rect, grid);
  const textZone: TextZone = { ...zoneCells, mode: spec.zone.mode };

  // A clear zone lets Blocks nibble its outer ring (textZone.ts), so text keeps to the zone inside that ring where
  // the zone is big enough. The Ticker is a strip with its own fill and may use the whole zone.
  const ring = spec.zone.mode === 'clear' ? CLEAR_ZONE_RING_DEPTH : 0;
  const inner: CellRect =
    zoneCells.w > 2 * ring && zoneCells.h > 2 * ring
      ? { col: zoneCells.col + ring, row: zoneCells.row + ring, w: zoneCells.w - 2 * ring, h: zoneCells.h - 2 * ring }
      : zoneCells;

  const candidates = new Map<SlotName, CellRect>();
  const inZone = (f: FracRect): boolean =>
    f.x >= spec.zone.rect.x - EPS &&
    f.y >= spec.zone.rect.y - EPS &&
    f.x + f.w <= spec.zone.rect.x + spec.zone.rect.w + EPS &&
    f.y + f.h <= spec.zone.rect.y + spec.zone.rect.h + EPS;
  for (const [name, f] of Object.entries(spec.slots) as [FlatSlotName, FracRect][]) {
    candidates.set(name, snapRect(f, grid, inZone(f) ? (name === 'ticker' ? zoneCells : inner) : undefined));
  }
  const box = logoBox(widthPx, heightPx, spec.logo);
  candidates.set('logo', cellsCovering(box, grid));

  const placed: [SlotName, CellRect][] = [];
  for (const name of PRIORITY) {
    let cells: CellRect | null = candidates.get(name) ?? null;
    if (!cells) continue;
    for (const [, other] of placed) {
      if (cells && overlaps(cells, other)) cells = cutAround(cells, other);
    }
    if (cells) placed.push([name, cells]);
  }

  const slots: LayoutSlots['slots'] = {};
  for (const [name, cells] of placed) {
    if (name === 'logo') slots.logo = { cells, px: toPx(cells, grid), anchor: spec.logo, box };
    else slots[name] = { cells, px: toPx(cells, grid) };
  }
  return { layout, orientation, slots, textZone };
}

/** The Text zone `layout` gives on the Grid of `doc`; undefined for 'pattern'. */
export function layoutTextZone(doc: Document, layout: PageLayoutId): TextZone | undefined {
  return layoutSlotsFor(doc, layout).textZone;
}

/** Slots and Text zone of a Page's layout, snapped to the Grid in cells and pixels. */
export function layoutSlots(doc: Document, pageIndex = 0): LayoutSlots {
  return layoutSlotsFor(doc, doc.pages[pageIndex]?.layout ?? 'pattern');
}
