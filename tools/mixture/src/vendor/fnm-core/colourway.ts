import type { Colourway, ColourwayGroup } from './types.js';

export type BrandColourName =
  | 'navy'
  | 'grey'
  | 'yellow'
  | 'white'
  | 'green'
  | 'blue'
  | 'purple'
  | 'red'
  | 'orange';

export const BRAND_COLOUR_TABLE = {
  navy: ['#01172B', '#415160', '#808B95', '#C0C5CA'],
  grey: ['#A6BFCC', '#BCCFD9', '#D3DFE6', '#E9EFF2'],
  yellow: ['#F2F93C', '#F5FB6D', '#F8FC9E', '#FCFECE'],
  white: ['#FFFFFF'],
  green: ['#00E76B', '#2EFF8F', '#74FFB4', '#B9FFDA'],
  blue: ['#50CFFF', '#7CDBFF', '#A7E7FF', '#D3F3FF'],
  purple: ['#AA46C3', '#BF74D2', '#D4A3E1', '#EAD1F0'],
  red: ['#F73232', '#F96565', '#FB9999', '#FDCCCC'],
  orange: ['#F26414', '#F58B4F', '#F9B28A', '#FCD8C4'],
} as const;

export const BRAND_COLOURS = {
  navy: { 100: '#01172B', 75: '#415160', 50: '#808B95', 25: '#C0C5CA' },
  grey: { 100: '#A6BFCC', 75: '#BCCFD9', 50: '#D3DFE6', 25: '#E9EFF2' },
  yellow: { 100: '#F2F93C', 75: '#F5FB6D', 50: '#F8FC9E', 25: '#FCFECE' },
  white: { 100: '#FFFFFF' },
  green: { 100: '#00E76B', 75: '#2EFF8F', 50: '#74FFB4', 25: '#B9FFDA' },
  blue: { 100: '#50CFFF', 75: '#7CDBFF', 50: '#A7E7FF', 25: '#D3F3FF' },
  purple: { 100: '#AA46C3', 75: '#BF74D2', 50: '#D4A3E1', 25: '#EAD1F0' },
  red: { 100: '#F73232', 75: '#F96565', 50: '#FB9999', 25: '#FDCCCC' },
  orange: { 100: '#F26414', 75: '#F58B4F', 50: '#F9B28A', 25: '#FCD8C4' },
} as const;

export const DEFAULT_COLOURWAY_ID = 'navy__yellow-100';

function determineTextColours(bgColour: BrandColourName, bgTint: number): string[] {
  // light backgrounds (White, Grey, Yellow, any 25 tint) take Navy
  if (bgTint === 25 || bgColour === 'white' || bgColour === 'grey' || bgColour === 'yellow') {
    return [BRAND_COLOURS.navy[100]!];
  }
  // Yellow/Green/Blue backgrounds take Navy
  if (bgColour === 'green' || bgColour === 'blue') {
    return [BRAND_COLOURS.navy[100]!];
  }
  // Navy and the saturated secondary backgrounds (purple, red, orange) take White
  return [BRAND_COLOURS.white[100]!];
}

function getBrandHex(colour: BrandColourName, tint: number): string {
  const table = BRAND_COLOURS[colour] as unknown as Record<number, string>;
  const hex = table[tint];
  if (!hex) {
    throw new Error(`Unknown tint ${tint} for brand colour ${colour}`);
  }
  return hex;
}

function createEntry(
  index: number,
  group: ColourwayGroup,
  bgColour: BrandColourName,
  bgTint: number,
  family: BrandColourName,
  tints: number[]
): Colourway {
  const bgPrefix = bgTint === 100 ? bgColour : `${bgColour}-${bgTint}`;
  const id = `${bgPrefix}__${family}-${tints.join('-')}`;
  const background = getBrandHex(bgColour, bgTint);
  const tintHexes = tints.map((t) => getBrandHex(family, t));
  const textColours = determineTextColours(bgColour, bgTint);

  return {
    id,
    index,
    group,
    background,
    tints: tintHexes,
    textColours,
  };
}

/**
 * Colourways whose background has exactly one Tint (the brand guideline forbids background + two Tints).
 * Each entry keeps the `index` it always had: share links store the Colourway by index, so removed
 * 3-colour entries leave holes (see LEGACY_COLOURWAY_IDS) instead of shifting the rest.
 */
function buildColourways(): { list: Colourway[]; legacy: Map<number, string> } {
  const list: Colourway[] = [];
  const legacy = new Map<number, string>();
  let index = 0;
  const add = (group: ColourwayGroup, bg: BrandColourName, bgTint: number, family: BrandColourName, tints: number[]) => {
    const entry = createEntry(index++, group, bg, bgTint, family, tints);
    if (tints.length === 1) list.push(entry);
    else legacy.set(entry.index, entry.id);
  };

  add('primary', 'navy', 100, 'yellow', [100]);
  add('primary', 'navy', 100, 'yellow', [100, 50]);
  add('primary', 'navy', 100, 'grey', [100]);
  add('primary', 'navy', 100, 'grey', [100, 50]);
  add('primary', 'navy', 100, 'white', [100]);

  add('primary', 'grey', 100, 'yellow', [100]);
  add('primary', 'grey', 100, 'navy', [100]);
  add('primary', 'grey', 100, 'white', [100]);

  add('primary', 'white', 100, 'yellow', [100]);
  add('primary', 'white', 100, 'grey', [100]);
  add('primary', 'white', 100, 'navy', [100]);

  const secondaryColours: BrandColourName[] = ['green', 'blue', 'purple', 'red', 'orange'];
  for (const c of secondaryColours) {
    add('secondary', 'navy', 100, c, [100]);
    add('secondary', 'navy', 100, c, [100, 50]);
    add('secondary', c, 25, c, [100]);
    add('secondary', c, 25, c, [100, 50]);
    add('secondary', c, 100, 'white', [100]);
    add('secondary', c, 100, 'navy', [100]);
  }
  return { list, legacy };
}

const BUILT = buildColourways();

/** Index -> id of the removed `X-100-50` Colourways, kept so old share links still decode. */
export const LEGACY_COLOURWAY_IDS: ReadonlyMap<number, string> = BUILT.legacy;

export const COLOURWAYS_LIST: readonly Colourway[] = Object.freeze(BUILT.list);
export const COLOURWAYS: Record<string, Colourway> = Object.freeze(
  Object.fromEntries(COLOURWAYS_LIST.map((c) => [c.id, c]))
);

export function listColourways(): Colourway[] {
  return [...COLOURWAYS_LIST];
}

/** Looks a Colourway up by id, or by its stable `index` (never by array position; removed indexes are holes). */
export function getColourway(id: string | number): Colourway | undefined {
  if (typeof id === 'number') {
    return COLOURWAYS_LIST.find((c) => c.index === id);
  }
  return COLOURWAYS[id];
}

/**
 * Migrates a removed 3-colour Colourway id (`X-100-50`) to its one-Tint form (`X-100`);
 * any other id is returned unchanged.
 */
export function migrateColourwayId(id: string): string {
  return id.endsWith('-100-50') ? id.slice(0, -3) : id;
}

/** Colourway for a stored index; a removed 3-colour index resolves through the migration. */
export function colourwayForIndex(index: number): Colourway | undefined {
  const legacy = LEGACY_COLOURWAY_IDS.get(index);
  return legacy ? getColourway(migrateColourwayId(legacy)) : getColourway(index);
}
