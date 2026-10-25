import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { getFormatDimensions } from './formats.js';
import { gridFor } from './grid.js';
import type { Document } from './types.js';

/**
 * Renders a Document's Page into an SVG string.
 * Structure:
 * - <svg xmlns shape-rendering="crispEdges" viewBox="0 0 W H" width height>
 * - One background <rect> with fill of Colourway background
 * - One <rect> per Block in list order with solid fill="#HEX"
 * No opacity attributes anywhere.
 */
export function renderSvg(doc: Document, pageIndex = 0): string {
  const page = doc.pages[pageIndex] ?? { pattern: [] };
  const grid = gridFor(doc);
  const colourway = getColourway(doc.colourway) ?? getColourway(DEFAULT_COLOURWAY_ID)!;
  const { widthPx: width, heightPx: height } = getFormatDimensions(doc);

  const rects: string[] = [];
  // Background rect
  rects.push(`<rect width="${width}" height="${height}" fill="${colourway.background}"/>`);

  // Block rects in pattern order
  for (const block of page.pattern) {
    const x = block.col * grid.cellW;
    const y = block.row * grid.cellH;
    const w = block.w * grid.cellW;
    const h = block.h * grid.cellH;
    const tintCount = colourway.tints.length;
    const tintIndex =
      tintCount > 0 ? ((block.tint % tintCount) + tintCount) % tintCount : 0;
    const fill =
      colourway.tints[tintIndex] ??
      colourway.tints[0] ??
      colourway.background;

    rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${rects.join('')}</svg>`;
}
