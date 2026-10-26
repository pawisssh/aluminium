#!/usr/bin/env node
// Runs buildMix's Ordered layout over every way to split a 4×4 and an 8×8 Mix's cells between up
// to --colours Plan colours, and counts the cases worth watching, so a change to mix.ts can be
// measured. Loads src/ through Vite, so it sees the same code as the app.
// Usage: npm run mix-stats -- [--colours N] [--save file.json] [--compare file.json] [--show case]
//   --save writes the counts; --compare prints a saved run → this run; --show draws the first few
//   Mixes counted under one case (e.g. --show skip-ahead), family initials largest first.
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
const src = path.resolve(import.meta.dirname, '../src')
const load = (file) => runnerImport(path.join(src, file), { configFile: false, logLevel: 'error', resolve: { alias: { '@': src } } }).then((r) => r.module)
const [mix, colours] = await Promise.all([load('core/mix.ts'), load('core/colours.ts')])
const families = Object.keys(colours.COLOUR_FAMILIES)
const maxColours = Math.min(Number(args.colours), families.length)

/** Every split of `total` cells into at most `parts` shares, largest first. */
function* splits(total, parts, max = total) {
  if (total === 0) return yield []
  if (parts === 0) return
  for (let first = Math.min(total, max); first >= 1; first--) for (const rest of splits(total - first, parts - 1, first)) yield [first, ...rest]
}

/** Which Sides each colour has cells in, and how many edge-joined pieces it is in. */
function inspect(cells, keys) {
  const size = cells.length
  return keys.map((key) => {
    const sides = new Set()
    const seen = new Set()
    let pieces = 0
    let leftCells = 0
    let rightCells = 0
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (cells[r][c] !== key) continue
        sides.add(c < size / 2 ? 'left' : 'right')
        if (c < size / 2) leftCells++
        else rightCells++
        if (seen.has(r * size + c)) continue
        pieces++
        const stack = [[r, c]]
        seen.add(r * size + c)
        while (stack.length) {
          const [y, x] = stack.pop()
          for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ny = y + dy
            const nx = x + dx
            if (ny < 0 || nx < 0 || ny >= size || nx >= size || cells[ny][nx] !== key || seen.has(ny * size + nx)) continue
            seen.add(ny * size + nx)
            stack.push([ny, nx])
          }
        }
      }
    return { sides, pieces, leftCells, rightCells }
  })
}

function cases(colourInfo) {
  const [largest, ...rest] = colourInfo
  const found = []
  if (largest.sides.size === 2) found.push('largest spans')
  if (largest.sides.size === 2 && Math.min(largest.leftCells, largest.rightCells) === 1) found.push('one-cell spill')
  if (rest.some((a, i) => a.sides.has('left') && a.sides.size === 1 && rest.slice(i + 1).some((b) => b.sides.has('right')))) found.push('skip ahead')
  if (rest.some((a) => a.sides.size === 2)) found.push('others span')
  if (colourInfo.some((a) => a.pieces > 1)) found.push('split pieces')
  return found
}

const run = {}
const shown = []
for (const size of SIZES) {
  const counts = { mixes: 0, ...Object.fromEntries(Object.keys(CASES).map((c) => [c, 0])) }
  for (const split of splits(size * size, maxColours)) {
    const slices = split.map((cells, i) => ({ value: cells, colour: { family: families[i], tint: 100 } }))
    const { cells } = mix.buildMix(slices, size, { layout: 'ordered', seed: 'mix-stats' })
    const found = cases(inspect(cells, slices.map((s) => colours.colourKey(s.colour))))
    counts.mixes++
    for (const c of found) counts[c]++
    if (args.show && found.includes(args.show) && shown.length < SAMPLES) shown.push({ size, split, cells })
  }
  run[size] = counts
}

const before = args.compare && JSON.parse(readFileSync(args.compare, 'utf8'))
const cell = (size, key) => (before ? `${before[size]?.[key] ?? '-'} → ${run[size][key]}` : String(run[size][key]))
console.log(`Ordered Mixes over every split into up to ${maxColours} colours${before ? ` (${args.compare} → now)` : ''}:\n`)
console.log(['', ...SIZES.map((s) => `${s}×${s}`)].map((s, i) => s.padEnd(i ? 16 : 18)).join(''))
for (const key of ['mixes', ...Object.keys(CASES)]) console.log([key, ...SIZES.map((size) => cell(size, key))].map((s, i) => s.padEnd(i ? 16 : 18)).join(''))
console.log('')
for (const [key, meaning] of Object.entries(CASES)) console.log(`${key}: ${meaning}`)

if (args.show) {
  const initial = (key) => (key ? colours.colourFromKey(key).family[0].toUpperCase() : '.')
  console.log(`\nFirst ${shown.length} Mixes counted under "${args.show}":`)
  for (const { size, split, cells } of shown) console.log(`\n${size}×${size}, cells ${split.join('/')}\n${cells.map((row) => row.map(initial).join('')).join('\n')}`)
}

if (args.save) {
  writeFileSync(args.save, `${JSON.stringify(run, null, 1)}\n`)
  console.log(`\nSaved to ${args.save}`)
}
