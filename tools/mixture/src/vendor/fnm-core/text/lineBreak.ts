/**
 * Break opportunities for headline wrapping. `Intl.Segmenter` (word granularity) knows where Thai and Latin
 * words end; text is only ever broken between words, never inside one. Thai has no spaces, so the
 * segmenter's dictionary is what keeps "ลงทุน" whole.
 *
 * A "unit" is the smallest piece a line may start with: one word plus the punctuation that must stay
 * with it (a comma, a hyphen or a closing bracket stays with the word before it; an opening bracket,
 * quote or "$" stays with the word after it) and any spaces that follow.
 */

export interface BreakUnit {
  /** Offset of the first character. */
  start: number;
  /** End of the last non-space character: where a line that ends on this unit ends. */
  contentEnd: number;
  /** End including the spaces that follow. */
  end: number;
}

let segmenter: Intl.Segmenter | undefined;

function wordSegments(text: string): { start: number; end: number; wordLike: boolean; space: boolean }[] {
  // Locale "th" only selects ICU rules; the Thai dictionary is script-driven and Latin is unaffected.
  segmenter ??= new Intl.Segmenter('th', { granularity: 'word' });
  return Array.from(segmenter.segment(text), (s) => ({
    start: s.index,
    end: s.index + s.segment.length,
    wordLike: s.isWordLike === true,
    space: s.segment.trim() === '',
  }));
}

/** Split one paragraph (no newlines) into break units. Leading spaces are dropped. */
export function breakUnits(text: string): BreakUnit[] {
  const tokens = wordSegments(text);
  const units: BreakUnit[] = [];
  let openStart: number | null = null; // opening punctuation waiting for the next word
  const attachToPrevious = (end: number): void => {
    const last = units[units.length - 1];
    if (last) {
      last.end = end;
      last.contentEnd = end;
    } else {
      units.push({ start: tokens[0]!.start, contentEnd: end, end });
    }
  };
  tokens.forEach((t, i) => {
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    if (t.space) {
      if (openStart !== null) {
        // Punctuation that opens nothing: let it ride with what came before.
        attachToPrevious(t.start);
        openStart = null;
      }
      const last = units[units.length - 1];
      if (last) last.end = t.end;
    } else if (t.wordLike) {
      units.push({ start: openStart ?? t.start, contentEnd: t.end, end: t.end });
      openStart = null;
    } else if ((!before || before.space) && after && !after.space) {
      openStart ??= t.start;
    } else if (openStart === null) {
      attachToPrevious(t.end);
    }
  });
  if (openStart !== null) attachToPrevious(text.length);
  return units;
}
