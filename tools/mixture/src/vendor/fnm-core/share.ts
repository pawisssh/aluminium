import { articleCoverProblem, DEFAULT_PHOTO_EDGE, FADE_DIRECTIONS, HIGHLIGHT_COLOURS, PHOTO_EDGES } from './articleCover.js';
import { colourwayForIndex, getColourway } from './constants.js';
import { LEGACY_COLOURWAY_IDS } from './colourway.js';
import { gridFor } from './grid.js';
import { generatePatternDetailed, PATTERN_FAMILIES } from './generator.js';
import { createRng } from './prng.js';
import { withoutPhoto } from './content.js';
import { isPageEdited, pageSeed, settlePages } from './pages.js';
import { validateDocument } from './serialization.js';
import type {
  ArticleCoverSettings,
  Block,
  DensityLevel,
  Document,
  FormatId,
  Page,
  PageContent,
  PageLayoutId,
  ShareLinkResult,
  Slope,
  TextZone,
} from './types.js';

/**
 * Leading version tag of a share link fragment, e.g. `1.<payload>`. Version 1 holds a Pattern only. Version 2
 * wraps a version 1 payload with each Page's layout and content: `2.<base64url of [payload, pageExtras]>`.
 * A link is written as version 1 whenever no Page has a layout or content, so those links stay as they were.
 */
const LINK_VERSION = 2;
/** Version 3 is a deck: `3.<base64url of [payload, deckExtras]>`, written whenever a Document has several Pages. */
const DECK_LINK_VERSION = 3;
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
const LAYOUT_IDS: readonly PageLayoutId[] = ['pattern', 'headline', 'cover', 'product-cover', 'section-divider', 'content', 'closing', 'article-cover'];

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

/** A Page's content for a link: 0, or short keys. Never the photo. */
function contentExtra(page: Page): unknown {
  const content = withoutPhoto(page.content);
  if (!content) return 0;
  const o: Record<string, unknown> = {};
  if (content.headline !== undefined) o.h = content.headline;
  if (content.secondary !== undefined) o.s = content.secondary;
  if (content.label !== undefined) o.l = content.label;
  if (content.ticker) o.t = [content.ticker.show ? 1 : 0, content.ticker.left, content.ticker.right];
  if (content.logo) o.g = content.logo.show ? 1 : 0;
  return o;
}

/**
 * A Page's layout and content for a link: 0, or [layout index, content], or on an Article cover with its settings
 * set [layout index, content, [Highlight colour index, Photo edge index, fade length, fade direction index]]
 * (HIGHLIGHT_COLOURS, PHOTO_EDGES, FADE_DIRECTIONS; trailing settings are left out when unset). Never the photo.
 */
function pageExtra(page: Page): unknown {
  const c = contentExtra(page);
  if (!page.layout && c === 0) return 0;
  const extra: unknown[] = [LAYOUT_IDS.indexOf(page.layout ?? 'pattern'), c];
  const settings = page.articleCover;
  if (settings?.highlight || settings?.photoEdge || settings?.fadeLength !== undefined || settings?.fadeDirection) {
    // Positional, and only what the Page sets is written: [Highlight index, Photo edge index, fade length in cells,
    // fade direction index]. A setting before a set one that is itself unset writes a filler that reads back as unset
    // or as the default: yellow (index 0) for the Highlight, the Fade edge (index 0 of PHOTO_EDGES) for the Photo edge,
    // and 0 for the length, which is outside 6 to 14 so it can only mean "no length set" (the default length depends
    // on the direction, so a filler of 6 or 10 would turn into an explicit length). A Photo edge and a direction are
    // written even when they are today's default, so a later change of default cannot change a saved link.
    const set: number[] = [HIGHLIGHT_COLOURS.indexOf(settings.highlight ?? 'yellow')];
    if (settings.photoEdge || settings.fadeLength !== undefined || settings.fadeDirection) {
      set.push(PHOTO_EDGES.indexOf(settings.photoEdge ?? DEFAULT_PHOTO_EDGE));
    }
    if (settings.fadeLength !== undefined || settings.fadeDirection) set.push(settings.fadeLength ?? 0);
    if (settings.fadeDirection) set.push(FADE_DIRECTIONS.indexOf(settings.fadeDirection));
    extra.push(set);
  }
  return extra;
}

/** A deck Page's extras: [layout index, content, seed, edited]. Every Page has them, so Pages differ after decoding. */
function deckExtra(doc: Document, index: number): unknown {
  const page = doc.pages[index]!;
  return [LAYOUT_IDS.indexOf(page.layout ?? 'pattern'), contentExtra(page), pageSeed(doc, index), isPageEdited(doc, index) ? 1 : 0];
}

