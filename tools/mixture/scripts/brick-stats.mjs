#!/usr/bin/env node
// Counts the distinct Brick shapes generateBrick draws per family/Slope, so a change to brick.ts or
// the vendored core can be measured. Loads src/ through Vite, so it sees the same code as the app.
// Usage: npm run brick-stats -- [--seeds N] [--save file.json] [--compare file.json] [--show family/slope]
//   --save writes the counts and seeds s0–s5 per family/Slope; --compare prints a saved run → this
//   run; --show draws seeds s0–s5 of one family/Slope (beside the saved ones with --compare).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { runnerImport } from 'vite'

const FAMILIES = ['auto', 'rising', 'hanging', 'mountain']
const SLOPES = ['flat', 'half', '75']
const SAMPLES = 6

const { values: args } = parseArgs({ options: { seeds: { type: 'string', default: '10000' }, save: { type: 'string' }, compare: { type: 'string' }, show: { type: 'string' } } })
const src = path.resolve(import.meta.dirname, '../src')
const { module: brick } = await runnerImport(path.join(src, 'core/brick.ts'), { configFile: false, logLevel: 'error', resolve: { alias: { '@': src } } })

const draw = (family, slope, seed) => brick.generateBrick({ family, slope, seed }).map((row) => row.map((on) => (on ? '#' : '.')).join(''))

const run = {}
for (const family of FAMILIES)
  for (const slope of SLOPES) {
    const shapes = new Set()
    for (let i = 0; i < Number(args.seeds); i++) shapes.add(draw(family, slope, `s${i}`).join('/'))
    run[`${family}/${slope}`] = { distinct: shapes.size, samples: Array.from({ length: SAMPLES }, (_, i) => draw(family, slope, `s${i}`)) }
  }

const before = args.compare && JSON.parse(readFileSync(args.compare, 'utf8'))
const cell = (key) => (before ? `${before[key]?.distinct ?? '-'} → ${run[key].distinct}` : String(run[key].distinct))
console.log(`Distinct Brick shapes over ${args.seeds} seeds${before ? ` (${args.compare} → now)` : ''}:\n`)
console.log(['', ...SLOPES].map((s) => s.padEnd(12)).join(''))
for (const family of FAMILIES) console.log([family, ...SLOPES.map((slope) => cell(`${family}/${slope}`))].map((s) => s.padEnd(12)).join(''))

if (args.show) {
  const rows = (samples) => samples[0].map((_, r) => samples.map((s) => s[r]).join(' '))
  const now = rows(run[args.show].samples)
  const then = before && rows(before[args.show].samples)
  console.log(`\n${args.show}, seeds s0–s${SAMPLES - 1}${then ? ' (before, after)' : ''}:`)
  for (let r = 0; r < now.length; r++) console.log(then ? `${then[r]}     ${now[r]}` : now[r])
}

if (args.save) {
  writeFileSync(args.save, `${JSON.stringify(run, null, 1)}\n`)
  console.log(`\nSaved to ${args.save}`)
}
