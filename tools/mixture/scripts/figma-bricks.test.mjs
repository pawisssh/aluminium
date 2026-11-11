import { describe, expect, it } from 'vitest'
import { brickVectors } from '../src/core/brickVectors.ts'
import { defaultPlanTypes } from '../src/core/planTypes.ts'
import { describeVector, parsePath, SIZES } from './figma-bricks-plugin.mjs'
import { compareBricks, expectedDigests, figmaCode, inspectData, TILE_SETS, WRITE_PARTS, writeData } from './figma-bricks.mjs'

const vectors = brickVectors(defaultPlanTypes())
const names = Object.keys(vectors.bricks)
const AsyncFunction = (async () => {}).constructor
// Runs the code of one call the way `use_figma` does: as the body of an async function with `figma` in reach.
const call = (code, figma) => new AsyncFunction('figma', code)(figma)
const inspect = (figma) => call(figmaCode('inspectBricks', inspectData(vectors)), figma)
const write = (figma, part) => call(figmaCode('writeBricks', writeData(vectors, part)), figma)
const writeAll = async (figma) => {
  const results = []
  for (let part = 1; part <= WRITE_PARTS; part++) results.push(await write(figma, part))
  return results
}

// Figma keeps a path's shape and rewrites its text: here every loop comes back starting one point later.
const rewritten = ({ windingRule, data }) => ({
  windingRule,
  data: parsePath(data)
    .loops.map((loop) => `${[...loop.slice(1), loop[0]].map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')} Z`)
    .join(' '),
})

// A stand-in for the Bricks page: one component set per name with the five variants, each holding
// a square `Brick` vector (in the Tile sets, a `Tile` and the vector 3 px inside it).
function bricksPage(setNames = names) {
  let made = 0
  const node = (type, name, props = {}, children = undefined) => {
    const next = { id: `9:${++made}`, type, name, ...props }
    if (children) {
      next.children = children
      for (const child of children) child.parent = next
    }
    return next
  }
  const vector = (at, size) => {
    const next = node('VECTOR', 'Brick', { x: at, y: at, relativeTransform: [[1, 0, at], [0, 1, at]], fills: [{ type: 'SOLID', color: { r: 0, g: 0.09, b: 0.17 } }] })
    let paths = []
    Object.defineProperty(next, 'vectorPaths', {
      get: () => paths,
      set: (value) => {
        paths = value.map(rewritten)
        const points = paths.flatMap((p) => parsePath(p.data).loops.flat())
        next.width = Math.max(...points.map(([x]) => x))
        next.height = Math.max(...points.map(([, y]) => y))
      },
    })
    next.vectorPaths = [{ windingRule: 'NONZERO', data: `M 0 0 L ${size} 0 L ${size} ${size} L 0 ${size} Z` }]
    return next
  }
  const variant = (name, size) => {
    const tile = node('RECTANGLE', 'Tile', { x: 0, y: 0, width: 24, height: 24, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] })
    return node('COMPONENT', `Size=${size}`, { width: 24, height: 24, fills: [] }, TILE_SETS.includes(name) ? [tile, vector(3, 18)] : [vector(0, 24)])
  }
  const sets = setNames.map((name) => node('COMPONENT_SET', name, {}, SIZES.map((size) => variant(name, size))))
  const page = node('PAGE', 'Bricks', {}, [node('FRAME', 'Content', { fills: [] }, sets)])
  const below = (parent) => (parent.children ?? []).flatMap((child) => [child, ...below(child)])
  page.findAll = (keep) => below(page).filter(keep)
  page.findAllWithCriteria = ({ types }) => below(page).filter((n) => types.includes(n.type))
  const set = (name) => sets.find((s) => s.name === name)
  const brick = (name, size) => set(name).children.find((v) => v.name === `Size=${size}`).children.at(-1)
  return { figma: { getNodeByIdAsync: async () => page, setCurrentPageAsync: async () => {} }, node, set, brick, variant }
}

describe('reading the Bricks page', () => {
  it('matches all 34 component sets and their five variants by name, and changes nothing', async () => {
    const { figma } = bricksPage()
    const first = await inspect(figma)
    expect(first).toMatchObject({ problems: [], sets: 34, vectors: 170, tiles: TILE_SETS })
    expect(await inspect(figma)).toEqual(first)
  })

  it('says no component set equals the export before the write', async () => {
    const { ok, lines } = compareBricks(vectors, await inspect(bricksPage().figma))
    expect(ok).toBe(false)
    expect(lines).toContain('0 of 34 component sets equal the export in all 5 sizes (0 of 170 vectors).')
    expect(lines.filter((line) => line.startsWith('Differs from the export: '))).toHaveLength(34)
  })
})

