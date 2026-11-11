import { composeScene, type ComposedScene, type SceneOutline, type SceneRect, type SceneText } from './composedScene.js';
import { LOGO_VIEWBOX, logoPathData } from './logo.js';
import { bakeRequestOf, PhotoBakeError, type PhotoBaker } from './photoBake.js';
import type { Shaper } from './text/index.js';
import type { Document } from './types.js';

export {
  TICKER_HEIGHT_OF_CAP,
  HEADLINE_MAX_OF_SHORT,
  SECONDARY_OF_HEADLINE,
  SECONDARY_MAX_OF_SHORT,
  CONTENT_SECONDARY_MAX_OF_SHORT,
  LABEL_MAX_OF_SHORT,
  TICKER_MAX_OF_SHORT,
} from './composedScene.js';

/*
 * The composed renderer (spec "Phase 3"; ADR 0008): the SVG serializer of a composed scene. Everything is drawn as
 * solid shapes and outlined text, so the SVG needs no fonts. The scene (composedScene.ts) decides what goes where;
 * this file only writes it out, in the scene's paint order:
 *   1. background and Blocks (crisp edges, as in the Pattern-only SVG);
 *   2. the photo, clipped to its slot;
 *   3. every Highlight box and Wick;
 *   4. the headline, secondary copy and label as <path>s;
 *   5. the Ticker: its strip, then its two texts;
 *   6. the wordmark.
 * On an Article cover with a photo (`photo.underBlocks`) the photo is drawn before the Blocks: the background,
 * the photo, its Step edge cuts (`photo-cut`) and its Logo notch (`photo-notch`), both in the background colour, then
 * the Blocks, and the rest as above.
 * No opacity attribute is ever written. Each drawn element carries `data-role` so tests and tools can find it.
 */

const fmt = (n: number): string => {
  const r = Math.round(n * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rect = (role: string, r: SceneRect): string =>
  `<rect data-role="${role}" x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="${r.fill}"/>`;

const pathEl = (o: SceneOutline): string => (o.d ? `<path data-role="${o.role}" d="${o.d}" fill="${o.fill}"/>` : '');

const outlinesOf = (texts: readonly SceneText[]): string[] => texts.flatMap((t) => t.outlines.map(pathEl));

/**
 * Write a scene out as an SVG with outlined text. The scene must have been composed with outlines. A photo with a
 * Photo fade is written from `baker`'s baked image; with no baker, or one that has not baked it, this throws a
 * `PhotoBakeError` rather than write the unbaked photo.
 */
export function sceneToSvg(scene: ComposedScene, baker?: PhotoBaker): string {
  const { width, height } = scene;
  const photo = scene.photo;
  const photoUnderBlocks = photo?.underBlocks === true;
  const background: string[] = scene.background ? [`<rect width="${width}" height="${height}" fill="${scene.background}"/>`] : [];
  const blocks: string[] = scene.blocks.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${b.fill}"/>`);
  const photoEls = (): string[] => {
    if (!photo) return [];
    const id = 'fnm-photo-clip';
    // A Photo fade is drawn from the baked image, which is already cut to the slot: never from the imported one.
    let href = photo.href;
    let fit = 'xMidYMid slice';
    const request = bakeRequestOf(photo);
    if (request) {
      if (!baker) throw new PhotoBakeError('This photo has a fade, which has to be baked into the image before it is written. Give the renderer a photo baker.');
      const baked = baker.baked(request);
      if (baked === undefined) throw new PhotoBakeError('The photo is not baked yet. Wait for its fade to be baked, then draw again.');
      href = baked;
      fit = 'none';
    }
    const els = [
      `<clipPath id="${id}"><rect x="${fmt(photo.x)}" y="${fmt(photo.y)}" width="${fmt(photo.w)}" height="${fmt(photo.h)}"/></clipPath>` +
        `<image data-role="photo" href="${escapeAttr(href)}" x="${fmt(photo.x)}" y="${fmt(photo.y)}" width="${fmt(photo.w)}" height="${fmt(photo.h)}" preserveAspectRatio="${fit}" clip-path="url(#${id})"/>`,
    ];
    if (photo.cuts?.length) els.push(`<g shape-rendering="crispEdges">${photo.cuts.map((c) => rect('photo-cut', c)).join('')}</g>`);
    // The logo notch is drawn even when it is baked: the baked image is resampled to the slot, the rect lands on the cell lines.
    if (photo.notch) els.push(`<g shape-rendering="crispEdges">${rect('photo-notch', photo.notch)}</g>`);
    return els;
  };

  const out: string[] = [];
  if (photoUnderBlocks) {
    // An Article cover: background, photo (with its cuts), then the Blocks over it.
    out.push(`<g shape-rendering="crispEdges">${background.join('')}</g>`, ...photoEls(), `<g shape-rendering="crispEdges">${blocks.join('')}</g>`);
  } else {
    out.push(`<g shape-rendering="crispEdges">${[...background, ...blocks].join('')}</g>`, ...photoEls());
  }

  const highlightRects = [...scene.highlights.map((r) => rect('highlight', r)), ...scene.wicks.map((r) => rect('wick', r))];
  out.push(`<g shape-rendering="crispEdges">${highlightRects.join('')}</g>`);
  out.push(...outlinesOf(scene.texts));

  if (scene.ticker) {
    out.push(`<g shape-rendering="crispEdges">${rect('ticker-strip', scene.ticker.strip)}</g>`);
    out.push(...outlinesOf(scene.ticker.texts));
  }

  const logo = scene.logo;
  if (logo) {
    const scale = logo.w / LOGO_VIEWBOX.width;
    out.push(pathEl({ role: 'logo', d: logoPathData(logo.x, logo.y, scale), fill: logo.fill }));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${out.join('')}</svg>`;
}

/** The composed SVG of a Page. `baker` supplies a photo's baked fade (see `sceneToSvg`). */
export function renderComposed(doc: Document, pageIndex: number, shaper: Shaper, baker?: PhotoBaker): string {
  return sceneToSvg(composeScene(doc, pageIndex, shaper), baker);
}
