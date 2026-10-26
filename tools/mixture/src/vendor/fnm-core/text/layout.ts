import { breakUnits, type BreakUnit } from './lineBreak.js';
import { highlightGeometry, parseMarkup, type HighlightRun, type HighlightSegment } from './highlight.js';
import { transformPath } from './path.js';
import type { FaceId, Shaper, UnitGlyph } from './shaper.js';

/**
 * The type styles of the brand (ADR 0002, spec "Brand rules"): which face and how much leading each kind of
 * text gets. Headline leading 105% is the middle of the guideline's 100 to 110%.
 */
export const TYPE_STYLES = {
  headline: { face: 'trek-medium', leading: 1.05 },
  secondary: { face: 'trek-regular', leading: 1.2 },
  mono: { face: 'plex-mono', leading: 1.2 },
} as const satisfies Record<string, { face: FaceId; leading: number }>;

export type TextAlign = 'left' | 'center' | 'right';

export interface TextLayoutOptions {
  face: FaceId;
  /** Font size in px. */
  size: number;
  /** Line pitch as a multiple of the size (1.05 = 105%). */
  leading: number;
  /** Width of the box in px: lines wrap to fit it. Infinity means no wrapping (only `\n` breaks). */
  width: number;
  align?: TextAlign;
}

/** A glyph placed on its line, in px, in the layout's coordinates (y down). */
export interface PlacedGlyph {
  glyphId: number;
  /** Index in the plain text. */
  cluster: number;
  /** Pen position along the line. */
  pen: number;
  advance: number;
  /** Where to draw the glyph's origin: pen plus harfbuzz's offset. */
  x: number;
  y: number;
}

export interface LayoutLine {
  /** The line's text, spaces at both ends trimmed. */
  text: string;
  /** Offsets of `text` in the plain text. */
  start: number;
  end: number;
  /** Where the line's first pen position is (0 for left aligned). */
  x: number;
  /** Advance width of the trimmed line. */
  width: number;
  baseline: number;
  glyphs: PlacedGlyph[];
  /** The line is wider than the box because one word cannot be broken. */
  overflows: boolean;
}

/**
 * Coordinates: x runs right from the box's left edge, y runs down from the CAP TOP of the first line. The
 * first baseline is therefore at y = capHeight, and line n's baseline at capHeight + n * lineHeight. The
 * block is measured cap-top to last baseline, the band designers align to; Thai tone marks and descenders
 * may poke out of it, and Highlight boxes extend past it by 2u.
 */
export interface TextLayout {
  face: FaceId;
  size: number;
  leading: number;
  /** The box width the text was wrapped to. */
  boxWidth: number;
  /** Plain text: markup brackets removed. */
  text: string;
  lines: LayoutLine[];
  /** Line pitch, size * leading. */
  lineHeight: number;
  /** Cap height of the face at this size. */
  capHeight: number;
  /** u: the "i" tittle height at this size, the Highlight unit. */
  unit: number;
  /** Widest line. */
  width: number;
  /** Cap top of the first line to the last baseline. */
  height: number;
  /** A word was too wide for the box. */
  overflowX: boolean;
  /** Shaped glyphs that fell back to .notdef (the face lacks the character). */
  missingGlyphs: number;
  highlights: HighlightSegment[];
}

interface PreparedParagraph {
  /** Offset of the paragraph in the plain text. */
  offset: number;
  text: string;
  glyphs: readonly UnitGlyph[];
  /** prefix[i] = sum of the advances of glyphs before i, in font units. */
  prefix: number[];
  /** firstGlyph[o] = index of the first glyph whose cluster is >= o, for o in 0..text.length. */
  firstGlyph: number[];
  units: ReturnType<typeof breakUnits>;
  /** Highlight runs clipped to the paragraph, in local offsets. */
  runs: HighlightRun[];
}

/** Text that is shaped and split into break units once, laid out at any size. */
export interface PreparedText {
  face: FaceId;
  text: string;
  runs: HighlightRun[];
  paragraphs: PreparedParagraph[];
  upem: number;
  capHeight: number;
  tittle: number;
  missingGlyphs: number;
}

