import type {
  CustomSize,
  DensityLevel,
  DensityLevelDefinition,
  Document,
  Format,
  FormatId,
} from './types.js';

export const FORMATS: readonly Format[] = [
  { id: 'square', label: 'Square', widthPx: 1920, heightPx: 1920 },
  { id: 'portrait-4-5', label: 'Portrait 4:5', widthPx: 1920, heightPx: 2400 },
  { id: 'story-9-16', label: 'Story 9:16', widthPx: 1080, heightPx: 1920 },
  { id: 'screen-16-9', label: 'Screen 16:9', widthPx: 1920, heightPx: 1080 },
  { id: 'a4-portrait', label: 'A4 Portrait', widthPx: 2480, heightPx: 3508 },
  { id: 'a4-landscape', label: 'A4 Landscape', widthPx: 3508, heightPx: 2480 },
  { id: 'link-1-91', label: 'Link Preview 1.91:1', widthPx: 1200, heightPx: 628 },
  { id: 'custom', label: 'Custom' },
] as const;

export function listFormats(): Format[] {
  return [...FORMATS];
}

export interface DensityTableEntry {
  level: DensityLevel;
  cols: number;
  rows: number;
  isCiStandard: boolean;
}

export const DENSITY_TABLES: Record<Exclude<FormatId, 'custom'>, readonly DensityTableEntry[]> = {
  square: [
    { level: 'coarse', cols: 4, rows: 4, isCiStandard: false },
    { level: 'medium', cols: 8, rows: 8, isCiStandard: false },
    { level: 'fine', cols: 16, rows: 16, isCiStandard: true },
    { level: 'extra-fine', cols: 32, rows: 32, isCiStandard: false },
  ],
  'portrait-4-5': [
    { level: 'medium', cols: 8, rows: 10, isCiStandard: false },
    { level: 'fine', cols: 16, rows: 20, isCiStandard: true },
    { level: 'extra-fine', cols: 32, rows: 40, isCiStandard: false },
  ],
  'story-9-16': [
    { level: 'medium', cols: 9, rows: 16, isCiStandard: false },
    { level: 'fine', cols: 18, rows: 32, isCiStandard: false },
    { level: 'extra-fine', cols: 27, rows: 48, isCiStandard: true },
  ],
  'screen-16-9': [
    { level: 'medium', cols: 16, rows: 9, isCiStandard: false },
    { level: 'fine', cols: 32, rows: 18, isCiStandard: false },
    { level: 'extra-fine', cols: 48, rows: 27, isCiStandard: true },
  ],
  'a4-portrait': [
    { level: 'fine', cols: 24, rows: 34, isCiStandard: true },
  ],
  'a4-landscape': [
    { level: 'fine', cols: 34, rows: 24, isCiStandard: true },
  ],
  /**
   * Link preview 1.91:1 rule:
   * Pixel dimensions are 1200x628 (aspect ratio 1.91083).
   * Medium (16 cols): ideal rows = 16 * (628 / 1200) = 8.373 -> 8 rows yields cellW 75, cellH 78.5
   * (within 4.7% of square, both counts even).
   * Fine (32 cols): ideal rows = 32 * (628 / 1200) = 16.75 -> 16 rows yields cellW 37.5, cellH 39.25
   * (within 4.7% of square, both counts even, CI standard).
   */
  'link-1-91': [
    { level: 'medium', cols: 16, rows: 8, isCiStandard: false },
    { level: 'fine', cols: 32, rows: 16, isCiStandard: true },
  ],
};

export function formatDensityLabel(level: DensityLevel): string {
  switch (level) {
    case 'coarse':
      return 'Coarse';
    case 'medium':
      return 'Medium';
    case 'fine':
      return 'Fine';
    case 'extra-fine':
      return 'Extra fine';
  }
}

/**
 * Custom Format long side count picker:
 * Target short side count is S (4, 8, 16, or 32).
 * Pick the long side count that makes cells closest to square; prefer even counts.
 */
