# Mixture

A playground for how a Portfolio's allocation reads as a **Mix** (a 4×4 or 8×8 grid of Plan colours) and how each Plan's **Brick** looks. Terms are defined in the repo's [`GLOSSARY.md`](../../GLOSSARY.md).

```bash
npm install
npm run dev        # http://localhost:5173; the browser console logs which checkout it serves
npm test           # core logic: src/core
npm run typecheck
npm run check      # typecheck, tests, lint, glossary terms: what CI runs
npm run probe -- <file>  # a test file with console.log shown (vitest hides it by default)
npm run brick-stats -- --save before.json  # distinct Brick shapes per family/Slope; --compare before.json, --show mountain/half
npm run mix-stats -- --save before.json    # Ordered Mix cases over every cell split; --compare before.json, --show "skip ahead"
npm run vendor:check     # vendored fnm-core matches block at its README hash (CI runs this too)
```

- `src/core/mix.ts`: `buildMix` turns Plan values into a Mix (largest-remainder cell counts, Random layout keeps each Plan colour in one edge-joined piece; Ordered lays colours out in two Sides: every colour but the largest sits whole in one Side, the right one first while it fits, the largest takes what is left at the top of both, and each Side fills row by row, turning back at each row's end; a Dominant Plan colour gets exactly the left Side).
- `src/core/brick.ts`: `generateBrick` draws a 4×4 Brick with the Pattern Builder's generator, vendored in `src/vendor/fnm-core` (see its README).
- Plan colours come from neon `theme/tokens/colors.json`; the light theme from `theme.json`.
