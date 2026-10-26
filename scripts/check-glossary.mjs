#!/usr/bin/env node
// Fails when code under tools/ uses a word GLOSSARY.md lists under _Avoid_ or _Avoid in code_, or
// when the files given ("-" for stdin) use one listed under _Avoid_: an _Avoid in code_ word has an
// everyday meaning too (a table's column), so prose may use it. The commit-msg hook and the PR text
// workflow pass their text on stdin.
// Run from anywhere: node scripts/check-glossary.mjs [file ...]
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', 'vendor', 'ui'])
const EXTENSIONS = /\.(ts|tsx|md|css)$/
// Avoid terms that are also ordinary UI-library words (shadcn's `toggle-group`, `size="icon"`).
const GENERIC = new Set(['group', 'icon'])

// "_Avoid_: Block (one rectangle …), icon" → ['icon']: a term with a parenthetical has its own
// meaning elsewhere, so only the bare terms are banned.
const glossary = readFileSync(path.join(root, 'GLOSSARY.md'), 'utf8').split('\n')
const terms = (label) =>
  glossary
    .filter((line) => line.startsWith(label))
    .flatMap((line) => line.slice(label.length).replace(/\w+\s*\([^)]*\)/g, '').split(','))
    .map((term) => term.trim())
    .filter((term) => term && !GENERIC.has(term.toLowerCase()))

const given = process.argv.slice(2)
const avoid = [...new Set(given.length ? terms('_Avoid_:') : [...terms('_Avoid_:'), ...terms('_Avoid in code_:')])]
const patterns = avoid.map((term) => ({ term, re: new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}s?\\b`, 'i') }))

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* files(path.join(dir, entry.name))
    } else if (EXTENSIONS.test(entry.name)) yield path.join(dir, entry.name)
  }
}

const sources = given.length
  ? given.map((file) => ({ name: file === '-' ? 'stdin' : file, text: readFileSync(file === '-' ? 0 : file, 'utf8') }))
  : [...files(path.join(root, 'tools'))].map((file) => ({ name: path.relative(root, file), text: readFileSync(file, 'utf8') }))

const hits = []
for (const { name, text } of sources)
  text.split('\n').forEach((line, i) => {
    for (const { term, re } of patterns) if (re.test(line)) hits.push(`${name}:${i + 1}: "${term}" (see GLOSSARY.md)`)
  })

if (hits.length) {
  console.error(`Glossary: ${hits.length} use(s) of avoided terms\n${hits.join('\n')}`)
  process.exit(1)
}
console.log(`Glossary: no avoided terms (${avoid.length} checked)`)