export function prepareText(shaper: Shaper, markup: string, face: FaceId): PreparedText {
  const { text, runs } = parseMarkup(markup);
  const m = shaper.metrics(face);
  const paragraphs: PreparedParagraph[] = [];
  let offset = 0;
  let missing = 0;
  for (const part of text.split('\n')) {
    const glyphs = shaper.shapeUnits(face, part);
    const prefix = [0];
    for (const g of glyphs) prefix.push(prefix[prefix.length - 1]! + g.advance);
    const firstGlyph = new Array<number>(part.length + 1);
    let gi = 0;
    for (let o = 0; o <= part.length; o++) {
      while (gi < glyphs.length && glyphs[gi]!.cluster < o) gi++;
      firstGlyph[o] = gi;
    }
    missing += glyphs.filter((g) => g.glyphId === 0).length;
    const local = runs
      .map((r) => ({ start: Math.max(r.start - offset, 0), end: Math.min(r.end - offset, part.length) }))
      .filter((r) => r.end > r.start);
    paragraphs.push({ offset, text: part, glyphs, prefix, firstGlyph, units: breakUnits(part), runs: local });
    offset += part.length + 1;
  }
  return { face, text, runs, paragraphs, upem: m.upem, capHeight: m.capHeight, tittle: m.tittle, missingGlyphs: missing };
}

/**
 * The break units of a paragraph, with the units of each Highlight run glued into one when the run fits on a
 * line: a highlighted name such as "[พัฒนกิจ]" is one key word to the reader even where Intl.Segmenter splits
 * it ("พัฒน|กิจ"). A run wider than the line keeps its word breaks.
 */
function wrapUnits(p: PreparedParagraph, maxUnits: number, span: (a: number, b: number) => number): BreakUnit[] {
  if (p.runs.length === 0) return p.units;
  const inside = (u: BreakUnit): boolean => p.runs.some((r) => r.start < u.start && u.start < r.end);
  const out: BreakUnit[] = [];
  for (let i = 0; i < p.units.length; ) {
    // Unit i plus every following unit that starts inside a run: one group with no line break allowed.
    let j = i + 1;
    while (j < p.units.length && inside(p.units[j]!)) j++;
    const first = p.units[i]!;
    const last = p.units[j - 1]!;
    if (j - i > 1 && span(first.start, last.contentEnd) <= maxUnits) {
      out.push({ start: first.start, contentEnd: last.contentEnd, end: last.end });
    } else {
      out.push(...p.units.slice(i, j));
    }
    i = j;
  }
  return out;
}

/** Wrap one paragraph greedily; returns local [start, end) pairs of each line (spaces trimmed). */
function wrap(p: PreparedParagraph, maxUnits: number): { start: number; end: number; overflows: boolean }[] {
  const span = (a: number, b: number): number => p.prefix[p.firstGlyph[b]!]! - p.prefix[p.firstGlyph[a]!]!;
  if (p.units.length === 0) return [{ start: 0, end: 0, overflows: false }];
  const units = wrapUnits(p, maxUnits, span);
  const lines: { start: number; end: number; overflows: boolean }[] = [];
  let start = units[0]!.start;
  let end = units[0]!.contentEnd;
  for (let i = 1; i < units.length; i++) {
    const u = units[i]!;
    if (span(start, u.contentEnd) <= maxUnits) {
      end = u.contentEnd;
    } else {
      lines.push({ start, end, overflows: span(start, end) > maxUnits });
      start = u.start;
      end = u.contentEnd;
    }
  }
  lines.push({ start, end, overflows: span(start, end) > maxUnits });
  return lines;
}