/**
 * The longest link fragment (the part after `p=`) the app offers as a share link. Past it the link is too
 * long to paste into chat or mail safely, and the UI should offer a .fnm file instead. A one-Page Document
 * without text stays far below it.
 */
export const SHARE_LINK_MAX_LENGTH = 8000;

export interface ShareLinkEncoding {
  link: string;
  /** True when a Page held a photo: links never carry photos, so the recipient sees the Page without it. */
  photoDropped: boolean;
  /** True when `link` is longer than SHARE_LINK_MAX_LENGTH: offer a .fnm file instead. */
  tooLong: boolean;
}

/**
 * Encodes a Document as a compact, URL-safe string for the URL fragment: `1.<base64url of compact JSON>`
 * (see LINK_VERSION for composed Pages). The Colourway is stored by stable index, never RGB. An unedited
 * single-Page Document carries only its inputs (the Pattern is regenerated on decode); otherwise the Block
 * list is included too. A photo is never included; `photoDropped` says whether one was left out.
 */
export function encodeShareLinkDetailed(doc: Document): ShareLinkEncoding {
  const photoDropped = doc.pages.some((p) => p.content?.photo !== undefined);
  const payload = linkPayload(doc);
  const made = (link: string): ShareLinkEncoding => ({ link, photoDropped, tooLong: link.length > SHARE_LINK_MAX_LENGTH });
  // A transparent background rides as a third element after the extras, so it needs the wrapped form.
  const wrap = (extras: unknown[]): string =>
    JSON.stringify(doc.transparentBackground ? [payload, extras, 1] : [payload, extras]);
  // A deck (several Pages) is version 3: every Page's layout, content, seed and edited state.
  if (doc.pages.length > 1) {
    const extras = doc.pages.map((_, i) => deckExtra(doc, i));
    return made(`${DECK_LINK_VERSION}.${b64urlEncode(utf8Encode(wrap(extras)))}`);
  }
  const extras = doc.pages.map(pageExtra);
  if (extras.every((e) => e === 0) && !doc.transparentBackground) {
    return made(`1.${b64urlEncode(utf8Encode(JSON.stringify(payload)))}`);
  }
  return made(`${LINK_VERSION}.${b64urlEncode(utf8Encode(wrap(extras)))}`);
}

/** The link for a Document as a string; use encodeShareLinkDetailed to learn whether a photo was dropped. */
export function encodeShareLink(doc: Document): string {
  return encodeShareLinkDetailed(doc).link;
}

