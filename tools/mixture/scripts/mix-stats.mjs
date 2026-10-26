#!/usr/bin/env node
// Runs buildMix's Ordered layout over every way to split a 4×4 and an 8×8 Mix's cells between up
// to --colours Plan colours (6 by default, 12 at most: one per colour family), and counts the cases
// worth watching, so a change to mix.ts can be measured. Loads src/ through Vite, so it sees the
// same code as the app.
// Usage: npm run mix-stats -- [--colours N] [--save file.json] [--compare file.json] [--show case]
//   --save writes the counts; --compare prints a saved run → this run; --show draws the first few
//   Mixes counted under one case (e.g. --show "skip ahead"), family initials largest first.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { runnerImport } from 'vite'

const SIZES = [4, 8]
const SAMPLES = 6
const CASES = {
  'largest spans': 'the largest colour has cells in both Sides',
  'one-cell spill': 'the largest colour has a single cell in one Side',
  'skip ahead': 'a smaller colour sits in the right Side while a larger one sits in the left',
  'others span': 'a colour other than the largest has cells in both Sides (should be 0)',
  'split pieces': 'a colour is in more than one edge-joined piece (should be 0)',
}

const { values: args } = parseArgs({ options: { colours: { type: 'string', default: '6' }, save: { type: 'string' }, compare: { type: 'string' }, show: { type: 'string' } } })
if (args.show && !(args.show in CASES)) {
  console.error(`Unknown case "${args.show}"; --show takes one of: ${Object.keys(CASES).map((c) => `"${c}"`).join(', ')}`)
  process.exit(1)
}
const src = path.resolve(import.meta.dirname, '../src')
const load = (file) => runnerImport(path.join(src, file), { configFile: false, logLevel: 'error', resolve: { alias: { '@': src } } }).then((r) => r.module)
const [{ buildMix, isOnePiece }, { COLOUR_FAMILIES, colourKey, colourFromKey }] = await Promise.all([load('core/mix.ts'), load('core/colours.ts')])
const families = Object.keys(COLOUR_FAMILIES)
const maxColours = Math.min(Number(args.colours), families.length)

/** Every split of `total` cells into at most `parts` shares, largest first. */
function* splits(total, parts, max = total) {
  if (total === 0) return yield []
  if (parts === 0) return
  for (let first = Math.min(total, max); first >= 1; first--) for (const rest of splits(total - first, parts - 1, first)) yield [first, ...rest]
}

/** How many of a colour's cells sit in each Side, and whether they make one edge-joined piece. */
function inspect(cells, key) {
  const size = cells.length
  const own = new Set()
  let left = 0
  let right = 0
  cells.flat().forEach((k, i) => {
    if (k !== key) return
    own.add(i)
    if (i % size < size / 2) left++
    else right++
  })
  return { left, right, spans: left > 0 && right > 0, whole: isOnePiece(own, size) }
}

function cases([largest, ...rest]) {
  const found = []
  if (largest.spans) found.push('largest spans')
  if (largest.spans && Math.min(largest.left, largest.right) === 1) found.push('one-cell spill')
  if (rest.some((a, i) => !a.right && rest.slice(i + 1).some((b) => b.right))) found.push('skip ahead')
  if (rest.some((a) => a.spans)) found.push('others span')
  if ([largest, ...rest].some((a) => !a.whole)) found.push('split pieces')
  return found
}

const run = {}
const shown = []
for (const size of SIZES) {
  const counts = { mixes: 0, ...Object.fromEntries(Object.keys(CASES).map((c) => [c, 0])) }
  for (const split of splits(size * size, maxColours)) {
    const slices = split.map((n, i) => ({ value: n, colour: { family: families[i], tint: 100 } }))
    const { cells } = buildMix(slices, size, { layout: 'ordered', seed: 'mix-stats' })
    const found = cases(slices.map((s) => inspect(cells, colourKey(s.colour))))
    counts.mixes++
    for (const c of found) counts[c]++
    if (args.show && found.includes(args.show) && shown.length < SAMPLES) shown.push({ size, split, cells })
  }
  run[size] = counts
}

const before = args.compare && JSON.parse(readFileSync(args.compare, 'utf8'))
const entry = (size, key) => (before ? `${before[size]?.[key] ?? '-'} → ${run[size][key]}` : String(run[size][key]))
console.log(`Ordered Mixes over every split into up to ${maxColours} of ${families.length} colours${before ? ` (${args.compare} → now)` : ''}:\n`)
console.log(['', ...SIZES.map((s) => `${s}×${s}`)].map((s, i) => s.padEnd(i ? 16 : 18)).join(''))
for (const key of ['mixes', ...Object.keys(CASES)]) console.log([key, ...SIZES.map((size) => entry(size, key))].map((s, i) => s.padEnd(i ? 16 : 18)).join(''))
console.log('')
for (const [key, meaning] of Object.entries(CASES)) console.log(`${key}: ${meaning}`)

if (args.show) {
  const initial = (key) => (key ? colourFromKey(key).family[0].toUpperCase() : '.')
  console.log(`\nFirst ${shown.length} Mixes counted under "${args.show}":`)
  for (const { size, split, cells } of shown) console.log(`\n${size}×${size}, cells ${split.join('/')}\n${cells.map((row) => row.map(initial).join('')).join('\n')}`)
}

if (args.save) {
  writeFileSync(args.save, `${JSON.stringify(run, null, 1)}\n`)
  console.log(`\nSaved to ${args.save}`)
}
