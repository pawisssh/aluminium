import { composePhoto, type SceneFade, type ScenePhoto } from './composedScene.js';
import type { PxRect } from './layouts.js';
import type { Document } from './types.js';

/*
 * The Photo fade bake (GLOSSARY: Photo fade; ADR 0010; spec #67). A pure function from pixels to pixels: core never
 * decodes or encodes an image, so each host (the browser's canvas, Node) cuts the photo to its slot, calls this and
 * writes the result back out.
 */

/** RGBA pixels, 8 bits per channel, not premultiplied, row by row. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Bakes a Photo fade into `photo`, the photo's pixels already cut to its slot (`slot`, in Page px). The ramp in
 * `fade` is in Page px and is scaled to the photo's own pixels, so the same fade bakes the same at any resolution.
 *
 * The result is opaque: a pixel with some transparency is first laid over the fade colour. Each pixel is mixed
 * from the fade colour to the photo by the curve at the pixel's edge nearest the ramp's start (its left edge for Left
 * and Full, its bottom edge for Bottom), so the first pixel of the ramp is the fade colour exactly and every pixel from
 * the ramp's end on is the photo exactly. Every pixel wholly inside the fade's Logo notch (`fade.notch`, Page px) is
 * the fade colour exactly, whatever the ramp; a pixel the notch's edge crosses keeps the photo (rounded inward, so the
 * resampled image never bleeds the colour outside the notch; the serializer's rect covers the rest).
 */
export function bakeFade(photo: Rgba, fade: SceneFade, slot: PxRect): Rgba {
  const { width, height } = photo;
  const [br, bg, bb] = hexRgb(fade.colour);
  const out = new Uint8Array(width * height * 4);
  // The weight of the photo (0 = fade colour, 1 = photo) at a position along the fade's axis, in Page px. The ramp may
  // run either way (rightward for Left and Full, upward for Bottom): the span is signed, and a zero span is a cut.
  const alongY = fade.direction === 'bottom';
  const span = fade.end - fade.start;
  const weightAt = (page: number): number => {
    if (span === 0) return (alongY ? page <= fade.end : page >= fade.end) ? 1 : 0;
    return smoothstep((page - fade.start) / span);
  };
  // A pixel is weighed at its edge nearest `start`: rightward that is its left edge, upward its bottom edge.
  const weights = Array.from({ length: alongY ? height : width }, (_, n) =>
    alongY ? weightAt(slot.y + ((n + 1) * slot.h) / height) : weightAt(slot.x + (n * slot.w) / width)
  );
  // The logo notch: every pixel wholly inside it is the fade colour, whatever the ramp says. A pixel its edge crosses
  // keeps the photo, so resampling the image to the slot never bleeds the colour past the edge; the serializer's
  // hard-edged rect covers the inside part.
  const notch = fade.notch;
  const inside = (n: number, count: number, from: number, size: number, lo: number, hi: number): boolean =>
    from + (n * size) / count >= lo - 1e-9 && from + ((n + 1) * size) / count <= hi + 1e-9;
  const inNotchX = Array.from({ length: width }, (_, x) => !!notch && inside(x, width, slot.x, slot.w, notch.x, notch.x + notch.w));
  const inNotchY = Array.from({ length: height }, (_, y) => !!notch && inside(y, height, slot.y, slot.h, notch.y, notch.y + notch.h));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = inNotchX[x] && inNotchY[y] ? 0 : weights[alongY ? y : x]!;
      const i = (y * width + x) * 4;
      const a = photo.data[i + 3]! / 255;
      out[i] = Math.round(br + (photo.data[i]! - br) * a * k);
      out[i + 1] = Math.round(bg + (photo.data[i + 1]! - bg) * a * k);
      out[i + 2] = Math.round(bb + (photo.data[i + 2]! - bb) * a * k);
      out[i + 3] = 255;
    }
  }
  return { width, height, data: out };
}

// ---- The baker adapter ----------------------------------------------------------------------------------------------

/**
 * Everything that decides a baked photo: the imported image (`href`, its size), how it is cropped to its slot, the slot
 * in Page px and the fade. A baker caches by it; the same request always bakes the same pixels.
 */
export interface PhotoBakeRequest {
  /** The image as imported: a data URL. */
  href: string;
  /** The image's own size in px. */
  width: number;
  height: number;
  /** Share of the image cut off on each side, 0 to 1. */
  crop: ScenePhoto['crop'];
  slot: PxRect;
  fade: SceneFade;
}

/**
 * The photo baker adapter, the way the serializer takes a `Shaper`: a synchronous lookup from a request to the baked
 * image (a data URL of an opaque image), or undefined when it is not baked. Decoding and encoding are the host's:
 * the browser fills its cache asynchronously with a canvas; Node bakes at once. The serializer never bakes.
 */
export interface PhotoBaker {
  baked(request: PhotoBakeRequest): string | undefined;
}

/** Thrown by the serializer for an Article cover with a Photo fade that has no baked photo: it never writes the unbaked one. */
export class PhotoBakeError extends Error {
  readonly code = 'photo.bakeUnavailable';
  constructor(message: string) {
    super(message);
    this.name = 'PhotoBakeError';
  }
}

/** The bake request for a scene photo, or null when it has no Photo fade. */
export function bakeRequestOf(photo: ScenePhoto | undefined): PhotoBakeRequest | null {
  if (!photo?.fade) return null;
  return {
    href: photo.href,
    width: photo.width,
    height: photo.height,
    crop: photo.crop,
    slot: { x: photo.x, y: photo.y, w: photo.w, h: photo.h },
    fade: photo.fade,
  };
}

/** The bake request of Page `pageIndex`, or null when its photo has no Photo fade. Needs no text, so no shaper. */
export const photoBakeRequest = (doc: Document, pageIndex: number): PhotoBakeRequest | null => bakeRequestOf(composePhoto(doc, pageIndex));

/** The part of the imported image that fills the slot, in the image's own pixels (whole pixels, at least one). */
export function photoBakeCrop(request: PhotoBakeRequest): PxRect {
  const { width, height, crop } = request;
  const x = Math.min(width - 1, Math.round(width * crop.left));
  const y = Math.min(height - 1, Math.round(height * crop.top));
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.round(width * (1 - crop.left - crop.right)))),
    h: Math.max(1, Math.min(height - y, Math.round(height * (1 - crop.top - crop.bottom)))),
  };
}

/** A stable key for the request's settings (everything but the image itself): the cache key beside the image. */
export const photoBakeKey = (request: PhotoBakeRequest): string =>
  JSON.stringify([request.width, request.height, request.crop, request.slot, request.fade]);
