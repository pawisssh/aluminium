import { articleCoverDocumentProblem, articleCoverProblem, colourPhotoProblem } from './articleCover.js';
import { getColourway, migrateColourwayId } from './constants.js';
import { cleanContent, contentProblem } from './content.js';
import { densityLevelsFor, FORMATS } from './formats.js';
import { isValidBlockSize, validateGeneratorParams } from './generator.js';
import { gridFor } from './grid.js';
import type {
  ArticleCoverSettings,
  Block,
  CustomSize,
  DensityLevel,
  DeserializeResult,
  Document,
  FormatId,
  GeneratorParams,
  Page,
  PageContent,
  PageLayoutId,
  TextZone,
  SerializedFile,
} from './types.js';

/**
 * File schema 2 adds Page `layout` and `content`. Schema 1 files hold neither and load unchanged as
 * Pattern only (no layout), so the Document itself stays at `version: 1`.
 * File schema 3 (decks) adds the Page `seed` and `edited` that a Document with several Pages carries, and the
 * layouts 'section-divider', 'content' and 'closing'. Schema 1 and 2 files hold none of it and load unchanged:
 * a Page with no seed or edited state of its own uses the Document's (see pages.ts).
 * File schema 4 adds the layout 'article-cover' and the Page `articleCover` it carries (ADR 0010). Earlier files
 * hold neither and load unchanged.
 */
export const CURRENT_SCHEMA_VERSION = 4;
export const CURRENT_APP_NAME = 'fnm-pattern-builder';

const ALLOWED_FILE_KEYS = new Set(['app', 'schema', 'document']);
const ALLOWED_DOC_KEYS = new Set([
  'version',
  'format',
  'density',
  'colourway',
  'seed',
  'generator',
  'blockCountExplicit',
  'pages',
  'customSize',
  'edited',
  'transparentBackground',
]);
const ALLOWED_PAGE_KEYS = new Set(['pattern', 'textZone', 'layout', 'content', 'seed', 'edited', 'articleCover']);
const PAGE_LAYOUTS: readonly PageLayoutId[] = ['pattern', 'headline', 'cover', 'product-cover', 'section-divider', 'content', 'closing', 'article-cover'];
const ALLOWED_GENERATOR_KEYS = new Set(['slope', 'blockCount', 'cornerMeetLimit', 'guidance', 'family', 'referenceSet']);
const ALLOWED_TEXT_ZONE_KEYS = new Set(['col', 'row', 'w', 'h', 'mode']);
const ALLOWED_BLOCK_KEYS = new Set(['id', 'col', 'row', 'w', 'h', 'tint']);
const ALLOWED_CUSTOM_SIZE_KEYS = new Set(['widthPx', 'heightPx']);

/** Returns a clean TextZone, or an error message. */
function validateTextZone(raw: unknown, grid: { cols: number; rows: number }, pIdx: number): TextZone | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return `Text zone on page ${pIdx} must be an object`;
  }
  const z = raw as Record<string, unknown>;
  for (const key of Object.keys(z)) {
    if (!ALLOWED_TEXT_ZONE_KEYS.has(key)) {
      return `Unexpected property in text zone on page ${pIdx}: '${key}'`;
    }
  }
  if (z.mode !== 'clear' && z.mode !== 'flat') {
    return `Text zone mode on page ${pIdx} must be 'clear' or 'flat'`;
  }
  const { col, row, w, h } = z;
  if (
    typeof col !== 'number' || typeof row !== 'number' || typeof w !== 'number' || typeof h !== 'number' ||
    ![col, row, w, h].every(Number.isInteger) ||
    w < 1 || h < 1 || col < 0 || row < 0 ||
    col + w > grid.cols || row + h > grid.rows
  ) {
    return `Text zone on page ${pIdx} must be whole cells, at least 1x1, inside the ${grid.cols}x${grid.rows} Grid`;
  }
  return { col, row, w, h, mode: z.mode };
}

