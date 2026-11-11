#!/usr/bin/env node
// Picks every exported Plan type's Brick from its Strategy on the four square Brick grids, with
// the Pattern Builder's rule (src/vendor/fnm-core/preset.ts), and stores the result in
// src/core/pickedBricks.json. The search is slow (16×16 takes a minute or so), which is why Bricks
// are picked here ahead of time and not in the browser. Loads src/ through Vite, so it runs the
// same code as the app.
// Usage: npm run bricks:pick    writes the stored file
//        npm run bricks:check   reruns the pick and fails if the stored file differs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runnerImport } from 'vite'

const check = process.argv.includes('--check')
const src = path.resolve(import.meta.dirname, '../src')
const stored = path.join(src, 'core/pickedBricks.json')
const load = async (file) => (await runnerImport(path.join(src, file), { configFile: false, logLevel: 'error', resolve: { alias: { '@': src } } })).module

const { defaultPlanTypes } = await load('core/planTypes.ts')
const { pickBricks, pickSummary } = await load('core/pickBricks.ts')
const { SQUARE_SIDES, squareGrid, pickedBricksJson } = await load('core/pickedBricks.ts')

const types = defaultPlanTypes()
const picked = {}
for (const side of SQUARE_SIDES) {
  const started = Date.now()
  let bricks
  try {
    bricks = pickBricks(types, side)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
  const { bricks: count, exact, distinct, hanging } = pickSummary(bricks, side)
  console.log(`${`${side}×${side}`.padEnd(5)}  exact ${exact}/${count}  distinct ${distinct}  hanging ${hanging}  (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  for (const [id, brick] of Object.entries(bricks)) (picked[id] ??= {})[squareGrid(side)] = brick
}

const json = pickedBricksJson(picked)
const name = path.relative(path.resolve(import.meta.dirname, '..'), stored)
if (!check) {
  writeFileSync(stored, json)
  console.log(`Wrote ${name}`)
  process.exit(0)
}

const before = readFileSync(stored, 'utf8')
if (before === json) {
  console.log(`${name} matches what the rule picks.`)
  process.exit(0)
}
// Which Bricks moved: the stored file can also differ by a Plan type added, removed or reordered.
const was = JSON.parse(before)
const differs = []
for (const id of new Set([...Object.keys(was), ...Object.keys(picked)]))
  for (const grid of SQUARE_SIDES.map(squareGrid)) {
    const [a, b] = [was[id]?.[grid], picked[id]?.[grid]].map((brick) => JSON.stringify(brick))
    if (a !== b) differs.push(`${id} ${grid}: stored ${a ?? 'nothing'}, picked ${b ?? 'nothing'}`)
  }
console.error(`${name} differs from what the rule picks; run npm run bricks:pick and commit the result.\n${differs.join('\n') || 'Same Bricks, in another order or format.'}`)
process.exit(1)
