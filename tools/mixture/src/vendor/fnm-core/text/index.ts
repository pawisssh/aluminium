export * from './shaper.js';
export * from './layout.js';
export {
  parseMarkup,
  countHighlightedWords,
  highlightGeometry,
  HIGHLIGHT_PAD_X,
  HIGHLIGHT_PAD_Y,
  WICK_LENGTH,
  WICK_WIDTH,
} from './highlight.js';
export type { HighlightRun, HighlightSegment, HighlightLine, ParsedMarkup, Rect } from './highlight.js';
export { breakUnits } from './lineBreak.js';
export type { BreakUnit } from './lineBreak.js';
export { parsePath, pathBounds, contours, transformPath } from './path.js';
export type { PathCommand, Bounds } from './path.js';
