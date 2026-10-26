import type { Document, Page } from './types.js';

/**
 * Per-Page seed and edited state of a deck (GLOSSARY: Document).
 *
 * A Document with ONE Page keeps its seed and edited flag on the Document, exactly as before Phase 5, so
 * single-Page files and share links do not change. A Document with several Pages gives every Page its own
 * `seed` and `edited`; `Document.seed` is then the deck's base seed (new Page seeds derive from it) and
 * `Document.edited` is true when any Page is edited.
 *
 * Commands work on the explicit per-Page form: `execute` calls {@link materializePages} before a command and
 * {@link settlePages} after it, so a command never has to care which of the two forms the Document is in.
 */

/** The seed Page `index` is generated from. A Page with no seed of its own (a one-Page Document) uses the Document's. */
export function pageSeed(doc: Document, index: number): string {
  return doc.pages[index]?.seed ?? (index === 0 ? doc.seed : `${doc.seed}-p${index}`);
}

/** True when Page `index` was edited by hand or picked, so a Format or Density change remaps it. */
export function isPageEdited(doc: Document, index: number): boolean {
  return doc.pages[index]?.edited ?? doc.edited;
}

/**
 * A fresh, deterministic seed for a new Page: `<deck seed>-p<k>` for the smallest k that no Page uses yet,
 * so Pages differ after any sequence of adds and removes.
 */
export function nextPageSeed(doc: Document): string {
  const used = new Set(doc.pages.map((_, i) => pageSeed(doc, i)));
  let k = 1;
  while (used.has(`${doc.seed}-p${k}`)) k++;
  return `${doc.seed}-p${k}`;
}

/** Writes every Page's seed and edited state onto the Page itself (the working form commands use). */
export function materializePages(doc: Document): Document {
  if (doc.pages.every((p) => p.seed !== undefined && p.edited !== undefined)) return doc;
  return {
    ...doc,
    pages: doc.pages.map((p, i) => ({ ...p, seed: pageSeed(doc, i), edited: isPageEdited(doc, i) })),
  };
}

/**
 * Puts a Document back in its stored form after a command: a one-Page Document moves its Page's seed and
 * edited state to the Document (nothing is left on the Page), a deck keeps them on every Page and has
 * `Document.edited` mean "any Page edited".
 */
export function settlePages(doc: Document): Document {
  const m = materializePages(doc);
  if (m.pages.length === 1) {
    const { seed, edited, ...page } = m.pages[0]!;
    return { ...m, seed: seed ?? m.seed, edited: edited ?? m.edited, pages: [page as Page] };
  }
  return { ...m, edited: m.pages.some((p) => p.edited) };
}
