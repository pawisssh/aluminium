import { BRAND_COLOURS, textColourOnFill } from './colourway.js';
import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { gridFor } from './grid.js';
import type { Document } from './types.js';
import { cellsCovering, type CellRect, type PxRect } from './layouts.js';

export const TEXT_WHITE: string = BRAND_COLOURS.white[100];
export const TEXT_NAVY: string = BRAND_COLOURS.navy[100];

/**
 * The colour of text or the logo placed on a slot (given in cells): White or Navy, never anything else
 * (guideline 4.6). It follows what sits under the slot (`fillUnderSlot`): the Block that covers most of it (the topmost Block
 * where Blocks overlap), else the Colourway background, by the same light/dark rule as the Colourway text
 * colours. A flat Text zone's cover Block covers its whole slot, so the slot takes that Block's Tint.
 */
export function textColourFor(doc: Document, pageIndex: number, slot: CellRect): string {
  return textColourOnFill(fillUnderSlot(doc, pageIndex, slot).fill);
}

/**
 * What sits under a slot: the fill that covers most of it, and whether that is a Block (`onBlock`) or the
 * Colourway background. The Highlight fill uses `onBlock` (guideline 6.3: Tint on the background, the
 * background colour on a flat Block).
 */
export function fillUnderSlot(doc: Document, pageIndex: number, slot: CellRect): { fill: string; onBlock: boolean } {
  const colourway = getColourway(doc.colourway) ?? getColourway(DEFAULT_COLOURWAY_ID)!;
  const pattern = doc.pages[pageIndex]?.pattern ?? [];
  const grid = gridFor(doc);
  const col0 = Math.max(0, slot.col);
  const row0 = Math.max(0, slot.row);
  const col1 = Math.min(grid.cols, slot.col + slot.w);
  const row1 = Math.min(grid.rows, slot.row + slot.h);

  // Cells covered by each Block (the topmost wins), counted against the background.
  const covered = new Map<number, number>();
  let cells = 0;
  for (let c = col0; c < col1; c++) {
    for (let r = row0; r < row1; r++) {
      cells++;
      for (let i = pattern.length - 1; i >= 0; i--) {
        const b = pattern[i]!;
        if (c >= b.col && c < b.col + b.w && r >= b.row && r < b.row + b.h) {
          covered.set(i, (covered.get(i) ?? 0) + 1);
          break;
        }
      }
    }
  }

  let fill = colourway.background;
  let onBlock = false;
  let best = cells - [...covered.values()].reduce((sum, n) => sum + n, 0);
  for (const [i, n] of covered) {
    if (n > best) {
      best = n;
      const count = colourway.tints.length;
      const tint = count > 0 ? ((pattern[i]!.tint % count) + count) % count : 0;
      fill = colourway.tints[tint] ?? colourway.background;
      onBlock = true;
    }
  }
  return { fill, onBlock };
}

/**
 * The one fill under a pixel rectangle, or null when a Block edge crosses it. Fills are compared by colour, so
 * two neighbouring Blocks of the same Tint count as one. Parts of the rectangle outside the Page are ignored.
 */
export function uniformFillUnder(doc: Document, pageIndex: number, rect: PxRect): string | null {
  const colourway = getColourway(doc.colourway) ?? getColourway(DEFAULT_COLOURWAY_ID)!;
  const pattern = doc.pages[pageIndex]?.pattern ?? [];
  const grid = gridFor(doc);
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(grid.cols * grid.cellW, rect.x + rect.w);
  const y1 = Math.min(grid.rows * grid.cellH, rect.y + rect.h);
  if (x1 <= x0 || y1 <= y0) return colourway.background;
  const cells = cellsCovering({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, grid);
  const count = colourway.tints.length;
  let found: string | null = null;
  for (let c = cells.col; c < cells.col + cells.w; c++) {
    for (let r = cells.row; r < cells.row + cells.h; r++) {
      let fill = colourway.background;
      for (let i = pattern.length - 1; i >= 0; i--) {
        const b = pattern[i]!;
        if (c >= b.col && c < b.col + b.w && r >= b.row && r < b.row + b.h) {
          const tint = count > 0 ? ((b.tint % count) + count) % count : 0;
          fill = colourway.tints[tint] ?? colourway.background;
          break;
        }
      }
      if (found === null) found = fill;
      else if (found !== fill) return null;
    }
  }
  return found;
}
