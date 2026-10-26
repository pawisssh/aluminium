import { DEFAULT_COLOURWAY_ID, getColourway } from './constants.js';
import { densityLevelsFor, FORMATS } from './formats.js';
import {
  blockCountRangeFor,
  defaultBlockCountFor,
  defaultGeneratorParams,
  isValidBlockSize,
  generatePatternDetailed,
  validateGeneratorParams,
} from './generator.js';
import { cleanContent, contentPatchProblem, mergeContent, photoProblem } from './content.js';
import { gridFor } from './grid.js';
import { layoutTextZone, LAYOUT_TABLE } from './layouts.js';
import { isPageEdited, materializePages, nextPageSeed, pageSeed, settlePages } from './pages.js';
import { createRng, generateRandomSeed } from './prng.js';
import { checkPatternRules, repairPatternRules } from './patternRules.js';
import { LATEST_REFERENCE_SET } from './referencePatterns.js';
import { validateDocument } from './serialization.js';
import type { Block, Command, Document, Grid, Page, PageLayoutId, Rejection, TextZone, Warning } from './types.js';
import { computeWarnings } from './warnings.js';

/** The same Pages with the one at `pageIndex` marked as edited by hand. */
function markEdited(pages: Page[], pageIndex: number): Page[] {
  return pages.map((p, i) => (i === pageIndex ? { ...p, edited: true } : p));
}

/** Scales one Block side to the new Grid: a whole number of cells from 1 to the Grid side (ADR 0007). */
function scaleSide(raw: number, max: number): number {
  return Math.max(1, Math.min(max, Math.round(raw)));
}

/**
 * Re-maps one Block proportionally onto a new Grid: its centre scales with the Grid,
 * and its size scales with it, rounded to whole cells.
 */
function remapBlock(block: Block, oldGrid: Grid, newGrid: Grid): Block {
  const colRatio = newGrid.cols / oldGrid.cols;
  const rowRatio = newGrid.rows / oldGrid.rows;
  const w = scaleSide(block.w * colRatio, newGrid.cols);
  const h = scaleSide(block.h * rowRatio, newGrid.rows);
  const col = Math.max(0, Math.min(newGrid.cols - w, Math.round((block.col + block.w / 2) * colRatio - w / 2)));
  const row = Math.max(0, Math.min(newGrid.rows - h, Math.round((block.row + block.h / 2) * rowRatio - h / 2)));
  return { ...block, col, row, w, h };
}

const overlaps = (a: Block, b: Block): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/**
 * Restores Edge connect after per-Block snapping: for each pair that shared an edge before
 * the remap, slide the later Block (position only, so sizes stay as they are) until the edges
 * meet again. A slide is skipped when it would leave the Grid, overlap another Block, or lose
 * the shared stretch of edge.
 */
function reconnectEdges(old: readonly Block[], next: Block[], newGrid: Grid): void {
  const ranges = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
  for (const axis of ['x', 'y', 'x', 'y'] as const) {
    const order = old.map((_, i) => i).sort((i, j) => (axis === 'x' ? old[i]!.col - old[j]!.col : old[i]!.row - old[j]!.row));
    for (const i of order) {
      for (const j of order) {
        const a = old[i]!;
        const b = old[j]!;
        const touching =
          axis === 'x'
            ? a.col + a.w === b.col && ranges(a.row, a.row + a.h, b.row, b.row + b.h)
            : a.row + a.h === b.row && ranges(a.col, a.col + a.w, b.col, b.col + b.w);
        if (!touching) continue;
        const na = next[i]!;
        const nb = next[j]!;
        const moved = axis === 'x' ? { ...nb, col: na.col + na.w } : { ...nb, row: na.row + na.h };
        if (moved.col === nb.col && moved.row === nb.row) continue;
        if (moved.col + moved.w > newGrid.cols || moved.row + moved.h > newGrid.rows) continue;
        const stillShares =
          axis === 'x'
            ? ranges(na.row, na.row + na.h, moved.row, moved.row + moved.h)
            : ranges(na.col, na.col + na.w, moved.col, moved.col + moved.w);
        if (!stillShares) continue;
        if (next.some((o, k) => k !== j && overlaps(moved, o))) continue;
        next[j] = moved;
      }
    }
  }
}

