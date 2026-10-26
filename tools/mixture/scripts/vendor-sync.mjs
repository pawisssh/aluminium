#!/usr/bin/env node
// Replaces src/vendor/fnm-core with block's packages/core/src (no tests) at a ref, read with
// `git show` so the block checkout's working tree is left alone.
// Usage: npm run vendor:sync -- [ref]   (default origin/main; BLOCK_REPO overrides block's path)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SOURCE = 'packages/core/src'
const vendor = path.resolve(import.meta.dirname, '../src/vendor/fnm-core')
const readme = path.join(vendor, 'README.md')

// The main checkout's parent, so this also finds block from inside a .claude/worktrees worktree.
const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: vendor, encoding: 'utf8' })
const block = process.env.BLOCK_REPO ?? path.resolve(path.dirname(commonDir.trim()), '../block')
const git = (...args) => execFileSync('git', ['-C', block, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

git('fetch', '--quiet', 'origin')
const ref = process.argv[2] ?? 'origin/main'
const sha = git('rev-parse', '--verify', `${ref}^{commit}`).trim()

const wanted = git('ls-tree', '-r', '--name-only', sha, SOURCE)
  .split('\n')
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .map((file) => path.relative(SOURCE, file))

function* vendored(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* vendored(file)
    else if (entry.name.endsWith('.ts')) yield path.relative(vendor, file)
  }
}
const before = new Map([...vendored(vendor)].map((file) => [file, readFileSync(path.join(vendor, file), 'utf8')]))

for (const entry of readdirSync(vendor)) if (entry !== 'README.md') rmSync(path.join(vendor, entry), { recursive: true })
let changed = 0
for (const file of wanted) {
  const content = git('show', `${sha}:${SOURCE}/${file}`)
  mkdirSync(path.dirname(path.join(vendor, file)), { recursive: true })
  writeFileSync(path.join(vendor, file), content)
  if (before.has(file) && before.get(file) !== content) changed++
}
const added = wanted.filter((file) => !before.has(file)).length
const removed = [...before.keys()].filter((file) => !wanted.includes(file)).length

writeFileSync(readme, readFileSync(readme, 'utf8').replace(/(finnomena\/block` at `)[0-9a-f]{40}/, `$1${sha}`))

const behind = git('rev-list', '--count', `${sha}..origin/main`).trim()
console.log(`fnm-core is now block ${sha.slice(0, 7)}: ${changed} changed, ${added} added, ${removed} removed.`)
console.log(behind === '0' ? 'Up to date with origin/main.' : `${behind} commits behind origin/main.`)
