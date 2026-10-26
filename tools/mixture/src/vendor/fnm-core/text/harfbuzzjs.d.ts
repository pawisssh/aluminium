// harfbuzzjs 0.4.x ships plain CommonJS with no types. Only the parts the shaper touches are declared here.
// shaper.ts pulls this file in with a triple-slash reference so apps/web's typecheck sees it too.

declare module 'harfbuzzjs/hb.js' {
  /** The Emscripten module factory. `wasmBinary` skips any file read or fetch; `locateFile` redirects `hb.wasm`. */
  interface EmscriptenOptions {
    wasmBinary?: ArrayBuffer | Uint8Array;
    locateFile?: (path: string, scriptDirectory: string) => string;
  }
  const createHarfBuzz: (options?: EmscriptenOptions) => Promise<unknown>;
  export default createHarfBuzz;
}

declare module 'harfbuzzjs/hbjs.js' {
  interface HbBlob {
    destroy(): void;
  }
  interface HbFace {
    upem: number;
    destroy(): void;
  }
  interface HbFont {
    glyphToPath(glyphId: number): string;
    destroy(): void;
  }
  interface HbGlyph {
    /** Glyph id. */
    g: number;
    /** Cluster: index into the UTF-16 text that was added. */
    cl: number;
    /** Advance and offset, in font units (the font scale defaults to upem). */
    ax: number;
    ay: number;
    dx: number;
    dy: number;
    flags: number;
  }
  interface HbBuffer {
    addText(text: string): void;
    guessSegmentProperties(): void;
    json(): HbGlyph[];
    destroy(): void;
  }
  export interface HbJs {
    createBlob(bytes: Uint8Array | ArrayBuffer): HbBlob;
    createFace(blob: HbBlob, index: number): HbFace;
    createFont(face: HbFace): HbFont;
    createBuffer(): HbBuffer;
    shape(font: HbFont, buffer: HbBuffer, features?: string): void;
  }
  const hbjs: (module: unknown) => HbJs;
  export default hbjs;
}
