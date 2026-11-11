import { holdsArticleCover } from './articleCover.js';
import type { Document } from './types.js';

export interface ExportFileNameOptions {
  scale?: number;
}

/**
 * Generates a filesystem-safe export filename for a Document.
 * Format: fnm-pattern_<format>_<colourway>_<seed>[@<scale>x].<ext>
 * An Article cover has no Colourway (it is always navy), so its name is fnm-pattern_<format>_<seed>.<ext>.
 * Unsafe filesystem characters are replaced with hyphens.
 */
export function exportFileName(
  doc: Document,
  ext: string,
  options?: ExportFileNameOptions
): string {
  const sanitize = (val: string): string =>
    val.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

  const safeFormat = sanitize(doc.format || 'square') || 'square';
  const safeColourway = sanitize(doc.colourway || 'navy-yellow') || 'navy-yellow';
  const safeSeed = sanitize(doc.seed || 'seed') || 'seed';
  const cleanExt = ext.replace(/^\.+/, '').replace(/[^a-zA-Z0-9]/g, '');

  const scaleSuffix = options?.scale && options.scale > 1 ? `@${options.scale}x` : '';

  const colourwayPart = holdsArticleCover(doc) ? '' : `${safeColourway}_`;
  return `fnm-pattern_${safeFormat}_${colourwayPart}${safeSeed}${scaleSuffix}.${cleanExt}`;
}
