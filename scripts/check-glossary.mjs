#!/usr/bin/env node
// Fails when code under tools/ uses a word GLOSSARY.md lists under _Avoid_.
// Run from anywhere: node scripts/check-glossary.mjs
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', 'vendor', 'ui'])
const EXTENSIONS = /\.(ts|tsx|md|css)$/
// Avoid terms that are also ordinary UI-library words (shadcn's `toggle-group`, `size="icon"`).
const GENERIC = new Set(['group', 'icon'])

// "_Avoid_: Block (one rectangle …), icon" → ['icon']: a term with a parenthetical has its own
// meaning elsewhere, so only the bare terms are banned.
const avoid = readFileSync(path.join(root, 'GLOSSARY.md'), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('_Avoid_:'))
  .flatMap((line) => line.slice('_Avoid_:'.length).replace(/\w+\s*\([^)]*\)/g, '').split(','))
  .map((term) => term.trim())
  .filter((term) => term && !GENERIC.has(term.toLowerCase()))

const patterns = avoid.map((term) => ({ term, re: new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}s?\\b`, 'i') }))

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* files(path.join(dir, entry.name))
    } else if (EXTENSIONS.test(entry.name)) yield path.join(dir, entry.name)
  }
}

const hits = []
for (const file of files(path.join(root, 'tools'))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const { term, re } of patterns) if (re.test(line)) hits.push(`${path.relative(root, file)}:${i + 1}: "${term}" (see GLOSSARY.md)`)
    })
}

if (hits.length) {
  console.error(`Glossary: ${hits.length} use(s) of avoided terms\n${hits.join('\n')}`)
  process.exit(1)
}
console.log(`Glossary: no avoided terms (${avoid.length} checked)`)
