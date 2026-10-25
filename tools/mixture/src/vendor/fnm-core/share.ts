import { colourwayForIndex, getColourway } from './constants.js';
import { LEGACY_COLOURWAY_IDS } from './colourway.js';
import { gridFor } from './grid.js';
import { generatePatternDetailed, PATTERN_FAMILIES } from './generator.js';
import { createRng } from './prng.js';
import { validateDocument } from './serialization.js';
import type {
  Block,
  DensityLevel,
  Document,
  FormatId,
  Page,
  ShareLinkResult,
  Slope,
  TextZone,
} from './types.js';

/** Leading version tag of a share link fragment, e.g. `1.<payload>`. */
const LINK_VERSION = 1;
const MAX_FRAGMENT_LENGTH = 100_000;

// Fixed orders: part of the link format. Only ever append.
const FORMAT_IDS: readonly FormatId[] = [
  'square',
  'portrait-4-5',
  'story-9-16',
  'screen-16-9',
  'a4-portrait',
  'a4-landscape',
  'link-1-91',
  'custom',
];
const DENSITIES: readonly DensityLevel[] = ['coarse', 'medium', 'fine', 'extra-fine'];
const SLOPE_IDS: readonly Slope[] = ['flat', 'half', '75'];
const MODES: readonly TextZone['mode'][] = ['clear', 'flat'];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** Strict UTF-8 decode; returns null on malformed input. */
function utf8Decode(bytes: number[]): string | null {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    const n = b < 0x80 ? 0 : b >= 0xc2 && b < 0xe0 ? 1 : b >= 0xe0 && b < 0xf0 ? 2 : b >= 0xf0 && b < 0xf5 ? 3 : -1;
    if (n < 0 || i + n >= bytes.length + (n === 0 ? 1 : 0)) return null;
    let c = n === 0 ? b : b & (0x3f >> n);
    for (let k = 1; k <= n; k++) {
      const cb = bytes[i + k]!;
      if ((cb & 0xc0) !== 0x80) return null;
      c = (c << 6) | (cb & 63);
    }
    const min = [0, 0x80, 0x800, 0x10000][n]!;
    if (c < min || c > 0x10ffff || (c >= 0xd800 && c < 0xe000)) return null;
    out += String.fromCodePoint(c);
    i += n + 1;
  }
  return out;
}

function b64urlEncode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
}

