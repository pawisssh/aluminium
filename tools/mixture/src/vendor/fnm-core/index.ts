export type {
  Block,
  Colourway,
  ColourwayGroup,
  Command,
  CustomSize,
  DensityLevel,
  DensityLevelDefinition,
  Document,
  Format,
  FormatId,
  GeneratorParams,
  PatternFamily,
  Grid,
  Page,
  Rejection,
  Slope,
  TextZone,
  TextZoneMode,
  Warning,
  SerializedFile,
  DeserializeResult,
  AdvisoryBlockCountWarning,
  AdvisoryCornerMeetsWarning,
  AdvisoryDisconnectedWarning,
  AdvisoryTextOverlapWarning,
  ShareLinkResult,
} from './types.js';

export type { BrandColourName } from './colourway.js';

export { execute } from './execute.js';
export type { ExecuteResult } from './execute.js';
export { gridFor } from './grid.js';
export { renderSvg } from './renderer.js';
export { exportFileName } from './export.js';
export {
  serialize,
  deserialize,
  validateDocument,
  CURRENT_SCHEMA_VERSION,
  CURRENT_APP_NAME,
} from './serialization.js';
export { encodeShareLink, decodeShareLink } from './share.js';
export {
  FORMATS,
  DENSITY_TABLES,
  listFormats,
  densityLevelsFor,
  getFormatDimensions,
  formatDensityLabel,
  pickLongSideCount,
} from './formats.js';
export {
  generatePattern,
  generatePatternDetailed,
  generatorBlockSizesFor,
  isValidBlockSize,
  countCornerMeets,
  blockCountRangeFor,
  defaultBlockCountFor,
  MAX_BLOCK_COUNT,
  defaultGeneratorParams,
  DEFAULT_GUIDANCE,
  validateGeneratorParams,
  BASE_BLOCK_SIZES,
  SLOPES,
  PATTERN_FAMILIES,
} from './generator.js';
export type { GeneratorDiagnostics } from './generator.js';
export { createRng, generateRandomSeed, hashString, mulberry32 } from './prng.js';
export {
  createHistory,
  push,
  undo,
  redo,
  current,
  canUndo,
  canRedo,
  HISTORY_CAP,
  type History,
} from './history.js';
export {
  BRAND_COLOUR_TABLE,
  BRAND_COLOURS,
  COLOURWAYS,
  COLOURWAYS_LIST,
  DEFAULT_COLOURWAY_ID,
  PRIMARY_NAVY_YELLOW,
  SQUARE_FORMAT,
  colourwayForIndex,
  getColourway,
  listColourways,
  migrateColourwayId,
} from './constants.js';
export {
  RECOMMENDED_MAX_FACTOR,
  MAX_RECOMMENDED_CORNER_MEETS,
  recommendedMaxBlockCountFor,
  computeWarnings,
} from './warnings.js';

export {
  measureClearZoneOverlap,
  CLEAR_ZONE_MAX_OVERLAP,
  CLEAR_ZONE_RING_DEPTH,
  type ClearZoneOverlap,
} from './textZone.js';

export {
  checkPatternRules,
  repairPatternRules,
  patternMasses,
  COVERAGE_LIMIT,
  type PatternRulesResult,
} from './patternRules.js';
export {
  REFERENCE_PATTERNS,
  REFERENCE_SIZE,
  patternSimilarity,
  trendDegrees,
  cellTrend,
  staircaseSteps,
  slopeShapeProblem,
  classifyReferenceSlope,
  type ReferenceFamily,
  type ReferencePattern,
  type SimilarityFilter,
  type SimilarityResult,
} from './referencePatterns.js';
