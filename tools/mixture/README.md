# Mixture

A playground for how a Portfolio's allocation reads as a **Mix** (a 4×4 grid of Plan colours, always one of the 32 kept Mix cases) and how each Plan type's **Brick** looks. Terms are defined in the repo's [`GLOSSARY.md`](../../GLOSSARY.md).

```bash
npm install
npm run dev        # http://localhost:5173; the browser console logs which checkout it serves
npm test           # core logic: src/core
npm run typecheck
npm run check      # typecheck, tests, lint, glossary terms: what CI runs
npm run probe -- <file>  # a test file with console.log shown (vitest hides it by default)
npm run brick-stats -- --save before.json  # distinct Brick shapes per family/Slope; --compare before.json, --show mountain/half
npm run vendor:check     # vendored fnm-core matches block at its README hash (CI runs this too)
```

- `src/core/mix.ts`: `buildMix` turns Plan values into a Mix: it ranks the Plan colours by value, keeps up to 11, and draws the Mix case nearest their values (`nearestMixCase`).
- `src/core/mixCases.ts`: `mixCases` lists every Mix case, a 4×4 Mix cut into 1×1, 2×1, 2×2, 2×3 and 2×4 pieces, largest first in the left Side while it fits, then the right, the largest alone able to take the left Side and the top of the right, from 75% up, all but `DROPPED_CASES` (20 of the 52 with up to 11 colours); `MIX_CASES` numbers the 32 left 1 to 32, one colour per Mix case colour, as the page shows them, `nearestMixCase` picks the one with as many colours nearest a set of values, and `caseValues` draws random values that snap back to a case (the Playground's Mix case picker, `src/components/MixCasePicker.tsx`, loads them into a Portfolio); the Mix cases page (`#cases`, `src/components/MixCases.tsx`) draws them.
- `src/core/brick.ts`: `generateBrick` draws a Brick on the Brick grid (4×4 by default; 8×8, 16×16, 4×6 and 8×12 on the Bricks tab) with the Pattern Builder's generator, vendored in `src/vendor/fnm-core` (see its README).
- `src/core/planTypes.ts`: the 38 Plan types every Plan is one of, seeded from `planTypes.json`: the 34 on the Bricks page in Figma, in its order, then Investment Call, หุ้นไทย, หุ้นต่างประเทศ and หุ้นกู้. Each has its Brick settings (matched to its Plan Cover where it has one) and whether it's in draws; one of the 34 also has its Collection (`collections.json` lists the eight in the page's order) and its Strategy, and is exported: `exportedPlanTypes` gives those, Collection by Collection. `drawPlanTypes` picks the ones in draws for a new Plan, the Plan's Draw button and a picked Mix case. The Bricks tab edits each type's name, Plan colour and Brick, and shows an exported one's Collection and Strategy; every Plan of that type follows.
- `src/core/strategy.ts`: a Plan type's Strategy: Investment Style, Risk (one level or a range) and Initial Cost (one of `INITIAL_COST_STEPS`), then Monthly Cost, Expected Return and Content Type where the plan picker shows them, and which of the values are guesses (`guesses`). A Strategy is changed in `planTypes.json`; `strategyLine` words it for the Bricks tab.
- `src/core/planCovers.ts`: each Plan type's Plan Cover (`planCovers.json`, 16×16 cells from Figma), `coverMatch` to score a Brick against it, and `closestBricks` to search seeds for the best ones. On the Bricks tab each card shows its Plan Cover and match, and Closest Bricks lists picks to apply. Copy planTypes.json copies every Plan type in the file's format, to paste over `src/core/planTypes.json` as the new defaults.
- Plan colours come from neon `theme/tokens/colors.json`; the light theme from `theme.json`.