describe('writing the export', () => {
  it('writes all 170 Brick vectors in four calls, and each reads back equal to the export', async () => {
    const { figma } = bricksPage()
    const before = await inspect(figma)
    const results = await writeAll(figma)
    expect(results.map((r) => r.problems.length)).toEqual([0, 0, 0, 0])
    expect(new Set(results.flatMap((r) => r.mutatedNodeIds)).size).toBe(170)
    expect(results.reduce((sum, r) => sum + r.written, 0)).toBe(170)
    const after = await inspect(figma)
    expect(after.digests).toEqual(expectedDigests(vectors))
    expect(compareBricks(vectors, after, before)).toEqual({
      ok: true,
      lines: [
        'Read back 170 Brick vectors in 34 component sets (3 with a Tile).',
        '34 of 34 component sets equal the export in all 5 sizes (170 of 170 vectors).',
        'Nodes: the same 390 as before the write (id, type, name and parent).',
        'Fills: as they were before the write.',
      ],
    })
  })

  it('gives each vector the cells and the box of the exported Brick, and Size=32x32 the 16×16 Brick', async () => {
    const { figma, brick } = bricksPage()
    await writeAll(figma)
    for (const name of names.filter((n) => !TILE_SETS.includes(n))) {
      for (const size of SIZES) {
        const exported = vectors.bricks[name][size === '32x32' ? '16x16' : size]
        const { x, y, width, height } = brick(name, size)
        expect({ x, y, width, height }).toEqual(exported.bounds)
        expect(describeVector(brick(name, size), exported.cells.length, 0).split('|')[0]).toBe(exported.cells.join('/'))
      }
    }
  })

  it('keeps the Brick of a Tile set inside the 18×18 box of its Tile', async () => {
    const { figma, brick } = bricksPage()
    await writeAll(figma)
    for (const name of TILE_SETS) {
      for (const size of SIZES) {
        const exported = vectors.bricks[name][size === '32x32' ? '16x16' : size]
        const { x, y, width, height } = brick(name, size)
        expect({ x, y, width, height }).toEqual({ x: 3 + exported.bounds.x * 0.75, y: 3 + exported.bounds.y * 0.75, width: exported.bounds.width * 0.75, height: exported.bounds.height * 0.75 })
        expect(describeVector(brick(name, size), exported.cells.length, 3).split('|')[0]).toBe(exported.cells.join('/'))
      }
    }
  })

  it('names the component set whose vector was changed after the write', async () => {
    const { figma, brick } = bricksPage()
    await writeAll(figma)
    brick('Brick/GMI', '8x8').x += 1.5
    const { ok, lines } = compareBricks(vectors, await inspect(figma))
    expect(ok).toBe(false)
    expect(lines.filter((line) => line.startsWith('Differs'))).toEqual(['Differs from the export: Brick/GMI'])
  })

  it('reports a node or a fill that changed since before the write', async () => {
    const { figma, brick, set } = bricksPage()
    const before = await inspect(figma)
    await writeAll(figma)
    brick('Brick/GMI', '2x2').fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
    set('Brick/Goal').children[0].name = 'Size=2×2 '
    const { ok, lines } = compareBricks(vectors, await inspect(figma), before)
    expect(ok).toBe(false)
    expect(lines).toContain('Fills: changed since before the write.')
    expect(lines).toContain('Nodes: changed since before the write (390 then, 390 now).')
  })
})