/**
 * Validates the shape of a Document strictly.
 * Reuses existing domain validators (formats, density levels, colourway whitelist, Block sizes 1..Grid, and grid bounds).
 * Ensures colourways are referenced strictly by id/index and never RGB.
 */
export function validateDocument(rawDoc: unknown): DeserializeResult {
  if (!rawDoc || typeof rawDoc !== 'object' || Array.isArray(rawDoc)) {
    return {
      error: {
        code: 'file.invalid',
        message: 'Document must be a valid JSON object',
      },
    };
  }

  const doc = rawDoc as Record<string, unknown>;

  // Disallow extraneous properties on Document (such as tampered raw color values)
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_DOC_KEYS.has(key)) {
      return {
        error: {
          code: 'file.invalid',
          message: `Unexpected property in document: '${key}'`,
        },
      };
    }
  }

  // Version
  if (typeof doc.version !== 'number' || !Number.isInteger(doc.version)) {
    return {
      error: {
        code: 'file.invalid',
        message: 'Document version must be an integer',
      },
    };
  }
  if (doc.version > 1) {
    return {
      error: {
        code: 'file.unsupportedVersion',
        message: `Document version ${doc.version} is newer than supported version 1`,
      },
    };
  }
  if (doc.version < 1) {
    return {
      error: {
        code: 'file.invalid',
        message: `Invalid document version: ${doc.version}`,
      },
    };
  }

  // Format
  if (typeof doc.format !== 'string') {
    return {
      error: {
        code: 'file.invalid',
        message: 'Document format must be a string',
      },
    };
  }
  const formatDef = FORMATS.find((f) => f.id === doc.format);
  if (!formatDef) {
    return {
      error: {
        code: 'file.invalid',
        message: `Unknown format: '${doc.format}'`,
      },
    };
  }

  // Custom size
  let customSize: CustomSize | undefined;
  if (doc.format === 'custom') {
    if (!doc.customSize || typeof doc.customSize !== 'object' || Array.isArray(doc.customSize)) {
      return {
        error: {
          code: 'file.invalid',
          message: 'Custom format requires a customSize object',
        },
      };
    }
    const cs = doc.customSize as Record<string, unknown>;
    for (const key of Object.keys(cs)) {
      if (!ALLOWED_CUSTOM_SIZE_KEYS.has(key)) {
        return {
          error: {
            code: 'file.invalid',
            message: `Unexpected property in customSize: '${key}'`,
          },
        };
      }
    }
    const { widthPx, heightPx } = cs;
    if (
      typeof widthPx !== 'number' ||
      typeof heightPx !== 'number' ||
      !Number.isInteger(widthPx) ||
      !Number.isInteger(heightPx) ||
      widthPx < 64 ||
      widthPx > 8000 ||
      heightPx < 64 ||
      heightPx > 8000
    ) {
      return {
        error: {
          code: 'file.invalid',
          message: 'Custom format requires widthPx and heightPx integers between 64 and 8000',
        },
      };
    }
    customSize = { widthPx, heightPx };
  } else if (doc.customSize !== undefined) {
    return {
      error: {
        code: 'file.invalid',
        message: 'customSize is only allowed for custom format',
      },
    };
  }

  // Density
  if (typeof doc.density !== 'string') {
    return {
      error: {
        code: 'file.invalid',
        message: 'Document density must be a string',
      },
    };
  }
  const supportedLevels = densityLevelsFor(doc.format as FormatId, customSize);
  if (!supportedLevels.some((l) => l.level === doc.density)) {
    return {
      error: {
        code: 'file.invalid',
        message: `Density level '${doc.density}' is not supported for format '${doc.format}'`,
      },
    };
  }

  // Colourway (by id only, never RGB hex)
  if (typeof doc.colourway !== 'string') {
    return {
      error: {
        code: 'file.invalid',
        message: 'Colourway must be a string ID',
      },
    };
  }
  // A removed 3-colour Colourway (`X-100-50`) loads as `X-100`, with every Block tint clamped to 0.
  const colourwayId = migrateColourwayId(doc.colourway);
  const migratedColourway = colourwayId !== doc.colourway;
  const colourway = getColourway(colourwayId);
  if (!colourway) {
    return {
      error: {
        code: 'file.invalid',
        message: `Unknown colourway ID: '${doc.colourway}'`,
      },
    };
  }

  // Seed
  if (typeof doc.seed !== 'string') {
    return {
      error: {
        code: 'file.invalid',
        message: 'Seed must be a string',
      },
    };
  }

  // Edited
  if (typeof doc.edited !== 'boolean') {
    return {
      error: {
        code: 'file.invalid',
        message: 'Edited must be a boolean',
      },
    };
  }

  // Generator params
  const gen = doc.generator;
  if (!gen || typeof gen !== 'object' || Array.isArray(gen)) {
    return {
      error: { code: 'file.invalid', message: 'Generator must be an object' },
    };
  }
  const genRec = gen as Record<string, unknown>;
  for (const key of Object.keys(genRec)) {
    if (!ALLOWED_GENERATOR_KEYS.has(key)) {
      return {
        error: { code: 'file.invalid', message: `Unexpected property in generator: '${key}'` },
      };
    }
  }
  if (
    typeof genRec.slope !== 'string' ||
    typeof genRec.blockCount !== 'number' ||
    typeof genRec.cornerMeetLimit !== 'number'
  ) {
    return {
      error: {
        code: 'file.invalid',
        message: 'Generator requires slope (string), blockCount and cornerMeetLimit (numbers)',
      },
    };
  }
  const genProblem = validateGeneratorParams(genRec as Partial<GeneratorParams>);
  if (genProblem) {
    return { error: { code: 'file.invalid', message: `Invalid generator: ${genProblem}` } };
  }
  const generator: GeneratorParams = {
    slope: genRec.slope as GeneratorParams['slope'],
    blockCount: genRec.blockCount,
    cornerMeetLimit: genRec.cornerMeetLimit,
    // Files saved before Guidance existed keep their Patterns: guidance 0.
    guidance: genRec.guidance === undefined ? 0 : (genRec.guidance as number),
    // Files saved before the family choice (or with 'auto') let the seed choose.
    ...(genRec.family !== undefined && genRec.family !== 'auto' ? { family: genRec.family as GeneratorParams['family'] } : {}),
    // Files saved before Reference sets drew from set 1, as a missing set does.
    ...(genRec.referenceSet !== undefined ? { referenceSet: genRec.referenceSet as number } : {}),
  };

  if (doc.blockCountExplicit !== undefined && typeof doc.blockCountExplicit !== 'boolean') {
    return {
      error: { code: 'file.invalid', message: 'blockCountExplicit must be a boolean' },
    };
  }
  const blockCountExplicit = doc.blockCountExplicit as boolean | undefined;

  if (doc.transparentBackground !== undefined && typeof doc.transparentBackground !== 'boolean') {
    return {
      error: { code: 'file.invalid', message: 'transparentBackground must be a boolean' },
    };
  }

  // Pages
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
    return {
      error: {
        code: 'file.invalid',
        message: 'Pages must be a non-empty array',
      },
    };
  }

  // Validate pages and blocks
  const validatedDocForGrid: Document = {
    version: 1,
    format: doc.format as FormatId,
    density: doc.density as DensityLevel,
    colourway: colourwayId,
    seed: doc.seed,
    generator,
    pages: [],
    ...(customSize ? { customSize } : {}),
    edited: doc.edited,
  };
  const grid = gridFor(validatedDocForGrid);
  const validatedPages: Page[] = [];

  for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
    // Block ids are unique within a Page: every generated Pattern numbers its Blocks from block-1.
    const blockIds = new Set<string>();
    const rawPage = doc.pages[pIdx];
    if (!rawPage || typeof rawPage !== 'object' || Array.isArray(rawPage)) {
      return {
        error: {
          code: 'file.invalid',
          message: `Page at index ${pIdx} must be an object`,
        },
      };
    }

    const page = rawPage as Record<string, unknown>;
    for (const key of Object.keys(page)) {
      if (!ALLOWED_PAGE_KEYS.has(key)) {
        return {
          error: {
            code: 'file.invalid',
            message: `Unexpected property in page at index ${pIdx}: '${key}'`,
          },
        };
      }
    }

    if (!Array.isArray(page.pattern)) {
      return {
        error: {
          code: 'file.invalid',
          message: `Page pattern at index ${pIdx} must be an array`,
        },
      };
    }

    let textZone: TextZone | undefined;
    if (page.textZone !== undefined) {
      const zr = validateTextZone(page.textZone, grid, pIdx);
      if (typeof zr === 'string') return { error: { code: 'file.invalid', message: zr } };
      textZone = zr;
    }

    // 'pattern' is the absence of a layout, so a Pattern-only Page looks the same before and after Phase 3.
    let layout: PageLayoutId | undefined;
    if (page.layout !== undefined) {
      if (!PAGE_LAYOUTS.includes(page.layout as PageLayoutId)) {
        return { error: { code: 'file.invalid', message: `Unknown layout on page ${pIdx}: '${String(page.layout)}'` } };
      }
      if (page.layout !== 'pattern') layout = page.layout as PageLayoutId;
    }
    if (page.seed !== undefined && (typeof page.seed !== 'string' || page.seed === '')) {
      return { error: { code: 'file.invalid', message: `Seed on page ${pIdx} must be a non-empty string` } };
    }
    if (page.edited !== undefined && typeof page.edited !== 'boolean') {
      return { error: { code: 'file.invalid', message: `Edited on page ${pIdx} must be a boolean` } };
    }
    let articleCover: ArticleCoverSettings | undefined;
    if (page.articleCover !== undefined) {
      if (layout !== 'article-cover') {
        return { error: { code: 'file.invalid', message: `Page ${pIdx} has Article cover settings but is not an Article cover` } };
      }
      const problem = articleCoverProblem(page.articleCover);
      if (problem) return { error: { code: 'file.invalid', message: `Article cover settings on page ${pIdx}: ${problem.message}` } };
      articleCover = { ...(page.articleCover as ArticleCoverSettings) };
    }
    let content: PageContent | undefined;
    if (page.content !== undefined) {
      const problem = contentProblem(page.content);
      if (problem) return { error: { code: 'file.invalid', message: `Content on page ${pIdx}: ${problem.message}` } };
      content = cleanContent(page.content as PageContent);
    }

    const validatedBlocks: Block[] = [];
    for (let bIdx = 0; bIdx < page.pattern.length; bIdx++) {
      const rawBlock = page.pattern[bIdx];
      if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) {
        return {
          error: {
            code: 'file.invalid',
            message: `Block at index ${bIdx} on page ${pIdx} must be an object`,
          },
        };
      }

      const block = rawBlock as Record<string, unknown>;
      // Strict shape: no unexpected keys (e.g. no raw color/hex properties)
      for (const key of Object.keys(block)) {
        if (!ALLOWED_BLOCK_KEYS.has(key)) {
          return {
            error: {
              code: 'file.invalid',
              message: `Unexpected property in block at index ${bIdx}: '${key}'`,
            },
          };
        }
      }

      if (typeof block.id !== 'string' || block.id.trim() === '') {
        return {
          error: {
            code: 'file.invalid',
            message: `Block at index ${bIdx} must have a non-empty string id`,
          },
        };
      }
      if (blockIds.has(block.id)) {
        return {
          error: {
            code: 'file.invalid',
            message: `Duplicate block id '${block.id}'`,
          },
        };
      }
      blockIds.add(block.id);

      if (typeof block.col !== 'number' || !Number.isInteger(block.col) || block.col < 0) {
        return {
          error: {
            code: 'file.invalid',
            message: `Block '${block.id}' col must be a non-negative integer`,
          },
        };
      }

      if (typeof block.row !== 'number' || !Number.isInteger(block.row) || block.row < 0) {
        return {
          error: {
            code: 'file.invalid',
            message: `Block '${block.id}' row must be a non-negative integer`,
          },
        };
      }

      if (
        typeof block.w !== 'number' ||
        typeof block.h !== 'number' ||
        !isValidBlockSize(block.w, grid.cols) ||
        !isValidBlockSize(block.h, grid.rows)
      ) {
        return {
          error: {
            code: 'file.invalid',
            message: `Block '${block.id}' size ${block.w}x${block.h} is not a whole number of cells within a ${grid.cols}x${grid.rows} Grid`,
          },
        };
      }

      if (block.col + block.w > grid.cols || block.row + block.h > grid.rows) {
        return {
          error: {
            code: 'file.invalid',
            message: `Block '${block.id}' (${block.col},${block.row},${block.w},${block.h}) exceeds grid bounds (${grid.cols}x${grid.rows})`,
          },
        };
      }

      // Tint index check: must be integer within colourway's tint count
      const tint = migratedColourway && Number.isInteger(block.tint) ? 0 : block.tint;
      if (
        typeof tint !== 'number' ||
        !Number.isInteger(tint) ||
        tint < 0 ||
        tint >= colourway.tints.length
      ) {
        return {
          error: {
            code: 'file.invalid',
            message: `Block '${block.id}' tint index ${tint} is out of range for colourway '${doc.colourway}' (0..${colourway.tints.length - 1})`,
          },
        };
      }

      validatedBlocks.push({
        id: block.id,
        col: block.col,
        row: block.row,
        w: block.w,
        h: block.h,
        tint,
      });
    }

    validatedPages.push({
      pattern: validatedBlocks,
      ...(textZone ? { textZone } : {}),
      ...(layout ? { layout } : {}),
      ...(content ? { content } : {}),
      ...(articleCover ? { articleCover } : {}),
      ...(page.seed !== undefined ? { seed: page.seed as string } : {}),
      ...(page.edited !== undefined ? { edited: page.edited as boolean } : {}),
    });
  }

  const cleanDoc: Document = {
    version: 1,
    format: doc.format as FormatId,
    density: doc.density as DensityLevel,
    colourway: colourwayId,
    seed: doc.seed,
    generator,
    ...(blockCountExplicit !== undefined ? { blockCountExplicit } : {}),
    pages: validatedPages,
    ...(customSize ? { customSize } : {}),
    edited: doc.edited,
    ...(doc.transparentBackground === true ? { transparentBackground: true } : {}),
  };
  const coverProblem = articleCoverDocumentProblem(cleanDoc) ?? colourPhotoProblem(cleanDoc);
  if (coverProblem) return { error: { code: 'file.invalid', message: coverProblem } };

  return { document: cleanDoc };
}

