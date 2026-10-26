import { renderComposed } from './composedRenderer.js';
import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { getFormatDimensions } from './formats.js';
import { gridFor } from './grid.js';
import type { Shaper } from './text/index.js';
import type { Document } from './types.js';

export interface RenderOptions {
  /**
   * A shaper built from the brand fonts (`createShaper`). With it, a Page whose layout is not 'pattern' is drawn
   * composed: photo, Highlights, outlined text, Ticker and wordmark on top of the Pattern. Without it, or for a
   * 'pattern' Page, the output is the Pattern alone.
   */
  shaper?: Shaper;
}

/**
 * Renders a Document's Page into an SVG string.
 * Pattern structure:
 * - <svg xmlns shape-rendering="crispEdges" viewBox="0 0 W H" width height>
 * - One background <rect> with fill of Colourway background (none when the Document's background is transparent)
 * - One <rect> per Block in list order with solid fill="#HEX"
 * No opacity attributes anywhere.
 *
 * Composed pages (see `renderComposed`) add an <image>, <rect>s and outlined <path>s, still with no opacity and
 * only brand fills.
 */
export function renderSvg(doc: Document, pageIndex = 0, options: RenderOptions = {}): string {
  const page = doc.pages[pageIndex] ?? { pattern: [] };
  if (options.shaper && page.layout && page.layout !== 'pattern') {
    return renderComposed(doc, pageIndex, options.shaper);
  }
  const grid = gridFor(doc);
  const colourway = getColourway(doc.colourway) ?? getColourway(DEFAULT_COLOURWAY_ID)!;
  const { widthPx: width, heightPx: height } = getFormatDimensions(doc);

  const rects: string[] = [];
  // Background rect
  if (!doc.transparentBackground) rects.push(`<rect width="${width}" height="${height}" fill="${colourway.background}"/>`);

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