function b64urlDecode(text: string): number[] | null {
  if (text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return acc === 0 ? bytes : null;
}

const zoneToArray = (z: TextZone | undefined) =>
  z ? [z.col, z.row, z.w, z.h, MODES.indexOf(z.mode)] : 0;

const blockToArray = (b: Block, i: number) => {
  const a: (number | string)[] = [b.col, b.row, b.w, b.h, b.tint];
  if (b.id !== `block-${i + 1}`) a.push(b.id);
  return a;
};

/**
 * Encodes a Document as a compact, URL-safe string for the URL fragment: `1.<base64url of compact JSON>`.
 * The Colourway is stored by stable index, never RGB. An unedited single-Page Document carries only its
 * inputs (the Pattern is regenerated on decode); otherwise the Block list is included too.
 */
export function encodeShareLink(doc: Document): string {
  const colourway = getColourway(doc.colourway);
  if (!colourway) throw new Error(`Unknown colourway: ${doc.colourway}`);
  const inputsOnly = !doc.edited && doc.pages.length === 1;
  const payload: unknown[] = [
    FORMAT_IDS.indexOf(doc.format),
    DENSITIES.indexOf(doc.density),
    colourway.index,
    SLOPE_IDS.indexOf(doc.generator.slope),
    doc.generator.blockCount,
    doc.generator.cornerMeetLimit,
    doc.blockCountExplicit === undefined ? 0 : doc.blockCountExplicit ? 2 : 1,
    doc.seed,
    inputsOnly ? zoneToArray(doc.pages[0]?.textZone) : 0,
    doc.customSize ? [doc.customSize.widthPx, doc.customSize.heightPx] : 0,
  ];
  if (!inputsOnly) {
    payload.push(
      doc.pages.map((p) => [zoneToArray(p.textZone), p.pattern.map(blockToArray)]),
      doc.edited ? 1 : 0
    );
  }
  // Guidance goes last: links made before it existed are 10 or 12 long and decode with guidance 0.
  // A chosen family rides in the same slot as [guidance, family index], so the lengths stay the same.
  const family = doc.generator.family ?? 'auto';
  payload.push(family === 'auto' ? doc.generator.guidance : [doc.generator.guidance, PATTERN_FAMILIES.indexOf(family)]);
  return `${LINK_VERSION}.${b64urlEncode(utf8Encode(JSON.stringify(payload)))}`;
}

const invalid = (message: string): ShareLinkResult => ({ error: { code: 'link.invalid', message } });

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

function zoneFromArray(v: unknown): TextZone | undefined | null {
  if (v === 0) return undefined;
  if (!isArr(v) || v.length !== 5 || !v.every(isInt)) return null;
  const mode = MODES[v[4] as number];
  return mode ? { col: v[0] as number, row: v[1] as number, w: v[2] as number, h: v[3] as number, mode } : null;
}

/**
 * Decodes a share link fragment (the value after `p=`).
 * Errors: 'link.unsupportedVersion' for an unknown version tag, 'link.invalid' for anything else
 * malformed or failing the same validation as a loaded .fnm file.
 */
export function decodeShareLink(fragment: string): ShareLinkResult {
  if (typeof fragment !== 'string' || fragment.length > MAX_FRAGMENT_LENGTH) {
    return invalid('Share link is not valid');
  }
  const m = /^(\d{1,6})\.([A-Za-z0-9_-]*)$/.exec(fragment);
  if (!m) return invalid('Share link is not valid');
  if (Number(m[1]) !== LINK_VERSION) {
    return {
      error: {
        code: 'link.unsupportedVersion',
        message: `Share link version ${m[1]} is not supported (expected ${LINK_VERSION})`,
      },
    };
  }
  const bytes = b64urlDecode(m[2]!);
  const text = bytes && utf8Decode(bytes);
  let p: unknown;
  try {
    p = text ? JSON.parse(text) : undefined;
  } catch {
    p = undefined;
  }
  if (!isArr(p) || ![10, 11, 12, 13].includes(p.length)) return invalid('Share link is not valid');
  const hasGuidance = p.length === 11 || p.length === 13;
  const last = hasGuidance ? p[p.length - 1] : 0;
  const guidance = isArr(last) && last.length === 2 ? last[0] : last;
  const familyIndex = isArr(last) && last.length === 2 ? last[1] : 0;
  const family = isInt(familyIndex) ? PATTERN_FAMILIES[familyIndex] : undefined;
  if (!family || (isArr(last) && last.length !== 2)) return invalid('Share link is not valid');

  const [fmt, den, cw, slope, blockCount, cornerMeetLimit, explicit, seed, zone, custom] = p;
  const format = isInt(fmt) ? FORMAT_IDS[fmt] : undefined;
  const density = isInt(den) ? DENSITIES[den] : undefined;
  const slopeId = isInt(slope) ? SLOPE_IDS[slope] : undefined;
  const colourway = isInt(cw) ? colourwayForIndex(cw) : undefined;
  if (!format || !density || !slopeId || !colourway || typeof seed !== 'string' || ![0, 1, 2].includes(explicit as number)) {
    return invalid('Share link is not valid');
  }
  let customSize: { widthPx: number; heightPx: number } | undefined;
  if (custom !== 0) {
    if (!isArr(custom) || custom.length !== 2 || !custom.every(isInt)) return invalid('Share link is not valid');
    customSize = { widthPx: custom[0] as number, heightPx: custom[1] as number };
  }

  const inputsOnly = p.length <= 11;
  const rawPages: { pattern: Block[]; textZone?: TextZone }[] = [];
  if (inputsOnly) {
    const textZone = zoneFromArray(zone);
    if (textZone === null) return invalid('Share link is not valid');
    rawPages.push({ pattern: [], ...(textZone ? { textZone } : {}) });
  } else {
    const pages = p[10];
    if (!isArr(pages) || (p[11] !== 0 && p[11] !== 1)) return invalid('Share link is not valid');
    for (const rp of pages) {
      if (!isArr(rp) || rp.length !== 2 || !isArr(rp[1])) return invalid('Share link is not valid');
      const textZone = zoneFromArray(rp[0]);
      if (textZone === null) return invalid('Share link is not valid');
      const pattern: Block[] = [];
      for (let i = 0; i < rp[1].length; i++) {
        const b = rp[1][i];
        if (!isArr(b) || (b.length !== 5 && b.length !== 6) || !b.slice(0, 5).every(isInt)) {
          return invalid('Share link is not valid');
        }
        const id = b.length === 6 ? b[5] : `block-${i + 1}`;
        if (typeof id !== 'string') return invalid('Share link is not valid');
        // A removed 3-colour Colourway has one Tint now: its Blocks clamp to 0.
        const tint = isInt(cw) && LEGACY_COLOURWAY_IDS.has(cw) ? 0 : (b[4] as number);
        pattern.push({ id, col: b[0] as number, row: b[1] as number, w: b[2] as number, h: b[3] as number, tint });
      }
      rawPages.push({ pattern, ...(textZone ? { textZone } : {}) });
    }
  }

  const raw = {
    version: 1,
    format,
    density,
    colourway: colourway.id,
    seed,
    generator: { slope: slopeId, blockCount, cornerMeetLimit, guidance, ...(family === 'auto' ? {} : { family }) },
    ...(explicit === 0 ? {} : { blockCountExplicit: explicit === 2 }),
    pages: rawPages,
    ...(customSize ? { customSize } : {}),
    edited: !inputsOnly && p[11] === 1,
  };
  const validated = validateDocument(raw);
  if ('error' in validated) return invalid(validated.error.message);
  const doc = validated.document;
  if (!inputsOnly) return { document: doc };

  const textZone = doc.pages[0]?.textZone;
  const { blocks } = generatePatternDetailed(
    gridFor(doc),
    colourway,
    createRng(doc.seed),
    doc.generator,
    textZone ? { textZone } : {}
  );
  const page: Page = { ...doc.pages[0]!, pattern: blocks };
  return { document: { ...doc, pages: [page] } };
}