export function pickLongSideCount(shortPx: number, longPx: number, shortCount: number): number {
  const idealL = (longPx / shortPx) * shortCount;
  const floorL = Math.max(1, Math.floor(idealL));
  const ceilL = Math.max(1, Math.ceil(idealL));
  if (floorL === ceilL) return floorL;

  const cellShort = shortPx / shortCount;
  const devFloor = Math.abs((longPx / floorL) / cellShort - 1);
  const devCeil = Math.abs((longPx / ceilL) / cellShort - 1);

  // If both candidates produce practically equal deviation, prefer the even count
  if (Math.abs(devFloor - devCeil) < 1e-5) {
    if (floorL % 2 === 0) return floorL;
    if (ceilL % 2 === 0) return ceilL;
    return floorL;
  }

  // Round-half-to-even tie-breaker
  if (Math.abs((idealL - floorL) - 0.5) < 1e-5) {
    if (floorL % 2 === 0) return floorL;
    if (ceilL % 2 === 0) return ceilL;
  }

  return devFloor < devCeil ? floorL : ceilL;
}

function customDensityLevels(customSize?: CustomSize): DensityLevelDefinition[] {
  const widthPx = customSize?.widthPx ?? 1920;
  const heightPx = customSize?.heightPx ?? 1080;
  const shortPx = Math.min(widthPx, heightPx);
  const longPx = Math.max(widthPx, heightPx);
  const isWidthShort = widthPx <= heightPx;

  const targets: { level: DensityLevel; shortCount: number; isCiStandard: boolean }[] = [
    { level: 'coarse', shortCount: 4, isCiStandard: false },
    { level: 'medium', shortCount: 8, isCiStandard: false },
    { level: 'fine', shortCount: 16, isCiStandard: true },
    { level: 'extra-fine', shortCount: 32, isCiStandard: false },
  ];

  return targets.map(({ level, shortCount, isCiStandard }) => {
    const longCount = pickLongSideCount(shortPx, longPx, shortCount);
    const cols = isWidthShort ? shortCount : longCount;
    const rows = isWidthShort ? longCount : shortCount;
    const cellW = widthPx / cols;
    const cellH = heightPx / rows;
    const isExact = widthPx * rows === heightPx * cols;
    const cellPx = isExact ? cellW : undefined;

    return {
      level,
      density: level,
      id: level,
      label: formatDensityLabel(level),
      cols,
      rows,
      isCiStandard,
      cellW,
      cellH,
      ...(isExact ? { cellPx } : {}),
    };
  });
}

/**
 * Returns supported Density levels for a format (with cols/rows/isCiStandard).
 * Accepts either FormatId or Document (or an object with format and customSize).
 */
export function densityLevelsFor(
  formatInput: FormatId | { format: FormatId; customSize?: CustomSize },
  customSizeInput?: CustomSize
): DensityLevelDefinition[] {
  const format =
    typeof formatInput === 'object' && formatInput !== null
      ? formatInput.format
      : formatInput;
  const customSize =
    typeof formatInput === 'object' && formatInput !== null
      ? (formatInput.customSize ?? customSizeInput)
      : customSizeInput;

  if (format === 'custom') {
    return customDensityLevels(customSize);
  }

  const entries = DENSITY_TABLES[format];
  if (!entries) {
    return [];
  }

  const formatDef = FORMATS.find((f) => f.id === format);
  const width = formatDef?.widthPx ?? 1920;
  const height = formatDef?.heightPx ?? 1920;

  return entries.map((entry) => {
    const isExact = width * entry.rows === height * entry.cols;
    const cellW = width / entry.cols;
    const cellH = height / entry.rows;
    const cellPx = isExact ? cellW : undefined;

    return {
      level: entry.level,
      density: entry.level,
      id: entry.level,
      label: formatDensityLabel(entry.level),
      cols: entry.cols,
      rows: entry.rows,
      isCiStandard: entry.isCiStandard,
      cellW,
      cellH,
      ...(isExact ? { cellPx } : {}),
    };
  });
}

export function getFormatDimensions(doc: Document): { widthPx: number; heightPx: number } {
  if (doc.format === 'custom') {
    return {
      widthPx: doc.customSize?.widthPx ?? 1920,
      heightPx: doc.customSize?.heightPx ?? 1080,
    };
  }

  const formatDef = FORMATS.find((f) => f.id === doc.format);
  return {
    widthPx: formatDef?.widthPx ?? 1920,
    heightPx: formatDef?.heightPx ?? 1920,
  };
}
