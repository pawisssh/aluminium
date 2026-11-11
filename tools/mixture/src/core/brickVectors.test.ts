import { describe, expect, it } from 'vitest'
import { brickOutline, brickVectors, type BrickVectors } from './brickVectors'
// The 34 Plan type names in the Strategy table the brand designer approved on 2026-11-11 (issue
// #15), which takes them from the Bricks page in Figma, in the page's order. Kept as data: one
// name uses a word the glossary keeps out of code.
import BRICKS_PAGE_NAMES from './bricksPageNames.json'
import { planTypeBrickCells } from './pickedBricks'
import { defaultPlanTypes, exportedPlanTypes } from './planTypes'

/** Rows of `#` (filled) and `.` (empty) as Brick cells, row 0 at the top. */
const cellsOf = (...rows: string[]) => rows.map((row) => [...row].map((cell) => cell === '#'))

type Point = [x: number, y: number]

/** The loops of an outline's path data as points in px. Fails on anything but `M x y L x y … Z` loops a space apart. */
function loopsOf(path: string): Point[][] {
  const n = '\\d+(?:\\.\\d+)?'
  const loop = `M ${n} ${n}(?: L ${n} ${n})+ Z`
  expect(path).toMatch(new RegExp(`^${loop}(?: ${loop})*$`))
  return path
    .split(' Z')
    .filter(Boolean)
    .map((part) => part.trim().slice(2).split(' L ').map((point) => point.split(' ').map(Number) as Point))
}

/** The cells of a `side`×`side` Brick grid on the 24×24 frame whose centres the loops fill, under either fill rule, as rows of `#` and `.`. */
function filledBy(loops: Point[][], side: number, rule: 'evenodd' | 'nonzero'): string[] {
  const cell = 24 / side
  return Array.from({ length: side }, (_, r) =>
    Array.from({ length: side }, (_, c) => {
      const [x, y] = [(c + 0.5) * cell, (r + 0.5) * cell]
      // Every side of every loop that crosses the ray from the centre to the right, and which way it crosses.
      let crossings = 0
      let winding = 0
      for (const loop of loops)
        loop.forEach(([ax, ay], i) => {
          const [bx, by] = loop[(i + 1) % loop.length]!
          if (ay > y === by > y || ax + ((y - ay) * (bx - ax)) / (by - ay) < x) return
          crossings++
          winding += by > ay ? 1 : -1
        })
      return (rule === 'evenodd' ? crossings % 2 === 1 : winding !== 0) ? '#' : '.'
    }).join(''),
  )
}

const isFilled = (cells: string[], r: number, c: number) => cells[r]?.[c] === '#'

/** The empty regions of a Brick's cells, joined across cell edges, that do not reach the edge of the Brick grid. */
function holes(cells: string[]): number {
  const side = cells.length
  const seen = new Set<string>()
  let count = 0
  for (let r = 0; r < side; r++)
    for (let c = 0; c < side; c++) {
      if (isFilled(cells, r, c) || seen.has(`${r},${c}`)) continue
      let open = false
      const stack = [[r, c]]
      seen.add(`${r},${c}`)
      while (stack.length) {
        const [y, x] = stack.pop() as [number, number]
        if (y === 0 || x === 0 || y === side - 1 || x === side - 1) open = true
        for (const [ny, nx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]] as const)
          if (ny >= 0 && nx >= 0 && ny < side && nx < side && !isFilled(cells, ny, nx) && !seen.has(`${ny},${nx}`)) {
            seen.add(`${ny},${nx}`)
            stack.push([ny, nx])
          }
      }
      if (!open) count++
    }
  return count
}

/** The crossings of cell lines, in cells from the top left, where two filled cells meet only at a corner. */
function cornerJoins(cells: string[]): Point[] {
  const joins: Point[] = []
  for (let y = 1; y < cells.length; y++)
    for (let x = 1; x < cells.length; x++) {
      const [a, b, c, d] = [isFilled(cells, y - 1, x - 1), isFilled(cells, y - 1, x), isFilled(cells, y, x - 1), isFilled(cells, y, x)]
      if ((a && d && !b && !c) || (b && c && !a && !d)) joins.push([x, y])
    }
  return joins
}

