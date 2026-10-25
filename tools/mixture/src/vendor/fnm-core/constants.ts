import {
  BRAND_COLOUR_TABLE,
  BRAND_COLOURS,
  COLOURWAYS,
  COLOURWAYS_LIST,
  DEFAULT_COLOURWAY_ID,
  colourwayForIndex,
  getColourway,
  listColourways,
  migrateColourwayId,
} from './colourway.js';
import type { Colourway, Format } from './types.js';

export const SQUARE_FORMAT: Format = {
  id: 'square',
  label: 'Square',
  widthPx: 1920,
  heightPx: 1920,
};

export const PRIMARY_NAVY_YELLOW: Colourway = getColourway(DEFAULT_COLOURWAY_ID)!;

export {
  BRAND_COLOUR_TABLE,
  BRAND_COLOURS,
  COLOURWAYS,
  COLOURWAYS_LIST,
  DEFAULT_COLOURWAY_ID,
  colourwayForIndex,
  getColourway,
  listColourways,
  migrateColourwayId,
};
