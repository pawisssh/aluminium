import type { Page, TextZone } from './types.js';

/** Most of a Clear Text zone's cells that Blocks may cover (a share of the zone's area). */
export const CLEAR_ZONE_MAX_OVERLAP = 0.15;

/** How many cells deep the zone's outer ring is; Blocks may only cover cells inside this ring. */
export const CLEAR_ZONE_RING_DEPTH = 1;

export interface ClearZoneOverlap {
  /** Zone cells covered by at least one Block. */
  covered: number;
  /** Zone area in cells. */
  area: number;
  /** covered / area. */
  share: number;
  /** True when a Block covers a cell deeper than the outer ring (where text sits). */
  reachesInterior: boolean;
  /** True when the overlap is within the allowance (always true without a Clear zone). */
  withinLimit: boolean;
}

const NONE: ClearZoneOverlap = { covered: 0, area: 0, share: 0, reachesInterior: false, withinLimit: true };

const inRing = (z: TextZone, c: number, r: number): boolean =>
  c - z.col < CLEAR_ZONE_RING_DEPTH ||
  z.col + z.w - 1 - c < CLEAR_ZONE_RING_DEPTH ||
  r - z.row < CLEAR_ZONE_RING_DEPTH ||
  z.row + z.h - 1 - r < CLEAR_ZONE_RING_DEPTH;

/**
 * Measures how much of a Page's Clear Text zone its Blocks cover. A Clear zone may be overlapped
 * slightly: at most CLEAR_ZONE_MAX_OVERLAP of its cells, all in the outer ring. A page with no zone
 * or a 'flat' zone has nothing to measure and is within the limit.
 */
export function measureClearZoneOverlap(page: Page): ClearZoneOverlap {
  const zone = page.textZone;
  if (!zone || zone.mode !== 'clear') return NONE;
  const area = zone.w * zone.h;
  const cells = new Set<string>();
  let reachesInterior = false;
  for (const b of page.pattern) {
    const c1 = Math.min(b.col + b.w, zone.col + zone.w);
    const r1 = Math.min(b.row + b.h, zone.row + zone.h);
    for (let c = Math.max(b.col, zone.col); c < c1; c++) {
      for (let r = Math.max(b.row, zone.row); r < r1; r++) {
        cells.add(`${c},${r}`);
        if (!inRing(zone, c, r)) reachesInterior = true;
      }
    }
  }
  const share = cells.size / area;
  return {
    covered: cells.size,
    area,
    share,
    reachesInterior,
    withinLimit: !reachesInterior && share <= CLEAR_ZONE_MAX_OVERLAP,
  };
}