describe('a page that does not match the export', () => {
  const problemsOf = async (change) => {
    const page = bricksPage()
    change(page)
    const before = await inspect(page.figma)
    const results = await writeAll(page.figma)
    // With any problem, no call writes anything.
    expect(results.map((r) => r.written)).toEqual([0, 0, 0, 0])
    expect(await inspect(page.figma)).toEqual(before)
    expect(results[0].problems).toEqual(before.problems)
    return before.problems
  }

  it('stops on a Plan type with no component set', async () => {
    const page = bricksPage(names.slice(1))
    expect((await inspect(page.figma)).problems).toEqual([`${names[0]}: 0 component sets on the page`])
    expect((await write(page.figma, 1)).written).toBe(0)
  })

  it('stops on a component set with no Plan type', async () => {
    const page = bricksPage([...names, 'Brick/Unknown'])
    expect((await inspect(page.figma)).problems).toEqual(['Brick/Unknown: on the page, not in the export'])
    expect((await write(page.figma, 1)).written).toBe(0)
  })

  it('stops on a missing variant', async () => {
    expect(await problemsOf(({ set }) => set('Brick/GMI').children.pop())).toEqual(['Brick/GMI Size=32x32: 0 variants'])
  })

  it('stops on a variant of another size', async () => {
    expect(await problemsOf(({ set, variant }) => set('Brick/GMI').children.push({ ...variant('Brick/GMI', '64x64'), parent: set('Brick/GMI') }))).toEqual(['Brick/GMI: a variant Size=64x64, which is no size of the export'])
  })

  it('stops on a variant that is not 24×24', async () => {
    expect(await problemsOf(({ set }) => (set('Brick/GMI').children[1].width = 48))).toEqual(['Brick/GMI Size=4x4: is 48×24, not 24×24'])
  })

  it('stops on a Tile where the export expects none, and on none where it expects one', async () => {
    const problems = await problemsOf(({ set, node }) => {
      set('Brick/GMI').children[0].children.unshift(node('RECTANGLE', 'Tile', { parent: set('Brick/GMI').children[0] }))
      set(TILE_SETS[0]).children[0].children.shift()
    })
    expect(problems).toEqual(['Brick/GMI Size=2x2: holds RECTANGLE Tile, VECTOR Brick, not VECTOR Brick', `${TILE_SETS[0]} Size=2x2: holds VECTOR Brick, not RECTANGLE Tile, VECTOR Brick`])
  })

  it('stops on a Brick vector that is flipped', async () => {
    expect(await problemsOf(({ brick }) => (brick('Brick/GMI', '16x16').relativeTransform = [[-1, 0, 24], [0, 1, 0]]))).toEqual(['Brick/GMI Size=16x16: its Brick is rotated, flipped or scaled'])
  })
})

describe('what a vector draws', () => {
  const corner = { x: 0, y: 0, width: 24, height: 24 }
  const oneLoop = 'M 0 0 L 12 0 L 12 12 L 24 12 L 24 24 L 12 24 L 12 12 L 0 12 Z'

  it('reads the same however the path is written: two loops for two parts that meet at a corner', () => {
    const twoLoops = 'M 12 12 L 24 12 L 24 24 L 12 24 Z M 0 0 L 12 0 L 12 12 L 0 12 Z'
    const describe = (data, windingRule) => describeVector({ ...corner, vectorPaths: [{ windingRule, data }] }, 2, 0)
    expect(describe(oneLoop, 'NONZERO')).toBe('#./.#|0,0,24,24|0,0 0,12 12,0 12,12 12,24 24,12 24,24|straight')
    expect(describe(twoLoops, 'NONZERO')).toBe(describe(oneLoop, 'NONZERO'))
    expect(describe(twoLoops, 'EVENODD')).toBe(describe(oneLoop, 'NONZERO'))
  })

  it('never takes a curved path for a Brick', () => {
    const curved = 'M 0 0 L 12 0 C 12 4 12 8 12 12 L 24 12 L 24 24 L 12 24 L 12 12 L 0 12 Z'
    expect(describeVector({ ...corner, vectorPaths: [{ windingRule: 'NONZERO', data: curved }] }, 2, 0)).toMatch(/\|curved$/)
  })
})

describe('the code of a call', () => {
  it('fits in one use_figma call and runs as it is printed', () => {
    const codes = [figmaCode('inspectBricks', inspectData(vectors)), ...Array.from({ length: WRITE_PARTS }, (_, i) => figmaCode('writeBricks', writeData(vectors, i + 1)))]
    for (const code of codes) {
      expect(code.length).toBeLessThan(50000)
      expect(code).not.toMatch(/^(export|import) /m)
      expect(code).not.toMatch(/^\s*\/\//m)
    }
  })

  it('splits the 34 component sets over the write calls, each once', () => {
    const parts = Array.from({ length: WRITE_PARTS }, (_, i) => Object.keys(writeData(vectors, i + 1).bricks))
    expect(parts.flat()).toEqual(names)
    expect(parts.map((p) => p.length)).toEqual([9, 9, 9, 7])
  })
})
