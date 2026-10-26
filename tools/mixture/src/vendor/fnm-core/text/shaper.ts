/// <reference path="./harfbuzzjs.d.ts" />
import createHarfBuzz from 'harfbuzzjs/hb.js';
import hbjs, { type HbJs } from 'harfbuzzjs/hbjs.js';
import { contours, parsePath, pathBounds, type PathCommand } from './path.js';

/*
 * Text shaping for the pure core (ADR 0008). harfbuzzjs shapes a string in a face; this module owns:
 *  - loading harfbuzz (from the caller's bytes or wasm, never by fetching);
 *  - script itemization, so Thai marks stack right inside a Latin-first string;
 *  - the face metrics the layout needs (cap height, the "i" tittle), measured from glyph outlines;
 *  - caching, so layout and auto-fit can re-scale one shaping at any size.
 *
 * harfbuzzjs is pinned to 0.4.x: its `hb.js` (an Emscripten factory taking `wasmBinary`/`locateFile`) and
 * `hbjs.js` (the JS wrapper) can be imported separately, so the caller decides where the wasm comes from.
 * 1.x loads its own wasm when imported, which would make the core fetch.
 *
 * Shaping runs at the face's units-per-em, so advances are in font units and independent of size. Every
 * pixel value is `units * size / upem`; no rounding, no hinting.
 */

/** The three brand faces (ADR 0002). */
export type FaceId = 'trek-regular' | 'trek-medium' | 'plex-mono';

export const FACE_IDS: readonly FaceId[] = ['trek-regular', 'trek-medium', 'plex-mono'];

/** The file each face is shipped as in apps/web/public/fonts, for callers that load them. */
export const FACE_FILES: Readonly<Record<FaceId, string>> = {
  'trek-regular': 'FinnomenaTrek-Regular.otf',
  'trek-medium': 'FinnomenaTrek-Medium.otf',
  'plex-mono': 'IBMPlexMono-Regular.ttf',
};

/**
 * The files of the "Plex shaper" used by editable exports (ADR 0002): the Trek face ids backed by IBM Plex Sans Thai
 * Regular and Medium, `plex-mono` by IBM Plex Mono. Text laid out with this shaper has Plex's metrics, so lines,
 * Highlight boxes and Wicks line up with Plex text in a PPTX or Google Slides.
 */
export const PLEX_FACE_FILES: Readonly<Record<FaceId, string>> = {
  'trek-regular': 'IBMPlexSansThai-Regular.ttf',
  'trek-medium': 'IBMPlexSansThai-Medium.ttf',
  'plex-mono': 'IBMPlexMono-Regular.ttf',
};

/** Raw sfnt bytes (OTF or TTF; not WOFF, harfbuzz cannot read it). */
export type FontBytes = Uint8Array | ArrayBuffer;
export type ShaperFonts = Partial<Record<FaceId, FontBytes>>;

export type HarfBuzz = HbJs;

/**
 * Where harfbuzz comes from. Give at most one:
 * - `hb`: an instance from an earlier `loadHarfBuzz` (share one across shapers);
 * - `wasmBinary`: the bytes of `harfbuzzjs/hb.wasm` (browser: fetch the asset URL, pass the bytes);
 * - `locateFile`: Emscripten's hook to point at `hb.wasm` elsewhere.
 * With none, Node reads `hb.wasm` next to the package (tests, MCP server).
 */
export interface HarfBuzzOptions {
  hb?: HarfBuzz;
  wasmBinary?: ArrayBuffer | Uint8Array;
  locateFile?: (path: string, scriptDirectory: string) => string;
}

let defaultHarfBuzz: Promise<HarfBuzz> | undefined;

export function loadHarfBuzz(options: HarfBuzzOptions = {}): Promise<HarfBuzz> {
  if (options.hb) return Promise.resolve(options.hb);
  if (options.wasmBinary || options.locateFile) {
    const { wasmBinary, locateFile } = options;
    return createHarfBuzz({
      ...(wasmBinary ? { wasmBinary } : {}),
      ...(locateFile ? { locateFile } : {}),
    }).then(hbjs);
  }
  // Compiling the wasm is the slow part, so the zero-option instance is built once per process.
  defaultHarfBuzz ??= createHarfBuzz().then(hbjs);
  return defaultHarfBuzz;
}

