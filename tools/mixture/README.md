# Mixture

A playground for how a Portfolio's allocation reads as a **Mix** (a 4×4 or 8×8 grid of Plan colours) and how each Plan type's **Brick** looks. Terms are defined in the repo's [`GLOSSARY.md`](../../GLOSSARY.md).

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

- `src/core/mix.ts`: `buildMix` turns Plan values into a Mix (largest-remainder cell counts, Random layout keeps each Plan colour in one edge-joined piece; Ordered lays colours out in two Sides: every colour but the largest sits whole in one Side, the right one first while it fits, the largest takes what is left at the top of both, and each Side has a Turning fill, row by row and turning back at each row's end; a Dominant Plan colour gets exactly the left Side). A 4×4 Ordered Mix instead draws the Mix case nearest the Plan values (`nearestMixCase`).
- `src/core/mixCases.ts`: `mixCases` lists every Mix case, a 4×4 Mix cut into 1×1, 2×1, 2×2, 2×3 and 2×4 pieces, largest first in the left Side while it fits, then the right, the largest alone able to take the left Side and the top of the right, from 75% up; `MIX_CASES` numbers the ones with up to 11 colours (one per Mix case colour) as the page shows them, `nearestMixCase` picks the one with as many colours nearest a set of values, and `caseValues` draws random values that snap back to a case (the Playground's Mix case picker, `src/components/MixCasePicker.tsx`, loads them into a Portfolio); the Mix cases page (`#cases`, `src/components/MixCases.tsx`) draws them.
- `src/core/brick.ts`: `generateBrick` draws a Brick on the Brick grid (4×4 by default; 8×8, 16×16, 4×6 and 8×12 on the Bricks tab) with the Pattern Builder's generator, vendored in `src/vendor/fnm-core` (see its README).
- `src/core/brickTemplates.ts`: `BRICK_TEMPLATES` lists every Brick template, one per Reference Pattern with a Brick family and Slope, drawn on the Brick grid by area (`templateMask`, Reference set 3) as block's Brick gallery does; `drawBrickTemplates` picks from the ones in draws for the Bricks tab's Brick buttons. The Brick templates page (`#templates`, `src/components/BrickTemplates.tsx`) picks which are in draws. Generated Bricks stay on Reference set 2 so a seed keeps its Brick.
- `src/core/planTypes.ts`: the Plan types every Plan is one of, seeded from `planTypes.json` (the plan picker's plans, then หุ้นไทย, หุ้นต่างประเทศ, บัญชี e-Savings and หุ้นกู้). `drawPlanTypes` picks the ones in draws for a new Plan, the Plan's Draw button and a picked Mix case. The Bricks tab edits each type's name, Plan colour and Brick; every Plan of that type follows.
- Plan colours come from neon `theme/tokens/colors.json`; the light theme from `theme.json`.
