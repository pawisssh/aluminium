#!/usr/bin/env node
// Writes every exported Plan type's stored Brick as a vector for its component on the Bricks page
// in Figma: one outline per Plan type and square Brick grid, 136 in all, in brickVectors.json
// (git-ignored: run this whenever the vectors are needed). It reads src/core/pickedBricks.json and
// redraws each Brick, with no search, so it takes about a second. Loads src/ through Vite
// (load-src.mjs), so it runs the same code as the app. The file's format is in the README.
// Usage: npm run bricks:export
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { load } from './load-src.mjs'

const started = Date.now()
const root = path.resolve(import.meta.dirname, '..')
const written = path.join(root, 'brickVectors.json')

const { defaultPlanTypes } = await load('core/planTypes.ts')
const { brickVectors } = await load('core/brickVectors.ts')

let vectors
try {
  vectors = brickVectors(defaultPlanTypes())
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
writeFileSync(written, `${JSON.stringify(vectors, null, 2)}\n`)
const sizes = Object.values(vectors.bricks)
console.log(`Wrote ${path.relative(root, written)}: ${sizes.flatMap(Object.values).length} outlines for ${sizes.length} Plan types (${((Date.now() - started) / 1000).toFixed(1)} s)`)