/**
 * Format/Density change, per Page: an edited Page's Pattern is re-mapped onto the new Grid, an unedited Page is
 * regenerated from its own seed (a one-Page Document behaves exactly as it did before decks).
 */
function applyGridChange(doc: Document, changed: Document): { document: Document; warnings: Warning[] } {
  const next = rescaleZone(doc, withDensityDefaults(changed));
  const oldGrid = gridFor(doc);
  const newGrid = gridFor(next);
  const warnings: Warning[] = [];
  next.pages = next.pages.map((p, i) => {
    if (!isPageEdited(doc, i)) {
      const res = regeneratePage(next, i, pageSeed(next, i));
      warnings.push(...res.warnings);
      return { ...res.pages[i]!, edited: false };
    }
    let pattern = p.pattern.map((b) => remapBlock(b, oldGrid, newGrid));
    reconnectEdges(p.pattern, pattern, newGrid);
    // A remap that broke the Pattern rules (a Pattern that followed them before) is repaired
    // by sliding masses, keeping every Block; if that fails too, computeWarnings warns.
    if (checkPatternRules(p.pattern, oldGrid).ok && !checkPatternRules(pattern, newGrid).ok) {
      const repaired = repairPatternRules(pattern, newGrid);
      if (repaired && checkPatternRules(repaired, newGrid).ok) pattern = repaired;
    }
    return { ...p, pattern, edited: true };
  });
  return { document: next, warnings };
}

function generateNextBlockId(doc: Document, preferredId?: string): string {
  const existingIds = new Set(doc.pages.flatMap((p) => p.pattern.map((b) => b.id)));
  if (preferredId && !existingIds.has(preferredId)) {
    return preferredId;
  }
  let nextNum = 1;
  for (const id of existingIds) {
    const match = id.match(/^block-(\d+)$/);
    if (match) {
      const n = parseInt(match[1]!, 10);
      if (n >= nextNum) {
        nextNum = n + 1;
      }
    }
  }
  let id = `block-${nextNum}`;
  while (existingIds.has(id)) {
    nextNum++;
    id = `block-${nextNum}`;
  }
  return id;
}

const flatFallback = (pageIndex: number): Warning => ({
  code: 'textZone.flatFallback',
  message: 'No single Block could cover the Text zone, so it was kept clear instead.',
  pageIndex,
});

/**
 * Regenerates one Page's Pattern from `seed` on the Document's Grid, keeping its Text zone, layout, content,
 * seed and edited state and every other Page; warns if 'flat' fell back to 'clear'.
 */
function regeneratePage(doc: Document, pageIndex: number, seed: string): { pages: Page[]; warnings: Warning[] } {
  const page = doc.pages[pageIndex]!;
  const { blocks, flatFallback: fell } = generatePatternDetailed(
    gridFor(doc),
    getColourway(doc.colourway)!,
    createRng(seed),
    doc.generator,
    page.textZone ? { textZone: page.textZone } : {}
  );
  return {
    pages: doc.pages.map((p, i) => (i === pageIndex ? { ...p, pattern: blocks } : p)),
    warnings: fell ? [flatFallback(pageIndex)] : [],
  };
}

/** Regenerates every Page from its own seed (the generator settings changed); no Page is edited after. */
function regenerateAll(doc: Document): { pages: Page[]; warnings: Warning[] } {
  let cur = doc;
  const warnings: Warning[] = [];
  for (let i = 0; i < doc.pages.length; i++) {
    const res = regeneratePage(cur, i, pageSeed(cur, i));
    cur = { ...cur, pages: res.pages };
    warnings.push(...res.warnings);
  }
  return { pages: cur.pages.map((p) => ({ ...p, edited: false })), warnings };
}

/**
 * Puts the Text zones right after a Grid change. A Page with a layout takes its zone from the layout table on
 * the new Grid (the Format's orientation may have changed); any other Page maps its zone proportionally,
 * so it stays inside the Page.
 */
