import type { Document } from './types.js';

export const HISTORY_CAP = 200;

export interface History {
  readonly entries: readonly Document[];
  readonly index: number;
}

/**
 * Creates a pure History instance initialised with the given Document.
 */
export function createHistory(doc: Document): History {
  return {
    entries: [doc],
    index: 0,
  };
}

/**
 * Pushes a new Document into history, clearing any redo entries ahead of the current index.
 * Caps the history length at HISTORY_CAP (200), dropping oldest entries when cap is exceeded.
 */
export function push(history: History, doc: Document): History {
  const nextEntries = history.entries.slice(0, history.index + 1);
  nextEntries.push(doc);

  if (nextEntries.length > HISTORY_CAP) {
    const trimmed = nextEntries.slice(nextEntries.length - HISTORY_CAP);
    return {
      entries: trimmed,
      index: trimmed.length - 1,
    };
  }

  return {
    entries: nextEntries,
    index: nextEntries.length - 1,
  };
}

/**
 * Returns a new History instance stepped back one entry, or the same history if at the start.
 */
export function undo(history: History): History {
  if (history.index <= 0) {
    return history;
  }
  return {
    entries: history.entries,
    index: history.index - 1,
  };
}

/**
 * Returns a new History instance stepped forward one entry, or the same history if at the end.
 */
export function redo(history: History): History {
  if (history.index >= history.entries.length - 1) {
    return history;
  }
  return {
    entries: history.entries,
    index: history.index + 1,
  };
}

/**
 * Returns the Document at the current history index.
 */
export function current(history: History): Document {
  const doc = history.entries[history.index];
  if (!doc) {
    throw new Error('History is empty or invalid');
  }
  return doc;
}

/**
 * Returns true if an undo step is available.
 */
export function canUndo(history: History): boolean {
  return history.index > 0;
}

/**
 * Returns true if a redo step is available.
 */
export function canRedo(history: History): boolean {
  return history.index < history.entries.length - 1;
}
