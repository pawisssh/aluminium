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
import { gridFor } from './grid.js';
import { createRng, generateRandomSeed } from './prng.js';
import { checkPatternRules, repairPatternRules } from './patternRules.js';
import { validateDocument } from './serialization.js';
import type { Block, Command, Document, Grid, Page, Rejection, TextZone, Warning } from './types.js';
import { computeWarnings } from './warnings.js';

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

/** Format/Density change: re-maps an edited Pattern, otherwise regenerates with the same seed. */
function applyGridChange(doc: Document, changed: Document): { document: Document; warnings: Warning[] } {
  const next = rescaleZone(doc, withDensityDefaults(changed));
  if (doc.edited) {
    const oldGrid = gridFor(doc);
    const newGrid = gridFor(next);
    next.pages = next.pages.map((p) => {
      let pattern = p.pattern.map((b) => remapBlock(b, oldGrid, newGrid));
      reconnectEdges(p.pattern, pattern, newGrid);
      // A remap that broke the Pattern rules (a Pattern that followed them before) is repaired
      // by sliding masses, keeping every Block; if that fails too, computeWarnings warns.
      if (checkPatternRules(p.pattern, oldGrid).ok && !checkPatternRules(pattern, newGrid).ok) {
        const repaired = repairPatternRules(pattern, newGrid);
        if (repaired && checkPatternRules(repaired, newGrid).ok) pattern = repaired;
      }
      return { ...p, pattern };
    });
    return { document: { ...next, edited: true }, warnings: [] };
  }
  const res = regenerate(next, next.seed);
  next.pages = res.pages;
  return { document: { ...next, edited: false }, warnings: res.warnings };
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

const FLAT_FALLBACK: Warning = {
  code: 'textZone.flatFallback',
  message: 'No single Block could cover the Text zone, so it was kept clear instead.',
};

/** Regenerates the Pattern from `seed`, keeping page 0's Text zone; warns if 'flat' fell back to 'clear'. */
function regenerate(doc: Document, seed: string): { pages: Page[]; warnings: Warning[] } {
  const textZone = doc.pages[0]?.textZone;
  const { blocks, flatFallback } = generatePatternDetailed(
    gridFor(doc),
    getColourway(doc.colourway)!,
    createRng(seed),
    doc.generator,
    textZone ? { textZone } : {}
  );
  return {
    pages: [{ ...doc.pages[0], pattern: blocks }],
    warnings: flatFallback ? [FLAT_FALLBACK] : [],
  };
}

/** Maps the Text zone onto a new Grid proportionally, so it stays inside the Page. */
function rescaleZone(doc: Document, next: Document): Document {
  const zone = doc.pages[0]?.textZone;
  if (!zone) return next;
  const from = gridFor(doc);
  const to = gridFor(next);
  const col = Math.min(to.cols - 1, Math.round((zone.col * to.cols) / from.cols));
  const row = Math.min(to.rows - 1, Math.round((zone.row * to.rows) / from.rows));
  const w = Math.min(to.cols - col, Math.max(1, Math.round((zone.w * to.cols) / from.cols)));
  const h = Math.min(to.rows - row, Math.max(1, Math.round((zone.h * to.rows) / from.rows)));
  return { ...next, pages: next.pages.map((p, i) => (i === 0 ? { ...p, textZone: { ...zone, col, row, w, h } } : p)) };
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
  const res = executeCommand(doc, cmd);
  if ('rejected' in res) return res;
  // Advisory warnings never block: they are appended to any command-specific warnings.
  return { document: res.document, warnings: [...computeWarnings(res.document), ...res.warnings] };
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

    return {
      document: { ...newDoc, pages: regenerate(newDoc, seed).pages },
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

    const seed = cmd.seed !== undefined ? cmd.seed : generateRandomSeed();
    const regen = regenerate(doc, seed);

    const newDoc: Document = {
      ...doc,
      seed,
      pages: regen.pages,
      edited: false,
    };

    return {
      document: newDoc,
      warnings: regen.warnings,
    };
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
      edited: false,
    };
    const regen = regenerate(next, next.seed);
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

    const pageIndex = cmd.pageIndex ?? 0;
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
    if (pageIndex < newPages.length) {
      newPages[pageIndex] = {
        ...newPages[pageIndex]!,
        pattern: [...newPages[pageIndex]!.pattern, newBlock],
      };
    } else {
      newPages.push({ pattern: [newBlock] });
    }

    return {
      document: {
        ...doc,
        pages: newPages,
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
        pages: newPages,
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
        pages: newPages,
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
        pages: newPages,
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
        pages: newPages,
        edited: true,
      },
      warnings: [],
    };
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

    const base = doc.pages[0] ?? { pattern: [] };
    const { textZone: _old, ...rest } = base;
    const withZone: Document = {
      ...doc,
      pages: [{ ...rest, ...(zone ? { textZone: zone } : {}) }, ...doc.pages.slice(1)],
    };
    // An edited Pattern keeps its Blocks; only the zone is stored.
    if (doc.edited) return { document: withZone, warnings: [] };
    const res = regenerate(withZone, withZone.seed);
    return { document: { ...withZone, pages: [res.pages[0]!, ...withZone.pages.slice(1)] }, warnings: res.warnings };
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
