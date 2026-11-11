// The code that runs inside Figma, on the Bricks page, through the Figma MCP's `use_figma`.
// scripts/figma-bricks.mjs pastes this file after the data of one call (with `export` and the
// comments taken out), so it imports nothing and uses only what Figma's plugin sandbox has. Node
// loads the same file for the tests and to work out what a read-back should say.

export const SIZES = ['2x2', '4x4', '8x8', '16x16', '32x32']
export const FRAME = 24
// A variant with a `Tile` behind its Brick keeps the Brick this far inside the frame on every side.
export const TILE_INSET = 3

// The export has the four square Brick grids; the page's `Size=32x32` takes the 16×16 Brick.
export function gridOf(size) {
  return size === '32x32' ? '16x16' : size
}

export function hash(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

// SVG path data to closed loops of points. A curve counts as a line to its end point and marks
// the path `curved`, so a vector with one never reads as a Brick of the export.
export function parsePath(data) {
  const loops = []
  let loop = null
  let curved = false
  const tokens = data.trim().split(/[\s,]+/)
  let i = 0
  while (i < tokens.length) {
    const command = tokens[i++]
    if (command === 'Z' || command === 'z') {
      loop = null
      continue
    }
    const take = command === 'C' ? 6 : command === 'Q' ? 4 : 2
    if (command !== 'M' && command !== 'L') curved = true
    const numbers = tokens.slice(i, i + take).map(Number)
    i += take
    if (command === 'M' || !loop) {
      loop = []
      loops.push(loop)
    }
    loop.push([numbers[take - 2], numbers[take - 1]])
  }
  return { loops, curved }
}

function fillsPoint(path, x, y) {
  let winding = 0
  let crossings = 0
  for (const loop of path.loops) {
    for (let k = 0; k < loop.length; k++) {
      const [x1, y1] = loop[k]
      const [x2, y2] = loop[(k + 1) % loop.length]
      if (y1 <= y === y2 <= y) continue
      if (x1 + ((y - y1) / (y2 - y1)) * (x2 - x1) <= x) continue
      crossings++
      winding += y2 > y1 ? 1 : -1
    }
  }
  if (path.rule === 'EVENODD') return crossings % 2 === 1
  return path.rule === 'NONZERO' && winding !== 0
}

// What a `Brick` vector draws, in words that do not depend on how its path is written: the cells of
// its Brick grid whose centre it fills, its box in the frame, and its corner points. Two vectors
// with the same description draw the same Brick in the same place.
export function describeVector(vector, side, inset) {
  const round = (value) => Math.round(value * 1000) / 1000 + 0
  const paths = vector.vectorPaths.map((p) => {
    const parsed = parsePath(p.data)
    return { rule: p.windingRule, loops: parsed.loops, curved: parsed.curved }
  })
  const cell = (FRAME - 2 * inset) / side
  const rows = []
  for (let r = 0; r < side; r++) {
    let row = ''
    for (let c = 0; c < side; c++) {
      const x = inset + (c + 0.5) * cell - vector.x
      const y = inset + (r + 0.5) * cell - vector.y
      row += paths.some((p) => fillsPoint(p, x, y)) ? '#' : '.'
    }
    rows.push(row)
  }
  const points = new Set()
  for (const p of paths) for (const loop of p.loops) for (const [x, y] of loop) points.add(`${round(x + vector.x)},${round(y + vector.y)}`)
  const box = [vector.x, vector.y, vector.width, vector.height].map(round).join(',')
  return [rows.join('/'), box, Array.from(points).sort().join(' '), paths.some((p) => p.curved) ? 'curved' : 'straight'].join('|')
}

// One line for a component set: what its five `Brick` vectors draw, hashed.
export function setDigest(describe) {
  return hash(SIZES.map((size) => `${size}:${describe(size)}`).join('\n'))
}

function variantProblem(component, tile) {
  if (component.type !== 'COMPONENT') return `is a ${component.type}`
  if (Math.abs(component.width - FRAME) > 0.01 || Math.abs(component.height - FRAME) > 0.01) return `is ${component.width}×${component.height}, not ${FRAME}×${FRAME}`
  const holds = component.children.map((child) => `${child.type} ${child.name}`).join(', ')
  const wanted = tile ? 'RECTANGLE Tile, VECTOR Brick' : 'VECTOR Brick'
  if (holds !== wanted) return `holds ${holds || 'nothing'}, not ${wanted}`
  const [[a, b], [c, d]] = component.children[component.children.length - 1].relativeTransform
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return 'its Brick is rotated, flipped or scaled'
  return null
}

// Matches the page to the export by name: every name is one component set `Brick/<name>` with
// exactly the five `Size=` variants, each a 24×24 component holding one vector `Brick` (behind it a
// `Tile` in the sets of `tileSets`, and nowhere else). Anything else is a problem, in words.
export function matchSets(page, names, tileSets) {
  const problems = []
  const matched = []
  const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).filter((set) => set.name.startsWith('Brick/'))
  for (const set of sets) if (!names.includes(set.name)) problems.push(`${set.name}: on the page, not in the export`)
  for (const name of names) {
    const found = sets.filter((set) => set.name === name)
    if (found.length !== 1) {
      problems.push(`${name}: ${found.length} component sets on the page`)
      continue
    }
    const tile = tileSets.includes(name)
    const variants = {}
    for (const child of found[0].children) if (!SIZES.some((size) => child.name === `Size=${size}`)) problems.push(`${name}: a variant ${child.name}, which is no size of the export`)
    for (const size of SIZES) {
      const components = found[0].children.filter((child) => child.name === `Size=${size}`)
      const problem = components.length === 1 ? variantProblem(components[0], tile) : `${components.length} variants`
      if (problem) problems.push(`${name} Size=${size}: ${problem}`)
      else variants[size] = components[0].children[components[0].children.length - 1]
    }
    matched.push({ name, inset: tile ? TILE_INSET : 0, variants })
  }
  return { problems, matched }
}