/** A glyph from one shaping, in font units. `dx`/`dy` are harfbuzz offsets (y up). */
export interface UnitGlyph {
  glyphId: number;
  /** UTF-16 index in the shaped text of the first character this glyph came from. */
  cluster: number;
  advance: number;
  dx: number;
  dy: number;
}

export interface FaceMetrics {
  upem: number;
  /** Top of the capital "H", in font units above the baseline. */
  capHeight: number;
  /** Height of the dot of the "i" (the tittle), in font units. See `measureTittle`. */
  tittle: number;
}

/** A glyph placed along a run, in px. */
export interface ShapedGlyph {
  glyphId: number;
  cluster: number;
  /** Pen position along the baseline, from the start of the run. */
  x: number;
  advance: number;
  /** Where to draw the glyph's origin relative to the pen: `ox` right, `oy` DOWN (page convention). */
  ox: number;
  oy: number;
}

export interface ShapedRun {
  face: FaceId;
  size: number;
  text: string;
  glyphs: ShapedGlyph[];
  /** Sum of advances. */
  width: number;
  /** Glyphs that fell back to .notdef (e.g. Thai typed in IBM Plex Mono, which has none). */
  missingGlyphs: number;
}

export interface Shaper {
  readonly faces: readonly FaceId[];
  has(face: FaceId): boolean;
  metrics(face: FaceId): FaceMetrics;
  /** Shape one line of text (no `\n` or `\r`) at the face's own scale; cached. */
  shapeUnits(face: FaceId, text: string): readonly UnitGlyph[];
  /** Shape one line of text at `size` px. */
  shape(face: FaceId, text: string, size: number): ShapedRun;
  /** The parsed outline of a glyph in font units (y up). Cached. */
  glyphPath(face: FaceId, glyphId: number): readonly PathCommand[];
  /** Free the wasm objects. The shaper is unusable afterwards. */
  destroy(): void;
}

interface LoadedFace {
  upem: number;
  font: ReturnType<HbJs['createFont']>;
  face: ReturnType<HbJs['createFace']>;
  blob: ReturnType<HbJs['createBlob']>;
  metrics?: FaceMetrics;
}

const UNIT_CACHE_LIMIT = 2000;

type Script = 'thai' | 'other';

/** Thai block U+0E00 to U+0E7F. */
function isThai(cp: number): boolean {
  return cp >= 0x0e00 && cp <= 0x0e7f;
}

/**
 * Split a line into runs of one script, the way browsers itemize: Thai and "everything else". Characters with
 * no script of their own (spaces, punctuation, digits) join the run before them, or the one after at line
 * start. Each run is shaped alone because OpenType picks lookups by script: a Thai mark in a buffer whose
 * script was guessed as Latin would miss the font's Thai GSUB/GPOS and stack wrongly.
 */
export function itemizeScripts(text: string): { start: number; end: number; script: Script }[] {
  const runs: { start: number; end: number; script: Script }[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    const len = cp > 0xffff ? 2 : 1;
    const char = text.slice(i, i + len);
    const script: Script | null = isThai(cp) ? 'thai' : /[\p{L}\p{M}]/u.test(char) ? 'other' : null;
    const last = runs[runs.length - 1];
    if (script === null) {
      if (last) last.end = i + len;
    } else if (last && last.script === script) {
      last.end = i + len;
    } else {
      // The first run also takes any leading common chars (start 0); later ones start at their own first char.
      runs.push({ start: last ? i : 0, end: i + len, script });
    }
    i += len;
  }
  if (runs.length === 0 && text.length > 0) runs.push({ start: 0, end: text.length, script: 'other' });
  return runs;
}

/**
 * Height of the tittle of the "i", in font units, from the glyph's own outline.
 *
 * The "i" is a stem plus a dot, two closed contours. The dot is the one whose lowest point is highest;
 * its height is its exact outline bounds (curve extremes, not control points). A dotless-i comparison
 * would also work in principle, but FinnomenaTrek has no U+0131, so the contour test is the method.
 */
export function measureTittle(iGlyph: readonly PathCommand[]): number {
  const parts = contours(iGlyph);
  if (parts.length < 2) throw new Error('The "i" glyph has no separate dot; cannot measure the tittle');
  const boxes = parts.map((c) => pathBounds(c)!);
  const dot = boxes.reduce((top, b) => (b.minY > top.minY ? b : top));
  return dot.maxY - dot.minY;
}