/**
 * Serializes a Document into a versioned JSON string.
 * Top-level structure: { "app": "fnm-pattern-builder", "schema": 4, "document": { ... } }
 * The file keeps everything, photo included (share links drop the photo).
 * Colourways are referenced by id only, and tints by index only — never RGB hex.
 */
export function serialize(doc: Document): string {
  const file: SerializedFile = {
    app: CURRENT_APP_NAME,
    schema: CURRENT_SCHEMA_VERSION,
    document: {
      version: 1,
      format: doc.format,
      density: doc.density,
      colourway: doc.colourway,
      seed: doc.seed,
      generator: { slope: doc.generator.slope, blockCount: doc.generator.blockCount, cornerMeetLimit: doc.generator.cornerMeetLimit, guidance: doc.generator.guidance, ...(doc.generator.family && doc.generator.family !== 'auto' ? { family: doc.generator.family } : {}), ...(doc.generator.referenceSet !== undefined ? { referenceSet: doc.generator.referenceSet } : {}) },
      ...(doc.blockCountExplicit !== undefined ? { blockCountExplicit: doc.blockCountExplicit } : {}),
      pages: doc.pages.map((p) => {
        const content = cleanContent(p.content ?? {});
        return {
          pattern: p.pattern.map((b) => ({
            id: b.id,
            col: b.col,
            row: b.row,
            w: b.w,
            h: b.h,
            tint: b.tint,
          })),
          ...(p.textZone
            ? { textZone: { col: p.textZone.col, row: p.textZone.row, w: p.textZone.w, h: p.textZone.h, mode: p.textZone.mode } }
            : {}),
          ...(p.layout && p.layout !== 'pattern' ? { layout: p.layout } : {}),
          ...(content ? { content } : {}),
          ...(p.articleCover ? { articleCover: { ...p.articleCover } } : {}),
          ...(p.seed !== undefined ? { seed: p.seed } : {}),
          ...(p.edited !== undefined ? { edited: p.edited } : {}),
        };
      }),
      ...(doc.customSize ? { customSize: { widthPx: doc.customSize.widthPx, heightPx: doc.customSize.heightPx } } : {}),
      edited: doc.edited,
      ...(doc.transparentBackground ? { transparentBackground: true } : {}),
    },
  };

  return JSON.stringify(file, null, 2);
}