export function layoutPrepared(
  shaper: Shaper,
  prepared: PreparedText,
  options: Omit<TextLayoutOptions, 'face'>,
): TextLayout {
  const { size, leading, width: boxWidth, align = 'left' } = options;
  if (!(size > 0)) throw new RangeError('Text size must be positive');
  if (!(leading > 0)) throw new RangeError('Leading must be positive');
  const scale = size / prepared.upem;
  const capHeight = prepared.capHeight * scale;
  const lineHeight = size * leading;
  const lines: LayoutLine[] = [];

  for (const p of prepared.paragraphs) {
    for (const l of wrap(p, boxWidth / scale)) {
      const g0 = p.firstGlyph[l.start]!;
      const g1 = p.firstGlyph[l.end]!;
      const origin = p.prefix[g0]!;
      const width = (p.prefix[g1]! - origin) * scale;
      const x = align === 'left' || !Number.isFinite(boxWidth) ? 0 : (boxWidth - width) * (align === 'right' ? 1 : 0.5);
      const baseline = capHeight + lines.length * lineHeight;
      const glyphs: PlacedGlyph[] = [];
      for (let i = g0; i < g1; i++) {
        const g = p.glyphs[i]!;
        const pen = x + (p.prefix[i]! - origin) * scale;
        glyphs.push({
          glyphId: g.glyphId,
          cluster: p.offset + g.cluster,
          pen,
          advance: g.advance * scale,
          x: pen + g.dx * scale,
          y: g.dy ? baseline - g.dy * scale : baseline,
        });
      }
      lines.push({
        text: p.text.slice(l.start, l.end),
        start: p.offset + l.start,
        end: p.offset + l.end,
        x,
        width,
        baseline,
        glyphs,
        overflows: l.overflows,
      });
    }
  }

  const unit = prepared.tittle * scale;
  return {
    face: prepared.face,
    size,
    leading,
    boxWidth,
    text: prepared.text,
    lines,
    lineHeight,
    capHeight,
    unit,
    width: lines.reduce((w, l) => Math.max(w, l.width), 0),
    height: capHeight + (lines.length - 1) * lineHeight,
    overflowX: lines.some((l) => l.overflows),
    missingGlyphs: prepared.missingGlyphs,
    highlights: highlightGeometry(prepared.text, lines, prepared.runs, unit, capHeight),
  };
}

/**
 * Lay `markup` out in a box of `options.width`: shaped, wrapped at word boundaries (Intl.Segmenter, `\n` kept),
 * `[bracketed]` words turned into Highlight geometry. Positions are in px and relative to the box's top-left
 * at the first line's cap top (see `TextLayout`).
 */
export function layoutText(shaper: Shaper, markup: string, options: TextLayoutOptions): TextLayout {
  return layoutPrepared(shaper, prepareText(shaper, markup, options.face), options);
}

export interface FitOptions {
  face: FaceId;
  leading: number;
  /** The slot, in px. */
  width: number;
  height: number;
  /** Largest size to try (the layout's cap). Rounded down to a whole px. */
  maxSize: number;
  /** Smallest size to fall back to when nothing fits. Default 1. */
  minSize?: number;
  align?: TextAlign;
}

export interface FitResult {
  /** The chosen whole-px size. */
  size: number;
  /** False when even `minSize` does not fit: the layout is then the one at `minSize`. */
  fits: boolean;
  layout: TextLayout;
}

/**
 * The largest whole px size, up to `maxSize`, at which the text wraps into the slot: no word wider than the
 * box (words are never broken) and the block (cap top to last baseline) no taller than the box. It scans down
 * from the cap one px at a time rather than bisecting, because wrapping makes fit only nearly monotonic and
 * "the largest" must be exact. The text is shaped once.
 */
export function fitText(shaper: Shaper, markup: string, options: FitOptions): FitResult {
  const prepared = prepareText(shaper, markup, options.face);
  const min = Math.max(1, Math.ceil(options.minSize ?? 1));
  const { maxSize, width, height, leading, align } = options;
  let layout: TextLayout | undefined;
  for (let size = Math.max(min, Math.floor(maxSize)); size >= min; size--) {
    layout = layoutPrepared(shaper, prepared, { size, leading, width, align });
    // A hair of tolerance so a block that fits exactly is not lost to floating-point noise.
    if (!layout.overflowX && layout.height <= height + 1e-6) return { size, fits: true, layout };
  }
  return { size: layout!.size, fits: false, layout: layout! };
}

/**
 * SVG path data (one `d` string) for all the glyphs of a layout, in px, y down, with the layout's origin at
 * (`originX`, `originY`). Text is exported outlined (ADR 0008): fill this with the text colour, no fonts needed.
 */
export function layoutOutline(shaper: Shaper, layout: TextLayout, originX = 0, originY = 0): string {
  const scale = layout.size / shaper.metrics(layout.face).upem;
  const parts: string[] = [];
  for (const line of layout.lines) {
    for (const g of line.glyphs) {
      const d = transformPath(shaper.glyphPath(layout.face, g.glyphId), scale, originX + g.x, originY + g.y);
      if (d) parts.push(d);
    }
  }
  return parts.join('');
}
