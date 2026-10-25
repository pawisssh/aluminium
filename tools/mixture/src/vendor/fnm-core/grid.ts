import { densityLevelsFor } from './formats.js';
import type { Document, Grid } from './types.js';

/**
 * Calculates the Grid for a given Document.
 * Looks up the format and density level in the tables (or calculates for custom).
 * If the exact density level is not found, falls back to the format's CI standard grid.
 * cellPx is provided only if width/cols == height/rows exactly; otherwise cellW and cellH are used.
 */
export function gridFor(doc: Document): Grid {
  const levels = densityLevelsFor(doc.format, doc.customSize);
  const matched = levels.find((lvl) => lvl.level === doc.density);
  const target = matched ?? levels.find((lvl) => lvl.isCiStandard) ?? levels[0];

  if (target) {
    return {
      cols: target.cols,
      rows: target.rows,
      cellW: target.cellW,
      cellH: target.cellH,
      ...(target.cellPx !== undefined ? { cellPx: target.cellPx } : {}),
    };
  }

  return { cols: 16, rows: 16, cellW: 120, cellH: 120, cellPx: 120 };
}