/** Every outline with the Figma names it is keyed by and the side of its Brick grid. */
const outlines = (vectors: BrickVectors) =>
  Object.entries(vectors.bricks).flatMap(([name, sizes]) => Object.entries(sizes).map(([size, vector]) => ({ name, at: `${name} ${size}`, side: Number(size.split('x')[0]), ...vector })))

describe('brickOutline', () => {
  it('draws a Brick that fills its Brick grid as the 24×24 frame, with points only at its corners', () => {
    expect(brickOutline(cellsOf('##', '##'))).toBe('M 0 0 L 24 0 L 24 24 L 0 24 Z')
  })

  it('draws cells that share an edge as one shape, on cell lines 24 px over the Brick grid’s side apart', () => {
    expect(brickOutline(cellsOf('....', '#...', '#...', '###.'))).toBe('M 0 6 L 6 6 L 6 18 L 18 18 L 18 24 L 0 24 Z')
    const one = Array.from({ length: 16 }, (_, r) => Array.from({ length: 16 }, (_, c) => r === 15 && c === 1))
    expect(brickOutline(one)).toBe('M 1.5 22.5 L 3 22.5 L 3 24 L 1.5 24 Z')
  })

  it('passes through the corner where two parts meet only there, as one loop', () => {
    expect(brickOutline(cellsOf('#.', '.#'))).toBe('M 0 0 L 12 0 L 12 12 L 24 12 L 24 24 L 12 24 L 12 12 L 0 12 Z')
    expect(brickOutline(cellsOf('.#', '#.'))).toBe('M 12 0 L 24 0 L 24 12 L 12 12 L 12 24 L 0 24 L 0 12 L 12 12 Z')
  })

  it('draws a hole as a loop of its own, turning the other way so either fill rule leaves it empty', () => {
    expect(brickOutline(cellsOf('###', '#.#', '###'))).toBe('M 0 0 L 24 0 L 24 24 L 0 24 Z M 8 8 L 8 16 L 16 16 L 16 8 Z')
  })
})

