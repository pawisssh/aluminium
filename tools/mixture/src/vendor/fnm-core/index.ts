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
  PageContent,
  PageContentPatch,
  PageLayoutId,
  PageLogo,
  PagePhoto,
  PageTicker,
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
  AdvisoryHeadlineCapsWarning,
  AdvisoryHighlightWordsWarning,
  ShareLinkResult,
} from './types.js';

export type { BrandColourName } from './colourway.js';

export { execute } from './execute.js';
export type { ExecuteResult } from './execute.js';
export { gridFor } from './grid.js';
export { renderSvg, type RenderOptions } from './renderer.js';
export {
  TICKER_HEIGHT_OF_CAP,
  HEADLINE_MAX_OF_SHORT,
  SECONDARY_OF_HEADLINE,
  SECONDARY_MAX_OF_SHORT,
  CONTENT_SECONDARY_MAX_OF_SHORT,
  LABEL_MAX_OF_SHORT,
  TICKER_MAX_OF_SHORT,
  sceneToSvg,
} from './composedRenderer.js';
export { composeScene } from './composedScene.js';
export type {
  ComposeOptions,
  ComposedScene,
  SceneLogo,
  SceneOutline,
  ScenePhoto,
  SceneRect,
  SceneText,
  SceneTextLine,
  SceneTextRole,
  SceneTextRun,
} from './composedScene.js';
export { LOGO_I_HEIGHT, LOGO_VIEWBOX, LOGO_PATH_DATA } from './logo.js';
export { exportFileName } from './export.js';
export {
  serialize,
  deserialize,
  validateDocument,
  CURRENT_SCHEMA_VERSION,
  CURRENT_APP_NAME,
} from './serialization.js';
export { encodeShareLink, encodeShareLinkDetailed, decodeShareLink, SHARE_LINK_MAX_LENGTH, type ShareLinkEncoding } from './share.js';
export { pageSeed, isPageEdited, nextPageSeed } from './pages.js';
export {
  LAYOUT_TABLE,
  LOGO_ASPECT,
  LOGO_MARGIN_OF_SHORT_SIDE,
  LOGO_MIN_HEIGHT_PX,
  LOGO_WIDTH_OF_SHORT_SIDE,
  layoutSlots,
  layoutSlotsFor,
  layoutTextZone,
  logoBox,
  cellsCovering,
  orientationFor,
  type CellRect,
  type FracRect,
  type LayoutSlot,
  type LayoutSlots,
  type LogoAnchor,
  type LogoSlot,
  type Orientation,
  type PxRect,
  type SlotName,
} from './layouts.js';
export { TEXT_NAVY, TEXT_WHITE, fillUnderSlot, textColourFor, uniformFillUnder } from './textColour.js';
export { logoPlacement, type LogoPlacement } from './logoPlacement.js';
export { MAX_CONTENT_TEXT, photoProblem, type ContentProblem } from './content.js';
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
  CANDIDATE_COUNT,
  NEAR_DUPLICATE,
  candidateFamilies,
  candidateSet,
  candidateSetKey,
  generateCandidates,
  type Candidate,
  type CandidateSetOptions,
  type CandidateStep,
} from './candidates.js';
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
  MAX_HIGHLIGHT_WORDS,
  MIN_CAPS_LETTERS,
  countHighlightWords,
  isAllCapsHeadline,
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
  LATEST_REFERENCE_SET,
  referencePatternsFor,
  REFERENCE_SIZE,
  patternSimilarity,
  patternMask,
  maskOverlap,
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

export * from './text/index.js';
