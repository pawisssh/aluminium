import type { PageContent, PageContentPatch, PageLayoutId } from './types.js';

/** Longest text a content field may hold (a guard for share links and files, far beyond any real headline). */
export const MAX_CONTENT_TEXT = 1000;

export interface ContentProblem {
  code: string;
  message: string;
}

const TEXT_KEYS = ['headline', 'secondary', 'label'] as const;
const CONTENT_KEYS = new Set<string>([...TEXT_KEYS, 'ticker', 'logo', 'photo']);
const PATCH_KEYS = new Set<string>([...TEXT_KEYS, 'ticker', 'logo']);
const TICKER_KEYS = new Set(['show', 'left', 'right']);
const LOGO_KEYS = new Set(['show']);
const PHOTO_KEYS = new Set(['src', 'width', 'height', 'colour']);

/** `image/*` raster data URL; SVG is refused because the photo becomes black-and-white pixels. */
const IMAGE_DATA_URL = /^data:image\/(?!svg)[a-z0-9.+-]+(;[a-z0-9=._+-]+)*,.+/is;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Why `photo` cannot be a Page photo, or null when it can. */
export function photoProblem(photo: unknown): ContentProblem | null {
  if (!isRecord(photo)) return { code: 'photo.invalid', message: 'A photo must be an object with src, width and height.' };
  const extra = Object.keys(photo).find((k) => !PHOTO_KEYS.has(k));
  if (extra) return { code: 'photo.invalid', message: `Unexpected property in photo: '${extra}'` };
  if (typeof photo.src !== 'string' || !IMAGE_DATA_URL.test(photo.src)) {
    return { code: 'photo.notImageDataUrl', message: 'The photo must be an image data URL (data:image/...).' };
  }
  const { width, height } = photo;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return { code: 'photo.invalidSize', message: 'The photo width and height must be positive whole pixels.' };
  }
  if (photo.colour !== undefined && photo.colour !== true) {
    return { code: 'photo.invalid', message: 'A photo is in colour (colour: true) or, when the flag is absent, black and white.' };
  }
  return null;
}

function textProblem(key: string, v: unknown): ContentProblem | null {
  if (typeof v !== 'string') return { code: 'content.invalid', message: `${key} must be text.` };
  if (v.length > MAX_CONTENT_TEXT) {
    return { code: 'content.tooLong', message: `${key} is longer than ${MAX_CONTENT_TEXT} characters.` };
  }
  return null;
}

function nestedProblem(
  key: 'ticker' | 'logo',
  v: unknown,
  allowed: Set<string>,
  complete: boolean
): ContentProblem | null {
  if (!isRecord(v)) return { code: 'content.invalid', message: `${key} must be an object.` };
  for (const k of Object.keys(v)) {
    if (!allowed.has(k)) return { code: 'content.invalid', message: `Unexpected property in ${key}: '${k}'` };
  }
  for (const k of allowed) {
    if (v[k] === undefined) {
      if (complete) return { code: 'content.invalid', message: `${key}.${k} is required.` };
      continue;
    }
    if (k === 'show') {
      if (typeof v.show !== 'boolean') return { code: 'content.invalid', message: `${key}.show must be true or false.` };
    } else {
      const p = textProblem(`${key}.${k}`, v[k]);
      if (p) return p;
    }
  }
  return null;
}

/** Why a (complete) stored content object is invalid, or null. Photo included. */
export function contentProblem(raw: unknown): ContentProblem | null {
  if (!isRecord(raw)) return { code: 'content.invalid', message: 'Page content must be an object.' };
  for (const k of Object.keys(raw)) {
    if (!CONTENT_KEYS.has(k)) return { code: 'content.invalid', message: `Unexpected property in content: '${k}'` };
  }
  for (const k of TEXT_KEYS) {
    if (raw[k] !== undefined) {
      const p = textProblem(k, raw[k]);
      if (p) return p;
    }
  }
  if (raw.ticker !== undefined) {
    const p = nestedProblem('ticker', raw.ticker, TICKER_KEYS, true);
    if (p) return p;
  }
  if (raw.logo !== undefined) {
    const p = nestedProblem('logo', raw.logo, LOGO_KEYS, true);
    if (p) return p;
  }
  if (raw.photo !== undefined) return photoProblem(raw.photo);
  return null;
}

/** Why a content patch is invalid, or null. A patch holds no photo: that is `setPhoto`. */
export function contentPatchProblem(raw: unknown): ContentProblem | null {
  if (!isRecord(raw)) return { code: 'content.invalid', message: 'Page content must be an object.' };
  if (raw.photo !== undefined) {
    return { code: 'content.photoNotAllowed', message: 'Set the photo with setPhoto, not setPageContent.' };
  }
  for (const k of Object.keys(raw)) {
    if (!PATCH_KEYS.has(k)) return { code: 'content.invalid', message: `Unexpected property in content: '${k}'` };
  }
  for (const k of TEXT_KEYS) {
    if (raw[k] !== undefined) {
      const p = textProblem(k, raw[k]);
      if (p) return p;
    }
  }
  if (raw.ticker !== undefined) {
    const p = nestedProblem('ticker', raw.ticker, TICKER_KEYS, false);
    if (p) return p;
  }
  if (raw.logo !== undefined) {
    const p = nestedProblem('logo', raw.logo, LOGO_KEYS, false);
    if (p) return p;
  }
  return null;
}

/** Canonical content: empty text is absent, and a content with nothing in it is absent too. */
export function cleanContent(content: PageContent): PageContent | undefined {
  const out: PageContent = {};
  for (const k of TEXT_KEYS) {
    const v = content[k];
    if (v !== undefined && v !== '') out[k] = v;
  }
  if (content.ticker) out.ticker = { show: content.ticker.show, left: content.ticker.left, right: content.ticker.right };
  if (content.logo) out.logo = { show: content.logo.show };
  if (content.photo) {
    out.photo = {
      src: content.photo.src,
      width: content.photo.width,
      height: content.photo.height,
      ...(content.photo.colour ? { colour: true as const } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Shallow merge of a validated patch into content; ticker and logo merge field by field. */
export function mergeContent(base: PageContent | undefined, patch: PageContentPatch): PageContent | undefined {
  const next: PageContent = { ...base };
  for (const k of TEXT_KEYS) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  if (patch.ticker) {
    next.ticker = { show: false, left: '', right: '', ...base?.ticker, ...patch.ticker };
  }
  if (patch.logo) {
    next.logo = { show: true, ...base?.logo, ...patch.logo };
  }
  return cleanContent(next);
}

/** The same content with the photo left out. */
export function withoutPhoto(content: PageContent | undefined): PageContent | undefined {
  if (!content?.photo) return content;
  const { photo: _photo, ...rest } = content;
  return cleanContent(rest);
}

/**
 * The content a Page of `layout` may hold: the brand guideline allows only a black-and-white photo, and an Article cover
 * is the one layout that takes a colour one (ADR 0010). On any other layout a colour photo is left out and the rest of the
 * content stays. The one place this rule lives: the commands, Create's copy of the Editor Page and the web all use it.
 */
export function contentAllowedOn(layout: PageLayoutId | undefined, content: PageContent | undefined): PageContent | undefined {
  return content?.photo?.colour && layout !== 'article-cover' ? withoutPhoto(content) : content;
}
