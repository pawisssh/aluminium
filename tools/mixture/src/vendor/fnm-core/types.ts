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
  /** The Reference set the Pattern is drawn from (GLOSSARY: Reference set); absent: set 1, from before sets. */
  referenceSet?: number;
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

/**
 * A CI-approved arrangement of slots on a Page (GLOSSARY: Page layout). 'pattern' is the Pattern alone:
 * no slots and no Text zone. A Page with no `layout` is 'pattern'.
 */
export type PageLayoutId =
  | 'pattern'
  | 'headline'
  | 'cover'
  | 'product-cover'
  | 'section-divider'
  | 'content'
  | 'closing'
  | 'article-cover';

export interface PageTicker {
  show: boolean;
  left: string;
  right: string;
}

export interface PageLogo {
  show: boolean;
}

/** A photo as the user imported it. `src` is an `image/*` data URL; width and height are in pixels. */
export interface PagePhoto {
  /** True for a colour photo, which only an Article cover accepts; absent means black and white. */
  colour?: true;
  src: string;
  width: number;
  height: number;
}

/** What the user typed into a Page layout's slots. Empty text is simply absent. */
export interface PageContent {
  /** May hold `[bracketed]` runs: the words to Highlight. */
  headline?: string;
  secondary?: string;
  label?: string;
  ticker?: PageTicker;
  /** Shown by default whenever the layout is not 'pattern'. */
  logo?: PageLogo;
  photo?: PagePhoto;
}

/** A partial edit of a Page's content: nested ticker and logo merge field by field, photo is set with setPhoto. */
export interface PageContentPatch {
  headline?: string;
  secondary?: string;
  label?: string;
  ticker?: Partial<PageTicker>;
  logo?: Partial<PageLogo>;
}

/** A brand colour at 100 an Article cover's Highlight can take (spec #67). */
export type HighlightColour = 'yellow' | 'green' | 'blue' | 'purple' | 'red' | 'orange' | 'white';

/** How an Article cover's photo meets the background: dissolving into it (fade) or cut along Grid cells (step). */
export type PhotoEdge = 'fade' | 'step';

/**
 * Where an Article cover's photo meets the background: `left` (a photo on the right dissolving toward the headline),
 * `bottom` (a photo across the top dissolving downward) or `full` (a full-bleed photo with navy fading in from the left).
 */
export type FadeDirection = 'left' | 'bottom' | 'full';

/** Settings only an Article cover has. An absent setting takes its default (see `articleCoverSettings`). */
export interface ArticleCoverSettings {
  /** Default yellow. */
  highlight?: HighlightColour;
  /** Default fade. */
  photoEdge?: PhotoEdge;
  /** How many Grid cells the photo's edge runs over, a whole number from 6 to 14. Default 6 for Bottom, 10 for Left and Full. */
  fadeLength?: number;
  /** Default left. */
  fadeDirection?: FadeDirection;
}

export interface Page {
  pattern: Block[];
  textZone?: TextZone;
  /** Absent means 'pattern'. */
  layout?: PageLayoutId;
  content?: PageContent;
  /** Only on an Article cover; dropped when the Page leaves the layout. */
  articleCover?: ArticleCoverSettings;
  /**
   * The seed this Page's Pattern is generated from, so Pages of a deck differ. A Document with one Page keeps
   * its seed in `Document.seed` and leaves this absent; a Document with several Pages gives every Page its own.
   */
  seed?: string;
  /**
   * True once this Page's Pattern was edited by hand or picked (a Format or Density change then remaps it
   * rather than regenerating it). Like `seed`: absent on a one-Page Document (see `Document.edited`).
   */
  edited?: boolean;
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
  /**
   * True when the Pages are drawn and exported without the Colourway background: Blocks, text and wordmark
   * only, on transparency. Text colours still follow the Colourway background. Absent means the background is drawn.
   */
  transparentBackground?: boolean;
}

/** A Candidate: the Pattern a seed drew for a Page, offered with the rest of its Candidate set (GLOSSARY). */
export interface Candidate {
  seed: string;
  pattern: Block[];
}

export type Command =
  | { type: 'createDocument' }
  | { type: 'generate'; seed?: string; pageIndex?: number }
  | { type: 'setGeneratorParams'; params: Partial<GeneratorParams> }
  | { type: 'setColourway'; colourway: string }
  | { type: 'setTransparentBackground'; transparent: boolean }
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
  | { type: 'setPageLayout'; layout: PageLayoutId; pageIndex?: number }
  | { type: 'setPageContent'; content: PageContentPatch; pageIndex?: number }
  | { type: 'setPhoto'; photo: PagePhoto; pageIndex?: number }
  /** Changes an Article cover's own settings; refused on any other layout. */
  | { type: 'setArticleCover'; settings: Partial<ArticleCoverSettings>; pageIndex?: number }
  | { type: 'clearPhoto'; pageIndex?: number }
  | { type: 'setTextZone'; zone: TextZone; pageIndex?: number }
  | { type: 'clearTextZone'; pageIndex?: number }
  /** Inserts a new Page with a fresh Pattern after `afterIndex` (-1 puts it first); absent means at the end. */
  | { type: 'addPage'; layout: PageLayoutId; afterIndex?: number }
  /** Inserts a copy of a Page (Pattern, seed, layout and content) right after it. */
  | { type: 'duplicatePage'; pageIndex: number }
  /** Removes a Page; the last remaining Page cannot be removed. */
  | { type: 'removePage'; pageIndex: number }
  /** Moves the Page at `from` so it ends up at index `to`. */
  | { type: 'movePage'; from: number; to: number }
  /**
   * Gives Page `pageIndex` the picked Candidate's Pattern and seed, as an edited Pattern; like Generate, it moves
   * the Document to the newest Reference set.
   */
  | { type: 'pickCandidate'; candidate: Candidate; pageIndex?: number }
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
  /** The Page the Advisory is about. */
  pageIndex?: number;
  code: 'advisory.blockCount';
  message: string;
  count?: number;
  max?: number;
}

export interface AdvisoryCornerMeetsWarning {
  /** The Page the Advisory is about. */
  pageIndex?: number;
  code: 'advisory.cornerMeets';
  message: string;
  points: Array<{ col: number; row: number }>;
}

export interface AdvisoryDisconnectedWarning {
  /** The Page the Advisory is about. */
  pageIndex?: number;
  code: 'advisory.disconnected';
  message: string;
  /** Which Pattern rules are broken: `disconnected` and/or `noEdge`. */
  rules: Array<'disconnected' | 'noEdge'>;
}

export interface AdvisoryTextOverlapWarning {
  /** The Page the Advisory is about. */
  pageIndex?: number;
  code: 'advisory.textOverlap';
  message: string;
  /** Share of the Clear Text zone covered by Blocks (0-1). */
  share: number;
  /** True when a Block reaches past the zone's outer ring. */
  reachesInterior: boolean;
}

export interface AdvisoryHeadlineCapsWarning {
  code: 'advisory.headlineCaps';
  message: string;
  pageIndex: number;
}

export interface AdvisoryHighlightWordsWarning {
  code: 'advisory.highlightWords';
  message: string;
  pageIndex: number;
  /** Words inside the `[brackets]`. */
  count: number;
  max: number;
}

export type Warning =
  | AdvisoryBlockCountWarning
  | AdvisoryHeadlineCapsWarning
  | AdvisoryHighlightWordsWarning
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
