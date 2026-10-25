# Mixture

A playground for how a Portfolio's allocation reads as a **Mix** (a 4×4 or 8×8 grid of Plan colours) and how each Plan's **Brick** looks. Terms are defined in the repo's [`GLOSSARY.md`](../../GLOSSARY.md).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # core logic: src/core
npm run typecheck
npm run check      # typecheck, tests, lint, glossary terms: what CI runs
npm run probe -- <file>  # a test file with console.log shown (vitest hides it by default)
```

- `src/core/mix.ts`: `buildMix` turns Plan values into a Mix (largest-remainder cell counts, Random layout keeps each Plan colour in one edge-joined piece; Ordered 4×4 fills two 2-wide halves row by row, left half first).
- `src/core/brick.ts`: `generateBrick` draws a 4×4 Brick with the Pattern Builder's generator, vendored in `src/vendor/fnm-core` (see its README).
- Plan colours come from neon `theme/tokens/colors.json`; the light theme from `theme.json`.
