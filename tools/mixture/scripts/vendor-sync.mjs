#!/usr/bin/env node
// Replaces src/vendor/fnm-core with block's packages/core/src (no tests) at a ref, read with
// `git show` so the block checkout's working tree is left alone.
// Usage: npm run vendor:sync -- [ref]   (default origin/main; BLOCK_REPO overrides block's path)
//        npm run vendor:check           fails if the files differ from block at the README's hash
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SOURCE = 'packages/core/src'
const HASH = /(finnomena\/block` at `)([0-9a-f]{40})/
const vendor = path.resolve(import.meta.dirname, '../src/vendor/fnm-core')
const readme = path.join(vendor, 'README.md')
const check = process.argv.includes('--check')

// The main checkout's parent, so this also finds block from inside a .claude/worktrees worktree.
const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: vendor, encoding: 'utf8' })
const block = process.env.BLOCK_REPO ?? path.resolve(path.dirname(commonDir.trim()), '../block')
const git = (...args) => execFileSync('git', ['-C', block, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// The check needs only the README's commit, so it carries on with the last fetch when fetching
// fails, as on the CI runner, whose service has no keychain access for GitHub credentials.
let fetched = true
try {
  execFileSync('git', ['-C', block, 'fetch', '--quiet', 'origin'], { stdio: ['ignore', 'ignore', check ? 'ignore' : 'inherit'] })
} catch (error) {
  if (!check) throw error
  fetched = false
}
const ref = check ? readFileSync(readme, 'utf8').match(HASH)[2] : (process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'origin/main')
const sha = git('rev-parse', '--verify', `${ref}^{commit}`).trim()

const wanted = new Map(
  git('ls-tree', '-r', '--name-only', sha, SOURCE)
    .split('\n')
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => [path.relative(SOURCE, file), git('show', `${sha}:${file}`)]),
)

function* vendored(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* vendored(file)
    else if (entry.name.endsWith('.ts')) yield path.relative(vendor, file)
  }
}
const before = new Map([...vendored(vendor)].map((file) => [file, readFileSync(path.join(vendor, file), 'utf8')]))

const changed = [...wanted].filter(([file, content]) => before.has(file) && before.get(file) !== content).map(([file]) => file)
const added = [...wanted.keys()].filter((file) => !before.has(file))
const removed = [...before.keys()].filter((file) => !wanted.has(file))
const behind = Number(git('rev-list', '--count', `${sha}..origin/main`).trim())
const behindLine = `${behind === 0 ? 'Up to date with origin/main' : `${behind} commits behind origin/main; run npm run vendor:sync to update`}${fetched ? '' : ' (as of block\'s last fetch; fetching failed)'}.`

if (check) {
  const differs = [...changed.map((f) => `edited ${f}`), ...added.map((f) => `missing ${f}`), ...removed.map((f) => `extra ${f}`)]
  if (differs.length) {
    console.error(`fnm-core differs from block ${sha.slice(0, 7)} (the README's hash):\n${differs.join('\n')}`)
    process.exit(1)
  }
  console.log(`fnm-core matches block ${sha.slice(0, 7)}.`)
  console.log(behind && process.env.GITHUB_ACTIONS ? `::warning::fnm-core is ${behindLine}` : behindLine)
  process.exit(0)
}

for (const entry of readdirSync(vendor)) if (entry !== 'README.md') rmSync(path.join(vendor, entry), { recursive: true })
for (const [file, content] of wanted) {
  mkdirSync(path.dirname(path.join(vendor, file)), { recursive: true })
  writeFileSync(path.join(vendor, file), content)
}
writeFileSync(readme, readFileSync(readme, 'utf8').replace(HASH, `$1${sha}`))

console.log(`fnm-core is now block ${sha.slice(0, 7)}: ${changed.length} changed, ${added.length} added, ${removed.length} removed.`)
console.log(behindLine)