function linkPayload(doc: Document): unknown[] {
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
  // A chosen family rides in the same slot as [guidance, family index], so the lengths stay the same, and a
  // Reference set as [guidance, family index, set]; links made before sets have none and draw from set 1.
  const family = doc.generator.family ?? 'auto';
  const set = doc.generator.referenceSet;
  const g = doc.generator.guidance;
  const f = PATTERN_FAMILIES.indexOf(family);
  payload.push(set !== undefined ? [g, f, set] : family === 'auto' ? g : [g, f]);
  return payload;
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

/** Reads a Page's layout and content from a link; null when malformed (the Document validation does the rest). */
function pageExtraFromLink(
  v: unknown,
  deck = false
): { layout?: PageLayoutId; content?: PageContent; seed?: string; edited?: boolean; articleCover?: ArticleCoverSettings } | null {
  if (v === 0) return {};
  // A deck never holds an Article cover, so only a one-Page link has the optional settings element.
  if (!isArr(v) || !(deck ? v.length === 4 : v.length === 2 || v.length === 3) || !isInt(v[0])) return null;
  const layout = LAYOUT_IDS[v[0]];
  if (!layout) return null;
  const out: { layout?: PageLayoutId; content?: PageContent; seed?: string; edited?: boolean; articleCover?: ArticleCoverSettings } =
    layout === 'pattern' ? {} : { layout };
  if (v.length === 3) {
    const settings = v[2];
    if (layout !== 'article-cover' || !isArr(settings) || settings.length < 1 || settings.length > 4 || !settings.every(isInt)) return null;
    const highlight = HIGHLIGHT_COLOURS[settings[0] as number];
    if (!highlight) return null;
    out.articleCover = { highlight };
    if (settings.length > 1) {
      const photoEdge = PHOTO_EDGES[settings[1] as number];
      if (!photoEdge) return null;
      out.articleCover.photoEdge = photoEdge;
    }
    if (settings.length > 2) {
      // 0 is the filler for "no length set", written only to reach a fade direction after it.
      if (!(settings.length === 4 && settings[2] === 0)) {
        if (articleCoverProblem({ fadeLength: settings[2] })) return null;
        out.articleCover.fadeLength = settings[2] as number;
      }
    }
    if (settings.length > 3) {
      const fadeDirection = FADE_DIRECTIONS[settings[3] as number];
      if (!fadeDirection) return null;
      out.articleCover.fadeDirection = fadeDirection;
    }
  }
  if (deck) {
    if (typeof v[2] !== 'string' || !v[2] || (v[3] !== 0 && v[3] !== 1)) return null;
    out.seed = v[2];
    out.edited = v[3] === 1;
  }
  const c = v[1];
  if (c === 0) return out;
  if (typeof c !== 'object' || c === null || isArr(c)) return null;
  const rec = c as Record<string, unknown>;
  const content: PageContent = {};
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'h' || key === 's' || key === 'l') {
      if (typeof value !== 'string') return null;
      content[key === 'h' ? 'headline' : key === 's' ? 'secondary' : 'label'] = value;
    } else if (key === 't') {
      if (!isArr(value) || value.length !== 3 || (value[0] !== 0 && value[0] !== 1)) return null;
      if (typeof value[1] !== 'string' || typeof value[2] !== 'string') return null;
      content.ticker = { show: value[0] === 1, left: value[1], right: value[2] };
    } else if (key === 'g') {
      if (value !== 0 && value !== 1) return null;
      content.logo = { show: value === 1 };
    } else {
      return null;
    }
  }
  return { ...out, content };
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
  const version = Number(m[1]);
  if (version !== 1 && version !== LINK_VERSION && version !== DECK_LINK_VERSION) {
    return {
      error: {
        code: 'link.unsupportedVersion',
        message: `Share link version ${m[1]} is not supported (expected 1, ${LINK_VERSION} or ${DECK_LINK_VERSION})`,
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
  let extras: unknown[] | undefined;
  let transparentBackground = false;
  if (version === LINK_VERSION || version === DECK_LINK_VERSION) {
    if (!isArr(p) || (p.length !== 2 && p.length !== 3) || !isArr(p[1])) return invalid('Share link is not valid');
    if (p.length === 3 && p[2] !== 1) return invalid('Share link is not valid');
    transparentBackground = p.length === 3;
    extras = p[1];
    p = p[0];
  }
  if (!isArr(p) || ![10, 11, 12, 13].includes(p.length)) return invalid('Share link is not valid');
  const hasGuidance = p.length === 11 || p.length === 13;
  const last = hasGuidance ? p[p.length - 1] : 0;
  const slot = isArr(last) && (last.length === 2 || last.length === 3);
  const guidance = slot ? last[0] : last;
  const familyIndex = slot ? last[1] : 0;
  const family = isInt(familyIndex) ? PATTERN_FAMILIES[familyIndex] : undefined;
  const referenceSet = slot && last.length === 3 ? last[2] : undefined;
  if (!family || (isArr(last) && !slot)) return invalid('Share link is not valid');

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
  const rawPages: {
    pattern: Block[];
    textZone?: TextZone;
    layout?: PageLayoutId;
    content?: PageContent;
    seed?: string;
    edited?: boolean;
    articleCover?: ArticleCoverSettings;
  }[] = [];
  if (version === DECK_LINK_VERSION && inputsOnly) return invalid('Share link is not valid');
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

  if (extras) {
    if (extras.length !== rawPages.length) return invalid('Share link is not valid');
    for (let i = 0; i < rawPages.length; i++) {
      const extra = pageExtraFromLink(extras[i], version === DECK_LINK_VERSION);
      if (extra === null) return invalid('Share link is not valid');
      Object.assign(rawPages[i]!, extra);
    }
  }

  const raw = {
    version: 1,
    format,
    density,
    colourway: colourway.id,
    seed,
    generator: {
      slope: slopeId,
      blockCount,
      cornerMeetLimit,
      guidance,
      ...(family === 'auto' ? {} : { family }),
      ...(referenceSet === undefined ? {} : { referenceSet }),
    },
    ...(explicit === 0 ? {} : { blockCountExplicit: explicit === 2 }),
    pages: rawPages,
    ...(customSize ? { customSize } : {}),
    edited: !inputsOnly && p[11] === 1,
    ...(transparentBackground ? { transparentBackground: true } : {}),
  };
  const validated = validateDocument(raw);
  if ('error' in validated) return invalid(validated.error.message);
  const doc = validated.document;
  if (!inputsOnly) return { document: settlePages(doc) };

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
