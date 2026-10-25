export type FormatId =
  | 'square'
  | 'portrait-4-5'
  | 'story-9-16'
  | 'screen-16-9'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'link-1-91'
  | 'custom';

export type DensityLevel = 'coarse' | 'medium' | 'fine' | 'extra-fine';

export interface CustomSize {
  widthPx: number;
  heightPx: number;
}

export interface Format {
  id: FormatId;
  label: string;
  widthPx?: number;
  heightPx?: number;
}

export interface Grid {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  cellPx?: number;
}

export interface Block {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
  tint: number;
}

export type ColourwayGroup = 'primary' | 'secondary';

export interface Colourway {
  id: string;
  index: number;
  group: ColourwayGroup;
  background: string;
  tints: string[];
  textColours: string[];
}

export type Slope = 'flat' | 'half' | '75';

export interface GeneratorParams {
  slope: Slope;
  blockCount: number;
  cornerMeetLimit: number;
  /** Integer percent 0 to 100: how closely the Pattern follows the Reference Patterns. 0 is free. */
  guidance: number;
  /** Which Pattern family to build; absent or 'auto' lets the seed choose. */
  family?: PatternFamily;
}

/** A Pattern family the user can ask for (see the generator's variants). Mountain has no 75% form. */
export type PatternFamily = 'auto' | 'rising' | 'hanging' | 'mountain';

export type TextZoneMode = 'clear' | 'flat';

/** A Text zone, in cells (row 0 is the top). */
export interface TextZone {
  col: number;
  row: number;
  w: number;
  h: number;
  mode: TextZoneMode;
}

export interface Page {
  pattern: Block[];
  textZone?: TextZone;
}

export interface Document {
  version: 1;
  format: FormatId;
  density: DensityLevel;
  colourway: string;
  seed: string;
  generator: GeneratorParams;
  /** True once the user has set blockCount explicitly; Density changes then keep it. */
  blockCountExplicit?: boolean;
  pages: Page[];
  customSize?: CustomSize;
  edited: boolean;
}

export type Command =
  | { type: 'createDocument' }
  | { type: 'generate'; seed?: string }
  | { type: 'setGeneratorParams'; params: Partial<GeneratorParams> }
  | { type: 'setColourway'; colourway: string }
  | { type: 'setFormat'; format: FormatId; widthPx?: number; heightPx?: number }
  | { type: 'setDensity'; density: DensityLevel }
  | {
      type: 'addBlock';
      block: { col: number; row: number; w: number; h: number; tint: number; id?: string };
      pageIndex?: number;
    }
  | { type: 'moveBlock'; id: string; col: number; row: number; pageIndex?: number }
  | {
      type: 'resizeBlock';
      id: string;
      col: number;
      row: number;
      w: number;
      h: number;
      pageIndex?: number;
    }
  | { type: 'removeBlock'; id: string; pageIndex?: number }
  | { type: 'setBlockTint'; id: string; tint: number; pageIndex?: number }
  | { type: 'setTextZone'; zone: TextZone }
  | { type: 'clearTextZone' }
  | { type: 'loadDocument'; document: Document };

export interface SerializedFile {
  app: 'fnm-pattern-builder';
  schema: number;
  document: Document;
}

export type DeserializeResult =
  | { document: Document }
  | { error: { code: 'file.invalid' | 'file.unsupportedVersion'; message: string } };

export type ShareLinkResult =
  | { document: Document }
  | { error: { code: 'link.invalid' | 'link.unsupportedVersion'; message: string } };

export interface AdvisoryBlockCountWarning {
  code: 'advisory.blockCount';
  message: string;
  count?: number;
  max?: number;
}

export interface AdvisoryCornerMeetsWarning {
  code: 'advisory.cornerMeets';
  message: string;
  points: Array<{ col: number; row: number }>;
}

export interface AdvisoryDisconnectedWarning {
  code: 'advisory.disconnected';
  message: string;
  /** Which Pattern rules are broken: `disconnected` and/or `noEdge`. */
  rules: Array<'disconnected' | 'noEdge'>;
}

export interface AdvisoryTextOverlapWarning {
  code: 'advisory.textOverlap';
  message: string;
  /** Share of the Clear Text zone covered by Blocks (0-1). */
  share: number;
  /** True when a Block reaches past the zone's outer ring. */
  reachesInterior: boolean;
}

export type Warning =
  | AdvisoryBlockCountWarning
  | AdvisoryCornerMeetsWarning
  | AdvisoryDisconnectedWarning
  | AdvisoryTextOverlapWarning
  | {
      code: string;
      message: string;
      points?: Array<{ col: number; row: number }>;
      count?: number;
      max?: number;
      [key: string]: unknown;
    };

export type Rejection = {
  rejected: {
    code: string;
    message: string;
  };
};

export interface DensityLevelDefinition {
  level: DensityLevel;
  density: DensityLevel;
  id: DensityLevel;
  label: string;
  cols: number;
  rows: number;
  isCiStandard: boolean;
  cellW: number;
  cellH: number;
  cellPx?: number;
}
