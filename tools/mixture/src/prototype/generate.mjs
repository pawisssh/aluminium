#!/usr/bin/env node
// PROTOTYPE, throwaway: picks every Plan type's Brick under each candidate rule (see initialCost.ts)
// and writes picks.json for the #prototype page, since the 16×16 search is too slow to run in the browser.
// Usage: node tools/mixture/src/prototype/generate.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { runnerImport } from 'vite'

const src = path.resolve(import.meta.dirname, '..')
const { module: m } = await runnerImport(path.join(src, 'prototype/initialCost.ts'), { configFile: false, logLevel: 'error', resolve: { alias: { '@': src } } })

const picks = {}
for (const rule of m.RULES) {
  picks[rule.id] = {}
  for (const side of m.SIDES) {
    const picked = m.pickAll(rule, side)
    picks[rule.id][side] = picked.map((p) => ({
      id: p.strategy.id,
      blocks: p.candidate ? p.candidate.blocks.map((b) => [b.col, b.row, b.w, b.h]) : [],
      top: p.candidate ? [p.candidate.top.w, p.candidate.top.h] : null,
      exact: p.miss < 1e-9,
      allowed: p.allowed,
      repeat: p.repeat,
      settings: p.candidate?.settings ?? '',
    }))
    const exact = picked.filter((p) => p.miss < 1e-9).length
    console.log(`${rule.id} ${side}×${side}: exact ${exact}/${picked.length}, distinct ${new Set(picked.map((p) => p.candidate?.key)).size}`)
  }
}
writeFileSync(path.join(src, 'prototype/picks.json'), JSON.stringify(picks) + '\n')
