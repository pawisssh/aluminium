// PROTOTYPE, throwaway: which rule should turn a Strategy's Initial Cost into the size of the
// largest Block of a Brick, on each of the four exported Brick grids (2×2, 4×4, 8×8, 16×16)?
// Three candidate rules, switched with ?rule=A|B|C on the #prototype page.
// Nothing here is used by Mixture itself.
import { getColourway, DEFAULT_COLOURWAY_ID } from '@/vendor/fnm-core/colourway'
import { generatePattern } from '@/vendor/fnm-core/generator'
import { createRng } from '@/vendor/fnm-core/prng'
import { LATEST_REFERENCE_SET } from '@/vendor/fnm-core/referencePatterns'
import type { Block, PatternFamily, Slope } from '@/vendor/fnm-core/types'
import { coverMatch, planCover } from '@/core/planCovers'
import STRATEGIES from './strategies.json'

export type Style = 'one-time' | 'dca' | 'market-timing'
export interface Strategy {
  id: string
  name: string
  collection: string
  style: Style
  risk: 'low' | 'medium' | 'high'
  riskText: string
  initialCost: number
  cover?: string
  guessed?: boolean
}
export const strategies = STRATEGIES as Strategy[]

/** Sides of the four exported Brick grids. */
export const SIDES = [2, 4, 8, 16] as const
export type Side = (typeof SIDES)[number]
/** The seven Initial Cost steps of the Pattern Guidelines, in baht. */
export const STEPS = [1, 5_000, 20_000, 50_000, 500_000, 2_000_000, 10_000_000]
export const stepOf = (s: Strategy) => STEPS.indexOf(s.initialCost)

/** What the generator is asked for: Investment Style picks the Brick family and corner meets, Risk the Slope. */
export function shapeOf(s: Strategy): { family: PatternFamily; slope: Slope; cornerMeetLimit: number } {
  const slope: Slope = s.risk === 'low' ? 'flat' : s.risk === 'medium' ? 'half' : '75'
  if (s.style === 'market-timing') return { family: 'mountain', slope: slope === '75' ? 'half' : slope, cornerMeetLimit: 1 }
  return { family: 'rising', slope, cornerMeetLimit: s.style === 'dca' ? 2 : 0 }
}

export interface Candidate {
  blocks: Block[]
  mask: boolean[][]
  key: string
  /** The largest Block, by cells. */
  top: { w: number; h: number }
  /** True when the cells hold together by edges alone, false when a corner is needed. */
  edgeJoined: boolean
  settings: string
}

const BLOCK_COUNTS: Record<Side, number[]> = { 2: [1, 2, 3], 4: [2, 3, 4, 5, 6], 8: [2, 3, 4, 6, 8, 12], 16: [3, 5, 8, 12, 16, 24, 32] }
const GUIDANCES = [0, 60]
const SEEDS = 60

function edgeJoined(mask: boolean[][]): boolean {
  const side = mask.length
  const cells = mask.flatMap((row, r) => row.flatMap((on, c) => (on ? [[r, c] as const] : [])))
  if (cells.length === 0) return true
  const seen = new Set<string>([cells[0]!.join()])
  const queue = [cells[0]!]
  while (queue.length) {
    const [r, c] = queue.pop()!
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const [nr, nc] = [r + dr, c + dc]
      if (nr < 0 || nc < 0 || nr >= side || nc >= side || !mask[nr]![nc] || seen.has(`${nr},${nc}`)) continue
      seen.add(`${nr},${nc}`)
      queue.push([nr, nc])
    }
  }
  return seen.size === cells.length
}

const pools = new Map<string, Candidate[]>()

/** Every different Brick the generator draws for a Brick family and Slope over the Block counts, Guidances and seeds tried. */
export function pool(side: Side, family: PatternFamily, slope: Slope, cornerMeetLimit: number): Candidate[] {
  const id = [side, family, slope, cornerMeetLimit].join()
  const cached = pools.get(id)
  if (cached) return cached
  const grid = { cols: side, rows: side, cellW: 1, cellH: 1 }
  const colourway = getColourway(DEFAULT_COLOURWAY_ID)!
  const found = new Map<string, Candidate>()
  for (const blockCount of BLOCK_COUNTS[side])
    for (const guidance of GUIDANCES)
      for (let n = 0; n < SEEDS; n++) {
        const blocks = generatePattern(grid, colourway, createRng(`proto-${n}`), { family, slope, blockCount, guidance, cornerMeetLimit, referenceSet: LATEST_REFERENCE_SET })
        if (blocks.length === 0) continue
        const mask = Array.from({ length: side }, () => Array<boolean>(side).fill(false))
        for (const b of blocks) for (let r = b.row; r < b.row + b.h; r++) for (let c = b.col; c < b.col + b.w; c++) mask[r]![c] = true
        const top = blocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a))
        const key = mask.map((row) => row.map((on) => (on ? 1 : 0)).join('')).join('/')
        const full = `${key}|${top.w}x${top.h}`
        if (!found.has(full))
          found.set(full, { blocks, mask, key, top: { w: top.w, h: top.h }, edgeJoined: edgeJoined(mask), settings: `seed proto-${n} · ${blockCount} Blocks · Guidance ${guidance}` })
      }
  const out = [...found.values()]
  pools.set(id, out)
  return out
}

