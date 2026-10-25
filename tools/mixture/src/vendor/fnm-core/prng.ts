/**
 * 32-bit FNV-1a hash function for strings.
 */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mulberry32 PRNG generator.
 * Produces deterministic 32-bit floating point numbers in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic PRNG from an arbitrary string seed.
 */
export function createRng(seed: string): () => number {
  return mulberry32(hashString(seed));
}

/**
 * Generates a random seed string when none is provided.
 */
export function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}