describe('brickVectors', () => {
  const types = defaultPlanTypes()
  const vectors = brickVectors(types)

  it('holds 136 outlines: one for each of the 34 names on the Bricks page in Figma, as `Brick/<name>` in the page’s order, in each of the four sizes', () => {
    expect(BRICKS_PAGE_NAMES).toHaveLength(34)
    expect(Object.keys(vectors.bricks)).toEqual(BRICKS_PAGE_NAMES.map((name) => `Brick/${name}`))
    for (const [name, sizes] of Object.entries(vectors.bricks)) expect(Object.keys(sizes), name).toEqual(['2x2', '4x4', '8x8', '16x16'])
    expect(Object.values(vectors.bricks).flatMap((sizes) => Object.values(sizes))).toHaveLength(136)
  })

  it('gives each outline the cells of the stored Brick it draws, row 0 first, `#` filled and `.` empty', () => {
    for (const type of exportedPlanTypes(types))
      for (const side of [2, 4, 8, 16]) {
        const stored = planTypeBrickCells(type, { cols: side, rows: side })!
        const { cells } = vectors.bricks[`Brick/${type.name}`]![`${side}x${side}` as '2x2']
        expect(cells, `${type.id} ${side}×${side}`).toEqual(stored.map((row) => row.map((on) => (on ? '#' : '.')).join('')))
      }
  })

  it('fills exactly its Brick’s cells on the Brick grid, under the even-odd and the non-zero fill rule alike', () => {
    for (const { at, side, path, cells } of outlines(vectors)) {
      const loops = loopsOf(path)
      expect(filledBy(loops, side, 'evenodd'), at).toEqual(cells)
      expect(filledBy(loops, side, 'nonzero'), at).toEqual(cells)
    }
  })

  it('puts every point of an outline on a cell line of its Brick grid, inside the 24×24 frame', () => {
    for (const { at, side, path } of outlines(vectors))
      for (const coordinate of loopsOf(path).flat(2)) {
        expect(coordinate, at).toBeGreaterThanOrEqual(0)
        expect(coordinate, at).toBeLessThanOrEqual(24)
        expect(Number.isInteger(coordinate / (24 / side)), `${at}: ${coordinate}`).toBe(true)
      }
  })

  it('draws each Brick as one outline with no seam between Blocks: a loop around it and one around each hole, along every cell edge with a filled cell on one side only, once', () => {
    for (const { at, side, path, cells } of outlines(vectors)) {
      const cell = 24 / side
      const loops = loopsOf(path)
      expect(loops, at).toHaveLength(1 + holes(cells))
      // Every cell edge the outline runs along: `h` or `v`, then its top-left end in cells.
      const drawn: string[] = []
      for (const loop of loops)
        loop.forEach(([ax, ay], i) => {
          const [bx, by] = loop[(i + 1) % loop.length]!
          expect(ax === bx || ay === by, at).toBe(true)
          if (ay === by) for (let x = Math.min(ax, bx); x < Math.max(ax, bx); x += cell) drawn.push(`h ${x / cell} ${ay / cell}`)
          else for (let y = Math.min(ay, by); y < Math.max(ay, by); y += cell) drawn.push(`v ${ax / cell} ${y / cell}`)
        })
      const edges: string[] = []
      for (let r = 0; r <= side; r++)
        for (let c = 0; c <= side; c++) {
          if (isFilled(cells, r, c) !== isFilled(cells, r - 1, c)) edges.push(`h ${c} ${r}`)
          if (isFilled(cells, r, c) !== isFilled(cells, r, c - 1)) edges.push(`v ${c} ${r}`)
        }
      expect(drawn.sort(), at).toEqual(edges.sort())
    }
  })

  it('passes through every corner where two parts of a Brick meet only there, as one loop, and a Dollar Cost Average Brick has such a corner', () => {
    const exported = exportedPlanTypes(types)
    for (const { name, at, side, path, cells } of outlines(vectors)) {
      const loops = loopsOf(path)
      const joins = cornerJoins(cells)
      for (const [x, y] of joins) {
        // How often each loop that reaches the corner passes through it.
        const passes = loops.map((loop) => loop.filter(([px, py]) => px === (x * 24) / side && py === (y * 24) / side).length).filter((n) => n > 0)
        // On the way into the other part and on the way back, in one loop. Only beside a hole can two loops each pass once.
        expect(passes.reduce((sum, n) => sum + n, 0), `${at} at ${x},${y}`).toBe(2)
        if (holes(cells) === 0) expect(passes, `${at} at ${x},${y}`).toEqual([2])
      }
      const type = exported.find((t) => `Brick/${t.name}` === name)!
      if (type.strategy.investmentStyle === 'dollar-cost-average') expect(joins.length, at).toBeGreaterThan(0)
    }
  })

  it('gives each outline the box its filled cells take up on the 24×24 frame, in px', () => {
    for (const { at, side, cells, bounds } of outlines(vectors)) {
      const cell = 24 / side
      const rows = cells.flatMap((row, r) => (row.includes('#') ? [r] : []))
      const cols = cells.flatMap((row) => [...row].flatMap((on, c) => (on === '#' ? [c] : [])))
      const [top, left] = [Math.min(...rows), Math.min(...cols)]
      expect(bounds, at).toEqual({ x: left * cell, y: top * cell, width: (Math.max(...cols) + 1 - left) * cell, height: (Math.max(...rows) + 1 - top) * cell })
    }
  })

  it('fails when an exported Plan type has no stored Brick on a square Brick grid, naming both', () => {
    const unpicked = { ...types.find((t) => t.id === 'gmi')!, id: 'unpicked', name: 'Unpicked' }
    expect(() => brickVectors([...types, unpicked])).toThrow('No stored Brick for Unpicked (unpicked) on 2x2: run `npm run bricks:pick` first.')
  })

  it('fails when two exported Plan types share a name, since both would go to one Figma component', () => {
    const renamed = types.map((t) => (t.id === 'goal' ? { ...t, name: 'GMI' } : t))
    expect(() => brickVectors(renamed)).toThrow('Two exported Plan types are named GMI (gmi and goal): each needs its own Figma component, Brick/<name>.')
  })
})