function rescaleZone(doc: Document, next: Document): Document {
  const from = gridFor(doc);
  const to = gridFor(next);
  return {
    ...next,
    pages: next.pages.map((p) => {
      if (p.layout) {
        const zone = layoutTextZone(next, p.layout);
        return zone ? { ...p, textZone: zone } : p;
      }
      const zone = p.textZone;
      if (!zone) return p;
      const col = Math.min(to.cols - 1, Math.round((zone.col * to.cols) / from.cols));
      const row = Math.min(to.rows - 1, Math.round((zone.row * to.rows) / from.rows));
      const w = Math.min(to.cols - col, Math.max(1, Math.round((zone.w * to.cols) / from.cols)));
      const h = Math.min(to.rows - row, Math.max(1, Math.round((zone.h * to.rows) / from.rows)));
      return { ...p, textZone: { ...zone, col, row, w, h } };
    }),
  };
}

/**
 * Format and Density changes reset blockCount to the new Grid's default unless the user set it.
 * An explicit count is kept while it still fits the new Grid's range; one that no longer does
 * falls back to the Grid default and is no longer explicit.
 */
function withDensityDefaults(doc: Document): Document {
  const grid = gridFor(doc);
  const fallback = { ...doc.generator, blockCount: defaultBlockCountFor(grid) };
  if (!doc.blockCountExplicit) return { ...doc, generator: fallback };
  const { min, max } = blockCountRangeFor(grid);
  const { blockCount } = doc.generator;
  if (blockCount >= min && blockCount <= max) return doc;
  return { ...doc, generator: fallback, blockCountExplicit: false };
}

/** Why `block` cannot sit on `doc`'s Grid in its Colourway (a whole size, inside the Grid, a Tint it has), if it cannot. */
function blockProblem(doc: Document, block: Pick<Block, 'col' | 'row' | 'w' | 'h' | 'tint'>): Rejection | null {
  const grid = gridFor(doc);
  if (!isValidBlockSize(block.w, grid.cols) || !isValidBlockSize(block.h, grid.rows)) {
    return {
      rejected: {
        code: 'block.sizeNotAllowed',
        message: `Block size ${block.w}x${block.h} is not allowed. Width must be a whole number from 1 to ${grid.cols} and height from 1 to ${grid.rows}.`,
      },
    };
  }

  if (
    block.col < 0 ||
    block.row < 0 ||
    block.col + block.w > grid.cols ||
    block.row + block.h > grid.rows
  ) {
    return {
      rejected: {
        code: 'block.outOfGrid',
        message: `Block position (${block.col}, ${block.row}) with size (${block.w}, ${block.h}) is outside grid (${grid.cols}x${grid.rows}).`,
      },
    };
  }

  const colourway = getColourway(doc.colourway);
  const tintCount = colourway ? colourway.tints.length : 1;
  if (!Number.isInteger(block.tint) || block.tint < 0 || block.tint >= tintCount) {
    return {
      rejected: {
        code: 'block.tintOutOfRange',
        message: `Tint index ${block.tint} is out of range for colourway ${doc.colourway} (0..${tintCount - 1}).`,
      },
    };
  }
  return null;
}

export type ExecuteResult =
  | { document: Document; warnings: Warning[] }
  | Rejection;

/**
 * Pure command execution function.
 * Never mutates input document.
 * Only uses Math.random() when a seed must be generated because none was provided.
 */
export function execute(
  doc: Document | null,
  cmd: Command
): { document: Document; warnings: Warning[] } | Rejection {
  // Commands see every Page's seed and edited state on the Page; the result is put back in its stored form
  // (a one-Page Document keeps both on the Document, as before decks).
  const res = executeCommand(doc ? materializePages(doc) : doc, cmd);
  if ('rejected' in res) return res;
  const document = settlePages(res.document);
  // Advisory warnings never block: they are appended to any command-specific warnings.
  return { document, warnings: [...computeWarnings(document), ...res.warnings] };
}

