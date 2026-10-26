/** Glyph outline paths: parsing the SVG path harfbuzz returns, exact bounds, contours and transformed output. */

export type PathCommand =
  | { c: 'M' | 'L'; v: [number, number] }
  | { c: 'Q'; v: [number, number, number, number] }
  | { c: 'C'; v: [number, number, number, number, number, number] }
  | { c: 'Z'; v: [] };

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const COMMAND_ARITY: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/** Parse harfbuzz's `glyphToPath` output (absolute M, L, Q, C and Z only). Throws on anything else. */
export function parsePath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  for (const match of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const c = match[1] as keyof typeof COMMAND_ARITY;
    const body = (match[2] ?? '').trim();
    const v = body === '' ? [] : body.split(/[\s,]+/).map(Number);
    if (v.length !== COMMAND_ARITY[c] || v.some((n) => !Number.isFinite(n))) {
      throw new Error(`Unexpected glyph path segment: ${match[0]}`);
    }
    out.push({ c, v } as PathCommand);
  }
  return out;
}

/** Split a path into its closed contours (each starts at an `M`). */
export function contours(path: readonly PathCommand[]): PathCommand[][] {
  const result: PathCommand[][] = [];
  for (const cmd of path) {
    if (cmd.c === 'M') result.push([cmd]);
    else result[result.length - 1]?.push(cmd);
  }
  return result;
}

/** Roots of the derivative of a quadratic (one) or cubic (up to two) Bezier along one axis, in (0, 1). */
function extremaT(p: number[]): number[] {
  const ts: number[] = [];
  if (p.length === 3) {
    const [a, b, c] = p as [number, number, number];
    const den = a - 2 * b + c;
    if (den !== 0) ts.push((a - b) / den);
  } else {
    const [a, b, c, d] = p as [number, number, number, number];
    // B'(t)/3 = (-a+3b-3c+d)t^2 + (2a-4b+2c)t + (b-a)
    const qa = -a + 3 * b - 3 * c + d;
    const qb = 2 * a - 4 * b + 2 * c;
    const qc = b - a;
    if (Math.abs(qa) < 1e-12) {
      if (qb !== 0) ts.push(-qc / qb);
    } else {
      const disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        ts.push((-qb + root) / (2 * qa), (-qb - root) / (2 * qa));
      }
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

function bezierAt(p: number[], t: number): number {
  const m = 1 - t;
  if (p.length === 3) return m * m * p[0]! + 2 * m * t * p[1]! + t * t * p[2]!;
  return m * m * m * p[0]! + 3 * m * m * t * p[1]! + 3 * m * t * t * p[2]! + t * t * t * p[3]!;
}

/** Exact bounds of the curve (control points do not count, only the outline itself). Null for an empty path. */
export function pathBounds(path: readonly PathCommand[]): Bounds | null {
  let b: Bounds | null = null;
  const add = (x: number, y: number): void => {
    b = b
      ? { minX: Math.min(b.minX, x), minY: Math.min(b.minY, y), maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y) }
      : { minX: x, minY: y, maxX: x, maxY: y };
  };
  let cx = 0;
  let cy = 0;
  for (const cmd of path) {
    if (cmd.c === 'M' || cmd.c === 'L') {
      [cx, cy] = cmd.v;
      add(cx, cy);
    } else if (cmd.c === 'Q' || cmd.c === 'C') {
      const xs = [cx];
      const ys = [cy];
      for (let i = 0; i < cmd.v.length; i += 2) {
        xs.push(cmd.v[i]!);
        ys.push(cmd.v[i + 1]!);
      }
      for (const t of extremaT(xs)) add(bezierAt(xs, t), bezierAt(ys, t));
      for (const t of extremaT(ys)) add(bezierAt(xs, t), bezierAt(ys, t));
      cx = xs[xs.length - 1]!;
      cy = ys[ys.length - 1]!;
      add(cx, cy);
    }
  }
  return b;
}

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}

/**
 * Re-emit a glyph path as SVG path data: scaled by `scale`, flipped from font space (y up) to page space
 * (y down) and moved so the glyph origin lands on (`originX`, `originY`). Coordinates are rounded to 0.001.
 */
export function transformPath(path: readonly PathCommand[], scale: number, originX: number, originY: number): string {
  let d = '';
  for (const cmd of path) {
    d += cmd.c;
    for (let i = 0; i < cmd.v.length; i += 2) {
      d += `${i ? ' ' : ''}${fmt(originX + cmd.v[i]! * scale)},${fmt(originY - cmd.v[i + 1]! * scale)}`;
    }
  }
  return d;
}
