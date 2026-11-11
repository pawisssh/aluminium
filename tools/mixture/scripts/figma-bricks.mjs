#!/usr/bin/env node
// Prepares and checks the write of the exported Bricks to the Bricks page in Figma
// (file mhiTYT602sghheKpRM2Rx6, "[v3] Foundations - Icons"). It never talks to Figma: it prints the
// code of one `use_figma` call of the Figma MCP, built from brickVectors.json (`npm run
// bricks:export`) and scripts/figma-bricks-plugin.mjs, and holds what a call returned against the
// export. The routine, call by call, is the project skill .claude/skills/bricks-to-figma.
// Usage: node scripts/figma-bricks.mjs inspect
//        node scripts/figma-bricks.mjs write <part>          (1 to 4)
//        node scripts/figma-bricks.mjs compare <after.json> [<before.json>]
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeVector, FRAME, gridOf, parsePath, setDigest, SIZES, TILE_INSET } from './figma-bricks-plugin.mjs'

export const BRICKS_PAGE = '2117:19'
// The component sets whose variants hold a `Tile` behind the Brick: their Brick is drawn in the
// 18×18 box inside the Tile, not on the whole frame.
export const TILE_SETS = ['Brick/RMF for Retirement', 'Brick/Savings', 'Brick/KKP Finsave']
// One write call per part, so the data of a call stays short enough to pass on without a slip.
export const WRITE_PARTS = 4

const tidy = (value) => Number(value.toFixed(4))

// An exported Brick as its `Brick` vector holds it: the node's place in the 24×24 frame and the
// path from the node's own top left corner, scaled into the box `inset` px inside the frame.
export function placedBrick(brick, inset) {
  const scale = (FRAME - 2 * inset) / FRAME
  const place = (value) => tidy(inset + value * scale)
  const x = place(brick.bounds.x)
  const y = place(brick.bounds.y)
  const loops = parsePath(brick.path).loops.map((loop) => `${loop.map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${tidy(place(px) - x)} ${tidy(place(py) - y)}`).join(' ')} Z`)
  return { x, y, width: tidy(brick.bounds.width * scale), height: tidy(brick.bounds.height * scale), data: loops.join(' ') }
}

const insetOf = (name) => (TILE_SETS.includes(name) ? TILE_INSET : 0)

// What reading each component set back from Figma must give once the export is written.
export function expectedDigests(vectors) {
  const digest = ([name, sizes]) => [
    name,
    setDigest((size) => {
      const brick = sizes[gridOf(size)]
      const placed = placedBrick(brick, insetOf(name))
      const description = describeVector({ ...placed, vectorPaths: [{ windingRule: 'NONZERO', data: placed.data }] }, brick.cells.length, insetOf(name))
      if (!description.startsWith(`${brick.cells.join('/')}|`)) throw new Error(`${name} ${size}: the outline does not fill the cells of its Brick`)
      return description
    }),
  ]
  return Object.fromEntries(Object.entries(vectors.bricks).map(digest))
}

export function inspectData(vectors) {
  return { page: BRICKS_PAGE, names: Object.keys(vectors.bricks), tileSets: TILE_SETS }
}

export function writeData(vectors, part) {
  const names = Object.keys(vectors.bricks)
  const perPart = Math.ceil(names.length / WRITE_PARTS)
  const placed = (name, [grid, brick]) => {
    const { x, y, data } = placedBrick(brick, insetOf(name))
    return [grid, [x, y, data]]
  }
  const bricks = names.slice((part - 1) * perPart, part * perPart).map((name) => [name, Object.fromEntries(Object.entries(vectors.bricks[name]).map((entry) => placed(name, entry)))])
  return { ...inspectData(vectors), bricks: Object.fromEntries(bricks) }
}

// The code of one `use_figma` call: the call's data, the plugin file without `export`, comments and
// indentation, and the call itself.
export function figmaCode(call, data) {
  const plugin = readFileSync(path.join(import.meta.dirname, 'figma-bricks-plugin.mjs'), 'utf8')
  const lines = plugin.split('\n').map((line) => line.trim().replace(/^export /, ''))
  return `const DATA = ${JSON.stringify(data)}\n${lines.filter((line) => line && !line.startsWith('//')).join('\n')}\nreturn await ${call}(figma, DATA)\n`
}

// Holds what `inspectBricks` returned after the write against the export and, with `before`,
// against what it returned before the write. `ok` only when every component set equals the export
// and no node or fill changed.
export function compareBricks(vectors, after, before) {
  const expected = expectedDigests(vectors)
  const names = Object.keys(expected)
  const different = names.filter((name) => after.digests[name] !== expected[name])
  const lines = after.problems.map((problem) => `Problem: ${problem}`)
  lines.push(`Read back ${after.vectors} Brick vectors in ${after.sets} component sets (${after.tiles.length} with a Tile).`)
  lines.push(`${names.length - different.length} of ${names.length} component sets equal the export in all ${SIZES.length} sizes (${(names.length - different.length) * SIZES.length} of ${names.length * SIZES.length} vectors).`)
  for (const name of different) lines.push(`Differs from the export: ${name}`)
  let unchanged = true
  if (before) {
    const sameNodes = before.pageDigest === after.pageDigest && before.nodes === after.nodes
    const sameFills = before.fillsDigest === after.fillsDigest
    lines.push(sameNodes ? `Nodes: the same ${after.nodes} as before the write (id, type, name and parent).` : `Nodes: changed since before the write (${before.nodes} then, ${after.nodes} now).`)
    lines.push(sameFills ? 'Fills: as they were before the write.' : 'Fills: changed since before the write.')
    unchanged = sameNodes && sameFills
  }
  return { ok: after.problems.length === 0 && different.length === 0 && unchanged, lines }
}

function main([command, ...args]) {
  const root = path.resolve(import.meta.dirname, '..')
  const exported = path.join(root, 'brickVectors.json')
  const usage = 'Usage: figma-bricks.mjs inspect | write <part 1 to 4> | compare <after.json> [<before.json>]'
  if (!existsSync(exported)) return fail('brickVectors.json is missing: run `npm run bricks:export` first.')
  const vectors = JSON.parse(readFileSync(exported, 'utf8'))
  const read = (file) => JSON.parse(readFileSync(path.resolve(file), 'utf8'))
  if (command === 'inspect') return process.stdout.write(figmaCode('inspectBricks', inspectData(vectors)))
  if (command === 'write') {
    const part = Number(args[0])
    if (!Number.isInteger(part) || part < 1 || part > WRITE_PARTS) return fail(usage)
    return process.stdout.write(figmaCode('writeBricks', writeData(vectors, part)))
  }
  if (command === 'compare' && args[0]) {
    const { ok, lines } = compareBricks(vectors, read(args[0]), args[1] && read(args[1]))
    console.log(lines.join('\n'))
    if (!ok) process.exit(1)
    return
  }
  fail(usage)
}

function fail(message) {
  console.error(message)
  process.exit(2)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2))