async function bricksPage(figma, id) {
  const page = await figma.getNodeByIdAsync(id)
  await figma.setCurrentPageAsync(page)
  return page
}

// Reads the page and changes nothing: the problems of the match, one digest per matched component
// set, and two digests of the whole page, one of its nodes (id, type, name, parent) and one of
// their fills, to hold a later read against.
export async function inspectBricks(figma, data) {
  const page = await bricksPage(figma, data.page)
  const { problems, matched } = matchSets(page, data.names, data.tileSets)
  const digests = {}
  let vectors = 0
  for (const { name, inset, variants } of matched) {
    if (SIZES.some((size) => !variants[size])) continue
    vectors += SIZES.length
    digests[name] = setDigest((size) => describeVector(variants[size], Number(gridOf(size).split('x')[0]), inset))
  }
  const nodes = page.findAll(() => true)
  const fills = nodes.filter((node) => 'fills' in node).map((node) => `${node.id}|${typeof node.fills === 'symbol' ? 'mixed' : JSON.stringify(node.fills)}`)
  return {
    problems,
    sets: Object.keys(digests).length,
    vectors,
    tiles: matched.filter((set) => set.inset > 0).map((set) => set.name),
    nodes: nodes.length,
    pageDigest: hash(nodes.map((node) => `${node.id}|${node.type}|${node.name}|${node.parent.id}`).join('\n')),
    fillsDigest: hash(fills.join('\n')),
    digests,
  }
}

// Writes the geometry of the `Brick` vectors of the component sets in `data.bricks`, each
// `{ size: [x, y, path data] }`, and nothing else. The whole page must match first: with any
// problem it writes nothing.
export async function writeBricks(figma, data) {
  const page = await bricksPage(figma, data.page)
  const { problems, matched } = matchSets(page, data.names, data.tileSets)
  if (problems.length > 0) return { written: 0, problems, mutatedNodeIds: [] }
  const mutatedNodeIds = []
  for (const { name, variants } of matched) {
    if (!data.bricks[name]) continue
    for (const size of SIZES) {
      const [x, y, path] = data.bricks[name][gridOf(size)]
      const vector = variants[size]
      vector.vectorPaths = [{ windingRule: 'NONZERO', data: path }]
      vector.x = x
      vector.y = y
      mutatedNodeIds.push(vector.id)
    }
  }
  return { written: mutatedNodeIds.length, problems, mutatedNodeIds }
}
