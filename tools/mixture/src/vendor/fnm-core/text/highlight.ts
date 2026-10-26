/**
 * Highlights (guideline 6.3 "Highlight build"): the user marks key words of a headline with [square brackets];
 * the app draws a solid box behind each marked run, with a Wick at the bottom-left and one at the top-right.
 *
 * Unit. Everything is measured in u, the height of the tittle (the dot) of the "i" in the headline's face
 * at the headline's size: u = tittle(face) * size / upem. The tittle comes from the "i" glyph's own outline
 * (see `measureTittle` in shaper.ts). For FinnomenaTrek Medium that is 114/1000 of the size.
 *
 * Box, per run per line. Coordinates are the layout's: x from the box's left edge, y down from the cap top
 * of the first line, so the first baseline sits at y = cap height.
 *   - horizontal: the run's pen extent on that line (first glyph's pen to the end of the last glyph's
 *     advance, spaces at either end trimmed), grown by 1.5u on the left and on the right;
 *   - vertical: the line's cap-height-to-baseline band (baseline - capHeight .. baseline), grown by 2u
 *     above and 2u below. That band, not the font's ascender/descender, is what a designer aligns to.
 * A run that wraps gets one box per line it touches.
 *
 * Wicks, 2u long and u wide, flush with the box's corners (an assumption: the guideline text only says
 * "bottom-left" and "top-right", and flush corners are the literal reading):
 *   - bottom-left: x = box left .. box left + u, hanging down from the box bottom edge;
 *   - top-right:   x = box right - u .. box right, rising from the box top edge.
 * On a run that wraps, the top-right Wick belongs to its first line's box and the bottom-left Wick to its
 * last line's box, so the whole Highlight reads as one shape rising from lower-left to upper-right. A run on
 * one line has both.
 *
 * Overlap. With headline leading 1.05 a box is (cap height + 4u) tall, about 1.16 x size for Trek, which is
 * more than the line pitch, so the boxes of neighbouring lines overlap by about 0.1 x size. They share one
 * solid fill and there is no opacity, so the union looks right. The renderer must therefore paint every box
 * and Wick before any text, or line 2's box would cover line 1's glyphs.
 */

export const HIGHLIGHT_PAD_Y = 2;
export const HIGHLIGHT_PAD_X = 1.5;
export const WICK_LENGTH = 2;
export const WICK_WIDTH = 1;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A marked run in the plain text (brackets already removed): UTF-16 offsets, end exclusive. */
export interface HighlightRun {
  start: number;
  end: number;
}

export interface ParsedMarkup {
  /** The text with `[` and `]` removed; `\n` kept, `\r` dropped. */
  text: string;
  runs: HighlightRun[];
}

/**
 * Read `[highlight]` markup. Brackets never reach the output. A `[` inside an open run, a `]` with nothing
 * open, and a `[` that is never closed are dropped without highlighting anything; empty and all-space runs
 * are ignored. A run may span a newline.
 */
export function parseMarkup(markup: string): ParsedMarkup {
  let text = '';
  const runs: HighlightRun[] = [];
  let open: number | null = null;
  for (const ch of markup) {
    if (ch === '\r') continue;
    if (ch === '[') {
      open ??= text.length;
    } else if (ch === ']') {
      if (open !== null) {
        if (text.slice(open).trim() !== '') runs.push({ start: open, end: text.length });
        open = null;
      }
    } else {
      text += ch;
    }
  }
  return { text, runs };
}

let wordSegmenter: Intl.Segmenter | undefined;

/** How many words are marked, for the "no more than a few key words" Advisory (about 4). */
export function countHighlightedWords(markup: string): number {
  wordSegmenter ??= new Intl.Segmenter('th', { granularity: 'word' });
  const { text, runs } = parseMarkup(markup);
  let count = 0;
  for (const run of runs) {
    for (const s of wordSegmenter.segment(text.slice(run.start, run.end))) if (s.isWordLike) count++;
  }
  return count;
}

/** What the geometry needs to know about a laid-out line. */
export interface HighlightLine {
  /** Plain-text offsets of the line, spaces at its ends already trimmed. */
  start: number;
  end: number;
  baseline: number;
  /** Where the line's pen starts and how far it runs (alignment included). */
  x: number;
  width: number;
  glyphs: readonly { cluster: number; pen: number }[];
}

export interface HighlightSegment {
  /** Index into the run list. */
  run: number;
  /** Index into the layout's lines. */
  line: number;
  /** The first (top) box of its run: it carries the top-right Wick. */
  first: boolean;
  /** The last (bottom) box of its run: it carries the bottom-left Wick. */
  last: boolean;
  box: Rect;
  wickBottomLeft: Rect | null;
  wickTopRight: Rect | null;
}

/** Pen position of the glyph that starts at or after `offset`; the line's end when there is none. */
function penAt(line: HighlightLine, offset: number): number {
  const glyph = line.glyphs.find((g) => g.cluster >= offset);
  return glyph ? glyph.pen : line.x + line.width;
}

export function highlightGeometry(
  text: string,
  lines: readonly HighlightLine[],
  runs: readonly HighlightRun[],
  unit: number,
  capHeight: number,
): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  runs.forEach((run, runIndex) => {
    const own: HighlightSegment[] = [];
    lines.forEach((line, lineIndex) => {
      let a = Math.max(run.start, line.start);
      let b = Math.min(run.end, line.end);
      while (a < b && /\s/.test(text[a]!)) a++;
      while (b > a && /\s/.test(text[b - 1]!)) b--;
      if (a >= b) return;
      const left = penAt(line, a) - HIGHLIGHT_PAD_X * unit;
      const right = penAt(line, b) + HIGHLIGHT_PAD_X * unit;
      const top = line.baseline - capHeight - HIGHLIGHT_PAD_Y * unit;
      const bottom = line.baseline + HIGHLIGHT_PAD_Y * unit;
      own.push({
        run: runIndex,
        line: lineIndex,
        first: false,
        last: false,
        box: { x: left, y: top, width: right - left, height: bottom - top },
        wickBottomLeft: null,
        wickTopRight: null,
      });
    });
    const first = own[0];
    const last = own[own.length - 1];
    if (first) {
      first.first = true;
      first.wickTopRight = {
        x: first.box.x + first.box.width - WICK_WIDTH * unit,
        y: first.box.y - WICK_LENGTH * unit,
        width: WICK_WIDTH * unit,
        height: WICK_LENGTH * unit,
      };
    }
    if (last) {
      last.last = true;
      last.wickBottomLeft = {
        x: last.box.x,
        y: last.box.y + last.box.height,
        width: WICK_WIDTH * unit,
        height: WICK_LENGTH * unit,
      };
    }
    segments.push(...own);
  });
  return segments;
}