export interface Rule {
  id: string
  name: string
  note: string
  /** What the largest Block should be at this Initial Cost step, as text. */
  target: (side: Side, step: number) => string
  /** How far a largest Block is from the target; 0 is exact. */
  miss: (side: Side, step: number, top: { w: number; h: number }) => number
}

// Rule A: the Guidelines' own shapes. Steps 1 to 4 are one narrow Block growing taller, steps 5 to 7 a growing square.
const SHAPES: Record<Side, [number, number][]> = {
  2: [[1, 1], [1, 1], [1, 2], [1, 2], [1, 1], [2, 2], [2, 2]],
  4: [[1, 1], [1, 2], [1, 3], [1, 4], [2, 2], [3, 3], [4, 4]],
  8: [[1, 1], [1, 2], [1, 3], [1, 4], [2, 2], [3, 3], [4, 4]],
  16: [[2, 2], [2, 4], [2, 6], [2, 8], [3, 3], [6, 6], [8, 8]],
}
// Rule B: only the cells of the largest Block count, rising over all seven steps where the Brick grid has room.
const AREAS: Record<Side, number[]> = {
  2: [1, 1, 1, 1, 2, 2, 2],
  4: [1, 1, 2, 2, 3, 4, 6],
  8: [1, 2, 3, 4, 6, 9, 16],
  16: [4, 6, 9, 12, 18, 30, 48],
}
// Rule C: three tiers (up to 50,000 / 500,000 / 2,000,000 and up), the same share of every Brick grid.
const TIERS: Record<Side, number[]> = { 2: [1, 1, 2], 4: [1, 2, 4], 8: [2, 6, 16], 16: [9, 24, 48] }
const tierOf = (step: number) => (step <= 3 ? 0 : step === 4 ? 1 : 2)
const areaMiss = (want: number, top: { w: number; h: number }) => Math.abs(Math.log((top.w * top.h) / want))

export const RULES: Rule[] = [
  {
    id: 'A',
    name: 'รูปตาม Guidelines',
    note: 'ขั้น 1–4 เป็น Block แคบที่สูงขึ้นเรื่อย ๆ ขั้น 5–7 เป็นสี่เหลี่ยมจัตุรัสที่โตขึ้น ตามภาพ Initial Cost ใน Pattern Guidelines',
    target: (side, step) => SHAPES[side][step]!.join('×'),
    miss: (side, step, top) => Math.abs(top.w - SHAPES[side][step]![0]) + Math.abs(top.h - SHAPES[side][step]![1]),
  },
  {
    id: 'B',
    name: 'พื้นที่ 7 ขั้น',
    note: 'นับแค่จำนวนช่องของ Block ที่ใหญ่ที่สุด เพิ่มขึ้นทุกขั้น ขั้นที่อยู่ติดกันรวมกันเมื่อ Brick grid เล็กเกินไป',
    target: (side, step) => `${AREAS[side][step]} ช่อง`,
    miss: (side, step, top) => areaMiss(AREAS[side][step]!, top),
  },
  {
    id: 'C',
    name: '3 ระดับ',
    note: 'รวมเป็น 3 ระดับ (ไม่เกิน 50,000 / 500,000 / 2,000,000 ขึ้นไป) ใช้สัดส่วนเดียวกันทุก Brick grid',
    target: (side, step) => `${TIERS[side][tierOf(step)]} ช่อง`,
    miss: (side, step, top) => areaMiss(TIERS[side][tierOf(step)]!, top),
  },
]

export interface Picked {
  strategy: Strategy
  candidate: Candidate | null
  miss: number
  /** How many Bricks in the pool pass the Investment Style's join condition. */
  allowed: number
  /** True when an earlier Plan type already has this exact Brick. */
  repeat: boolean
}

/**
 * One Brick per Plan type on a Brick grid: of the Bricks its Investment Style allows, the one whose
 * largest Block is nearest the rule's target, then one no earlier Plan type took, then the closest
 * to its Plan Cover.
 */
export function pickAll(rule: Rule, side: Side): Picked[] {
  const taken = new Set<string>()
  return strategies.map((strategy) => {
    const { family, slope, cornerMeetLimit } = shapeOf(strategy)
    const all = pool(side, family, slope, cornerMeetLimit)
    const allowed = strategy.style === 'market-timing' ? all : all.filter((c) => c.edgeJoined === (strategy.style === 'one-time'))
    const cover = strategy.cover ? planCover(strategy.cover) : undefined
    const step = stepOf(strategy)
    let best: { c: Candidate; miss: number; fresh: boolean; match: number } | null = null
    for (const c of allowed) {
      const miss = rule.miss(side, step, c.top)
      const fresh = !taken.has(c.key)
      const match = cover ? (coverMatch(c.mask, cover) ?? 0) : 0
      const better =
        !best || miss < best.miss - 1e-9 || (Math.abs(miss - best.miss) <= 1e-9 && (fresh !== best.fresh ? fresh : match > best.match))
      if (better) best = { c, miss, fresh, match }
    }
    if (!best) return { strategy, candidate: null, miss: Infinity, allowed: 0, repeat: false }
    taken.add(best.c.key)
    return { strategy, candidate: best.c, miss: best.miss, allowed: allowed.length, repeat: !best.fresh }
  })
}