export async function createShaper(fonts: ShaperFonts, options: HarfBuzzOptions = {}): Promise<Shaper> {
  const hb = await loadHarfBuzz(options);
  const loaded = new Map<FaceId, LoadedFace>();
  for (const id of FACE_IDS) {
    const bytes = fonts[id];
    if (!bytes) continue;
    const blob = hb.createBlob(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const face = hb.createFace(blob, 0);
    loaded.set(id, { upem: face.upem, font: hb.createFont(face), face, blob });
  }

  const get = (id: FaceId): LoadedFace => {
    const f = loaded.get(id);
    if (!f) throw new Error(`Font "${id}" was not given to createShaper`);
    return f;
  };

  const unitCache = new Map<string, UnitGlyph[]>();
  const pathCache = new Map<string, PathCommand[]>();

  const shapeRun = (f: LoadedFace, text: string, offset: number, out: UnitGlyph[]): void => {
    const buffer = hb.createBuffer();
    try {
      buffer.addText(text);
      buffer.guessSegmentProperties();
      hb.shape(f.font, buffer);
      for (const g of buffer.json()) {
        out.push({ glyphId: g.g, cluster: g.cl + offset, advance: g.ax, dx: g.dx, dy: g.dy });
      }
    } finally {
      buffer.destroy();
    }
  };

  const shapeUnits = (id: FaceId, text: string): readonly UnitGlyph[] => {
    if (/[\n\r]/.test(text)) {
      // Trek has a real glyph for U+000A and Plex shows .notdef: split lines before shaping.
      throw new Error('shapeUnits takes one line; split on newlines first');
    }
    const key = `${id}\0${text}`;
    const hit = unitCache.get(key);
    if (hit) return hit;
    const f = get(id);
    const glyphs: UnitGlyph[] = [];
    for (const run of itemizeScripts(text)) shapeRun(f, text.slice(run.start, run.end), run.start, glyphs);
    if (unitCache.size >= UNIT_CACHE_LIMIT) unitCache.clear();
    unitCache.set(key, glyphs);
    return glyphs;
  };

  const glyphPath = (id: FaceId, glyphId: number): readonly PathCommand[] => {
    const key = `${id}\0${glyphId}`;
    let path = pathCache.get(key);
    if (!path) {
      path = parsePath(get(id).font.glyphToPath(glyphId));
      pathCache.set(key, path);
    }
    return path;
  };

  const metrics = (id: FaceId): FaceMetrics => {
    const f = get(id);
    if (!f.metrics) {
      const outlineOf = (ch: string): readonly PathCommand[] => glyphPath(id, shapeUnits(id, ch)[0]!.glyphId);
      const capBounds = pathBounds(outlineOf('H'));
      if (!capBounds) throw new Error(`Font "${id}" has no capital H`);
      f.metrics = { upem: f.upem, capHeight: capBounds.maxY, tittle: measureTittle(outlineOf('i')) };
    }
    return f.metrics;
  };

  const shape = (id: FaceId, text: string, size: number): ShapedRun => {
    const units = shapeUnits(id, text);
    const scale = size / get(id).upem;
    const glyphs: ShapedGlyph[] = [];
    let pen = 0;
    let missing = 0;
    for (const g of units) {
      if (g.glyphId === 0) missing++;
      glyphs.push({
        glyphId: g.glyphId,
        cluster: g.cluster,
        x: pen * scale,
        advance: g.advance * scale,
        ox: g.dx * scale,
        oy: g.dy ? -g.dy * scale : 0,
      });
      pen += g.advance;
    }
    return { face: id, size, text, glyphs, width: pen * scale, missingGlyphs: missing };
  };

  return {
    faces: FACE_IDS.filter((id) => loaded.has(id)),
    has: (id) => loaded.has(id),
    metrics,
    shapeUnits,
    shape,
    glyphPath,
    destroy() {
      for (const f of loaded.values()) {
        f.font.destroy();
        f.face.destroy();
        f.blob.destroy();
      }
      loaded.clear();
      unitCache.clear();
      pathCache.clear();
    },
  };
}