/**
 * Deserializes a versioned JSON string into a validated Document.
 * Returns { document } on success, or { error: { code, message } } on failure.
 * Codes:
 * - 'file.invalid': not valid JSON, wrong shape, missing fields, or invalid values.
 * - 'file.unsupportedVersion': schema or document version newer than supported.
 */
export function deserialize(text: string): DeserializeResult {
  if (typeof text !== 'string') {
    return {
      error: {
        code: 'file.invalid',
        message: 'File content must be a string',
      },
    };
  }

  const cleanText = text.replace(/^\uFEFF/, '').trim();
  if (!cleanText) {
    return {
      error: {
        code: 'file.invalid',
        message: 'File is empty',
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanText);
  } catch (err) {
    return {
      error: {
        code: 'file.invalid',
        message: `Invalid JSON: ${(err as Error).message}`,
      },
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      error: {
        code: 'file.invalid',
        message: 'File content must be a JSON object',
      },
    };
  }

  const fileObj = parsed as Record<string, unknown>;

  // Check unexpected file keys
  for (const key of Object.keys(fileObj)) {
    if (!ALLOWED_FILE_KEYS.has(key)) {
      return {
        error: {
          code: 'file.invalid',
          message: `Unexpected property in file: '${key}'`,
        },
      };
    }
  }

  // App name check
  if (fileObj.app !== CURRENT_APP_NAME) {
    return {
      error: {
        code: 'file.invalid',
        message: `Invalid app identifier: expected '${CURRENT_APP_NAME}', got '${String(fileObj.app)}'`,
      },
    };
  }

  // Schema version check
  if (typeof fileObj.schema !== 'number' || !Number.isInteger(fileObj.schema)) {
    return {
      error: {
        code: 'file.invalid',
        message: 'Schema version must be an integer',
      },
    };
  }

  if (fileObj.schema > CURRENT_SCHEMA_VERSION) {
    return {
      error: {
        code: 'file.unsupportedVersion',
        message: `Schema version ${fileObj.schema} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
      },
    };
  }

  if (fileObj.schema < 1) {
    return {
      error: {
        code: 'file.invalid',
        message: `Invalid schema version: ${fileObj.schema}`,
      },
    };
  }

  // Document check
  if (!fileObj.document) {
    return {
      error: {
        code: 'file.invalid',
        message: 'Missing document in file',
      },
    };
  }

  return validateDocument(fileObj.document);
}