function executeCommand(
  doc: Document | null,
  cmd: Command
): { document: Document; warnings: Warning[] } | Rejection {
  if (cmd.type === 'createDocument') {
    const seed = generateRandomSeed();
    const colourway = getColourway(DEFAULT_COLOURWAY_ID)!;
    const newDoc: Document = {
      version: 1,
      format: 'square',
      density: 'fine',
      colourway: colourway.id,
      seed,
      generator: defaultGeneratorParams(
        gridFor({ format: 'square', density: 'fine' } as Document)
      ),
      pages: [],
      edited: false,
    };

    const first = regeneratePage({ ...newDoc, pages: [{ pattern: [] }] }, 0, seed);
    return {
      document: { ...newDoc, pages: first.pages },
      warnings: [],
    };
  }

  if (cmd.type === 'generate') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to generate a pattern. Use createDocument first.',
        },
      };
    }

    const colourway = getColourway(doc.colourway);
    if (!colourway) {
      return {
        rejected: {
          code: 'colourway.unknown',
          message: `Unknown colourway: ${doc.colourway}`,
        },
      };
    }

    const pageIndex = cmd.pageIndex ?? 0;
    if (!doc.pages[pageIndex]) {
      return { rejected: { code: 'page.unknown', message: `There is no Page at index ${pageIndex}.` } };
    }
    // Regenerates just this Page (a one-Page Document keeps the seed on the Document).
    const seed = cmd.seed !== undefined ? cmd.seed : generateRandomSeed();
    // A new roll draws from the newest Reference set; the Document keeps it, so its seeds redraw the same.
    const seeded: Document = {
      ...doc,
      generator: { ...doc.generator, referenceSet: LATEST_REFERENCE_SET },
      pages: doc.pages.map((p, i) => (i === pageIndex ? { ...p, seed, edited: false } : p)),
    };
    const regen = regeneratePage(seeded, pageIndex, seed);
    return { document: { ...seeded, pages: regen.pages }, warnings: regen.warnings };
  }

  if (cmd.type === 'setGeneratorParams') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to set generator params.',
        },
      };
    }
    const problem = validateGeneratorParams(cmd.params);
    if (problem) {
      return { rejected: { code: 'params.invalid', message: problem } };
    }
    const generator = { ...doc.generator, ...cmd.params };
    // 'auto' is stored as no family, the same as a Document made before the choice existed.
    if (generator.family === 'auto') delete generator.family;
    const next: Document = {
      ...doc,
      generator,
      ...(cmd.params.blockCount !== undefined ? { blockCountExplicit: true } : {}),
    };
    // The generator settings are the deck's: every Page is regenerated from its own seed.
    const regen = regenerateAll(next);
    next.pages = regen.pages;
    return { document: next, warnings: regen.warnings };
  }

  if (cmd.type === 'setColourway') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to set colourway. Use createDocument first.',
        },
      };
    }

    const targetColourway = getColourway(cmd.colourway);
    if (!targetColourway) {
      return {
        rejected: {
          code: 'colourway.unknown',
          message: `Unknown colourway: ${cmd.colourway}`,
        },
      };
    }

    const maxTintIndex = targetColourway.tints.length - 1;
    const newDoc: Document = {
      ...doc,
      colourway: targetColourway.id,
      pages: doc.pages.map((p) => ({
        ...p,
        pattern: p.pattern.map((b) => ({
          ...b,
          tint: Math.min(Math.max(0, b.tint), maxTintIndex),
        })),
      })),
      edited: doc.edited ?? false,
    };

    return {
      document: newDoc,
      warnings: [],
    };
  }

  if (cmd.type === 'setTransparentBackground') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to set the background. Use createDocument first.',
        },
      };
    }
    // Only how the Pages are drawn changes: no Pattern is regenerated.
    const { transparentBackground: _was, ...rest } = doc;
    return { document: cmd.transparent ? { ...rest, transparentBackground: true } : rest, warnings: [] };
  }

  if (cmd.type === 'setFormat') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to set format.',
        },
      };
    }

    const knownFormat = FORMATS.find((f) => f.id === cmd.format);
    if (!knownFormat) {
      return {
        rejected: {
          code: 'format.unknown',
          message: `Unknown format: ${cmd.format}`,
        },
      };
    }

    if (cmd.format === 'custom') {
      const { widthPx, heightPx } = cmd;
      if (
        typeof widthPx !== 'number' ||
        typeof heightPx !== 'number' ||
        !Number.isFinite(widthPx) ||
        !Number.isFinite(heightPx) ||
        !Number.isInteger(widthPx) ||
        !Number.isInteger(heightPx) ||
        widthPx < 64 ||
        widthPx > 8000 ||
        heightPx < 64 ||
        heightPx > 8000
      ) {
        return {
          rejected: {
            code: 'format.invalidSize',
            message: 'Custom format requires integer width and height between 64 and 8000 pixels.',
          },
        };
      }
    }

    const customSize =
      cmd.format === 'custom'
        ? { widthPx: cmd.widthPx!, heightPx: cmd.heightPx! }
        : undefined;

    const levels = densityLevelsFor(cmd.format, customSize);
    const ciStandardLevel =
      levels.find((lvl) => lvl.isCiStandard)?.level ?? levels[0]?.level ?? 'fine';

    const newDoc: Document = {
      ...doc,
      format: cmd.format,
      density: ciStandardLevel,
      ...(customSize ? { customSize } : {}),
      edited: doc.edited,
    };
    if (cmd.format !== 'custom') {
      delete newDoc.customSize;
    }

    return applyGridChange(doc, newDoc);
  }

  if (cmd.type === 'setDensity') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to set density.',
        },
      };
    }

    const levels = densityLevelsFor(doc.format, doc.customSize);
    const supported = levels.some((lvl) => lvl.level === cmd.density);
    if (!supported) {
      return {
        rejected: {
          code: 'density.unsupported',
          message: `Density level '${cmd.density}' is not supported for format '${doc.format}'.`,
        },
      };
    }

    const newDoc: Document = {
      ...doc,
      density: cmd.density,
      edited: doc.edited,
    };

    return applyGridChange(doc, newDoc);
  }

  if (cmd.type === 'addBlock') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to add a block.',
        },
      };
    }

    const { block } = cmd;
    const problem = blockProblem(doc, block);
    if (problem) return problem;

    const pageIndex = cmd.pageIndex ?? 0;
    if (!doc.pages[pageIndex]) {
      return { rejected: { code: 'page.unknown', message: `There is no Page at index ${pageIndex}.` } };
    }
    const id = generateNextBlockId(doc, block.id);
    const newBlock: Block = {
      id,
      col: block.col,
      row: block.row,
      w: block.w,
      h: block.h,
      tint: block.tint,
    };

    const newPages = [...doc.pages];
    newPages[pageIndex] = {
      ...newPages[pageIndex]!,
      pattern: [...newPages[pageIndex]!.pattern, newBlock],
    };

    return {
      document: {
        ...doc,
        pages: markEdited(newPages, pageIndex),
        edited: true,
      },
      warnings: [],
    };
  }

  if (cmd.type === 'moveBlock') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to move a block.',
        },
      };
    }

    const pageIndex = cmd.pageIndex ?? 0;
    const page = doc.pages[pageIndex];
    const block = page?.pattern.find((b) => b.id === cmd.id);
    if (!block) {
      return {
        rejected: {
          code: 'block.unknown',
          message: `Block with id '${cmd.id}' not found.`,
        },
      };
    }

    const grid = gridFor(doc);
    if (
      cmd.col < 0 ||
      cmd.row < 0 ||
      cmd.col + block.w > grid.cols ||
      cmd.row + block.h > grid.rows
    ) {
      return {
        rejected: {
          code: 'block.outOfGrid',
          message: `Block position (${cmd.col}, ${cmd.row}) with size (${block.w}, ${block.h}) is outside grid (${grid.cols}x${grid.rows}).`,
        },
      };
    }

    const newPages = doc.pages.map((p, idx) => {
      if (idx !== pageIndex) return p;
      return {
        ...p,
        pattern: p.pattern.map((b) => (b.id === cmd.id ? { ...b, col: cmd.col, row: cmd.row } : b)),
      };
    });

    return {
      document: {
        ...doc,
        pages: markEdited(newPages, pageIndex),
        edited: true,
      },
      warnings: [],
    };
  }

  if (cmd.type === 'resizeBlock') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to resize a block.',
        },
      };
    }

    const pageIndex = cmd.pageIndex ?? 0;
    const page = doc.pages[pageIndex];
    const block = page?.pattern.find((b) => b.id === cmd.id);
    if (!block) {
      return {
        rejected: {
          code: 'block.unknown',
          message: `Block with id '${cmd.id}' not found.`,
        },
      };
    }

    const grid = gridFor(doc);
    if (!isValidBlockSize(cmd.w, grid.cols) || !isValidBlockSize(cmd.h, grid.rows)) {
      return {
        rejected: {
          code: 'block.sizeNotAllowed',
          message: `Block size ${cmd.w}x${cmd.h} is not allowed. Width must be a whole number from 1 to ${grid.cols} and height from 1 to ${grid.rows}.`,
        },
      };
    }

    if (
      cmd.col < 0 ||
      cmd.row < 0 ||
      cmd.col + cmd.w > grid.cols ||
      cmd.row + cmd.h > grid.rows
    ) {
      return {
        rejected: {
          code: 'block.outOfGrid',
          message: `Block position (${cmd.col}, ${cmd.row}) with size (${cmd.w}, ${cmd.h}) is outside grid (${grid.cols}x${grid.rows}).`,
        },
      };
    }

    const newPages = doc.pages.map((p, idx) => {
      if (idx !== pageIndex) return p;
      return {
        ...p,
        pattern: p.pattern.map((b) =>
          b.id === cmd.id
            ? { ...b, col: cmd.col, row: cmd.row, w: cmd.w, h: cmd.h }
            : b
        ),
      };
    });

    return {
      document: {
        ...doc,
        pages: markEdited(newPages, pageIndex),
        edited: true,
      },
      warnings: [],
    };
  }

  if (cmd.type === 'removeBlock') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to remove a block.',
        },
      };
    }

    const pageIndex = cmd.pageIndex ?? 0;
    const page = doc.pages[pageIndex];
    const block = page?.pattern.find((b) => b.id === cmd.id);
    if (!block) {
      return {
        rejected: {
          code: 'block.unknown',
          message: `Block with id '${cmd.id}' not found.`,
        },
      };
    }

    const newPages = doc.pages.map((p, idx) => {
      if (idx !== pageIndex) return p;
      return {
        ...p,
        pattern: p.pattern.filter((b) => b.id !== cmd.id),
      };
    });

    return {
      document: {
        ...doc,
        pages: markEdited(newPages, pageIndex),
        edited: true,
      },
      warnings: [],
    };
  }

  if (cmd.type === 'setBlockTint') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to set block tint.',
        },
      };
    }

    const pageIndex = cmd.pageIndex ?? 0;
    const page = doc.pages[pageIndex];
    const block = page?.pattern.find((b) => b.id === cmd.id);
    if (!block) {
      return {
        rejected: {
          code: 'block.unknown',
          message: `Block with id '${cmd.id}' not found.`,
        },
      };
    }

    const colourway = getColourway(doc.colourway);
    const tintCount = colourway ? colourway.tints.length : 1;
    if (!Number.isInteger(cmd.tint) || cmd.tint < 0 || cmd.tint >= tintCount) {
      return {
        rejected: {
          code: 'block.tintOutOfRange',
          message: `Tint index ${cmd.tint} is out of range for colourway ${doc.colourway} (0..${tintCount - 1}).`,
        },
      };
    }

    const newPages = doc.pages.map((p, idx) => {
      if (idx !== pageIndex) return p;
      return {
        ...p,
        pattern: p.pattern.map((b) => (b.id === cmd.id ? { ...b, tint: cmd.tint } : b)),
      };
    });

    return {
      document: {
        ...doc,
        pages: markEdited(newPages, pageIndex),
        edited: true,
      },
      warnings: [],
    };
  }

  if (
    cmd.type === 'setPageLayout' ||
    cmd.type === 'setPageContent' ||
    cmd.type === 'setPhoto' ||
    cmd.type === 'clearPhoto'
  ) {
    if (!doc) {
      return {
        rejected: { code: 'DOCUMENT_REQUIRED', message: 'A document is required to change a Page.' },
      };
    }
    const pageIndex = cmd.pageIndex ?? 0;
    const page = doc.pages[pageIndex];
    if (!page) {
      return { rejected: { code: 'page.unknown', message: `There is no Page at index ${pageIndex}.` } };
    }
    const withPage = (next: Page): Document => ({
      ...doc,
      pages: doc.pages.map((p, i) => (i === pageIndex ? next : p)),
    });
    // Sets or clears the content of a Page without leaving an `undefined` key behind.
    const withContent = (content: Page['content']): Page => {
      const { content: _old, ...rest } = page;
      return content ? { ...rest, content } : rest;
    };

    if (cmd.type === 'setPageLayout') {
      if (cmd.layout !== 'pattern' && !Object.hasOwn(LAYOUT_TABLE, cmd.layout)) {
        return { rejected: { code: 'layout.unknown', message: `Unknown Page layout: ${String(cmd.layout)}` } };
      }
      const layout: PageLayoutId = cmd.layout;
      const zone = layoutTextZone(doc, layout);
      const { textZone: _zone, layout: _layout, ...rest } = page;
      const withLayout = withPage({
        ...rest,
        ...(layout !== 'pattern' ? { layout } : {}),
        ...(zone ? { textZone: zone } : {}),
      });
      // An edited Pattern keeps its Blocks (the text-overlap Advisory warns); an unedited one is
      // regenerated around the new zone with the same seed.
      if (page.edited) return { document: withLayout, warnings: [] };
      const res = regeneratePage(withLayout, pageIndex, pageSeed(withLayout, pageIndex));
      return { document: { ...withLayout, pages: res.pages }, warnings: res.warnings };
    }

    if (cmd.type === 'setPageContent') {
      const problem = contentPatchProblem(cmd.content);
      if (problem) return { rejected: problem };
      return { document: withPage(withContent(mergeContent(page.content, cmd.content))), warnings: [] };
    }

    if (cmd.type === 'setPhoto') {
      const problem = photoProblem(cmd.photo);
      if (problem) return { rejected: problem };
      return { document: withPage(withContent(cleanContent({ ...page.content, photo: cmd.photo }))), warnings: [] };
    }

    const { photo: _photo, ...withoutPhoto } = page.content ?? {};
    return { document: withPage(withContent(cleanContent(withoutPhoto))), warnings: [] };
  }

  if (cmd.type === 'setTextZone' || cmd.type === 'clearTextZone') {
    if (!doc) {
      return {
        rejected: {
          code: 'DOCUMENT_REQUIRED',
          message: 'A document is required to change the text zone.',
        },
      };
    }
    let zone: TextZone | undefined;
    if (cmd.type === 'setTextZone') {
      const z = cmd.zone;
      const grid = gridFor(doc);
      if (z.mode !== 'clear' && z.mode !== 'flat') {
        return {
          rejected: { code: 'textZone.invalidMode', message: "Text zone mode must be 'clear' or 'flat'." },
        };
      }
      if (
        ![z.col, z.row, z.w, z.h].every(Number.isInteger) ||
        z.w < 1 ||
        z.h < 1 ||
        z.col < 0 ||
        z.row < 0 ||
        z.col + z.w > grid.cols ||
        z.row + z.h > grid.rows
      ) {
        return {
          rejected: {
            code: 'textZone.outOfPage',
            message: `Text zone (${z.col}, ${z.row}, ${z.w}x${z.h}) must be at least 1x1 cell and inside the grid (${grid.cols}x${grid.rows}).`,
          },
        };
      }
      zone = { col: z.col, row: z.row, w: z.w, h: z.h, mode: z.mode };
    }

    const pageIndex = cmd.pageIndex ?? 0;
    const base = doc.pages[pageIndex];
    if (!base) {
      return { rejected: { code: 'page.unknown', message: `There is no Page at index ${pageIndex}.` } };
    }
    const { textZone: _old, ...rest } = base;
    const withZone: Document = {
      ...doc,
      pages: doc.pages.map((p, i) => (i === pageIndex ? { ...rest, ...(zone ? { textZone: zone } : {}) } : p)),
    };
    // An edited Pattern keeps its Blocks; only the zone is stored.
    if (base.edited) return { document: withZone, warnings: [] };
    const res = regeneratePage(withZone, pageIndex, pageSeed(withZone, pageIndex));
    return { document: { ...withZone, pages: res.pages }, warnings: res.warnings };
  }

  if (cmd.type === 'addPage' || cmd.type === 'duplicatePage' || cmd.type === 'removePage' || cmd.type === 'movePage') {
    if (!doc) {
      return { rejected: { code: 'DOCUMENT_REQUIRED', message: 'A document is required to change its Pages.' } };
    }
    const count = doc.pages.length;
    const isIndex = (v: unknown, max: number, min = 0): v is number =>
      typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    const unknownPage = (index: unknown): Rejection => ({
      rejected: { code: 'page.unknown', message: `There is no Page at index ${String(index)} (the Document has ${count}).` },
    });

    if (cmd.type === 'addPage') {
      if (cmd.layout !== 'pattern' && !Object.hasOwn(LAYOUT_TABLE, cmd.layout)) {
        return { rejected: { code: 'layout.unknown', message: `Unknown Page layout: ${String(cmd.layout)}` } };
      }
      const after = cmd.afterIndex ?? count - 1;
      // -1 puts the new Page first.
      if (!isIndex(after, count - 1, -1)) return unknownPage(cmd.afterIndex);
      const zone = layoutTextZone(doc, cmd.layout);
      const seed = nextPageSeed(doc);
      const fresh: Document = {
        ...doc,
        pages: [
          ...doc.pages,
          {
            pattern: [],
            seed,
            edited: false,
            ...(cmd.layout !== 'pattern' ? { layout: cmd.layout } : {}),
            ...(zone ? { textZone: zone } : {}),
          },
        ],
      };
      const made = regeneratePage(fresh, count, seed);
      const page = made.pages[count]!;
      const pages = [...doc.pages.slice(0, after + 1), page, ...doc.pages.slice(after + 1)];
      return {
        document: { ...doc, pages },
        warnings: made.warnings.map((w) => ({ ...w, pageIndex: after + 1 })),
      };
    }

    if (cmd.type === 'duplicatePage') {
      if (!isIndex(cmd.pageIndex, count - 1)) return unknownPage(cmd.pageIndex);
      const copy = structuredClone(doc.pages[cmd.pageIndex]!);
      return {
        document: { ...doc, pages: [...doc.pages.slice(0, cmd.pageIndex + 1), copy, ...doc.pages.slice(cmd.pageIndex + 1)] },
        warnings: [],
      };
    }

    if (cmd.type === 'removePage') {
      if (!isIndex(cmd.pageIndex, count - 1)) return unknownPage(cmd.pageIndex);
      if (count === 1) {
        return { rejected: { code: 'page.last', message: 'The last Page of a Document cannot be removed.' } };
      }
      return { document: { ...doc, pages: doc.pages.filter((_, i) => i !== cmd.pageIndex) }, warnings: [] };
    }

    if (!isIndex(cmd.from, count - 1)) return unknownPage(cmd.from);
    if (!isIndex(cmd.to, count - 1)) return unknownPage(cmd.to);
    const pages = [...doc.pages];
    const [moved] = pages.splice(cmd.from, 1);
    pages.splice(cmd.to, 0, moved!);
    return { document: { ...doc, pages }, warnings: [] };
  }

  if (cmd.type === 'pickCandidate') {
    if (!doc) {
      return { rejected: { code: 'DOCUMENT_REQUIRED', message: 'A document is required to pick a Candidate.' } };
    }
    const pageIndex = cmd.pageIndex ?? 0;
    if (!doc.pages[pageIndex]) {
      return { rejected: { code: 'page.unknown', message: `There is no Page at index ${pageIndex}.` } };
    }
    const { seed, pattern } = cmd.candidate;
    if (typeof seed !== 'string' || seed === '') {
      return { rejected: { code: 'candidate.invalid', message: 'A Candidate needs the non-empty seed that drew it.' } };
    }
    const ids = new Set<string>();
    for (const block of pattern) {
      const problem = blockProblem(doc, block);
      if (problem) return problem;
      if (ids.has(block.id)) {
        return { rejected: { code: 'block.duplicateId', message: `Two Blocks of the Candidate share the id ${block.id}.` } };
      }
      ids.add(block.id);
    }
    // The user chose this exact Pattern, so a later Format or Density change remaps it instead of regenerating it.
    const pages = doc.pages.map((p, i) => (i === pageIndex ? { ...p, pattern, seed, edited: true } : p));
    // A Candidate is a new roll, which draws from the newest Reference set (ADR 0009).
    const generator = { ...doc.generator, referenceSet: LATEST_REFERENCE_SET };
    return { document: { ...doc, generator, pages }, warnings: [] };
  }

  if (cmd.type === 'loadDocument') {
    const validated = validateDocument(cmd.document);
    if ('error' in validated) {
      return {
        rejected: {
          code: validated.error.code,
          message: validated.error.message,
        },
      };
    }

    return {
      document: validated.document,
      warnings: [],
    };
  }

  return {
    rejected: {
      code: 'UNKNOWN_COMMAND',
      message: `Unknown command: ${(cmd as Command).type}`,
    },
  };
}
