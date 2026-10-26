import { colourKey, type ColourFamily, type PlanColour, type Tint } from './colours'
import type { BrickSettings } from './brick'
import type { PatternFamily, Slope } from '@/vendor/fnm-core/types'
// The plans on the plan picker (plan-select/plans), in its order, then the four that sit outside it.
// Kept as data: some official names use words the glossary keeps out of code. Each one's Brick
// settings come from the closest match to its artwork on the plan picker, where it has one.
import PLAN_TYPES from './planTypes.json'

export interface PlanType {
  id: string
  name: string
  colour: PlanColour
  brick: BrickSettings
  /** Whether random draws (a new Plan, a redrawn Plan, a picked Mix case) may pick it. */
  inDraws: boolean
}

export function defaultPlanTypes(): PlanType[] {
  return PLAN_TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    colour: { family: t.family as ColourFamily, tint: t.tint as Tint },
    brick: { ...t.brick, family: t.brick.family as PatternFamily, slope: t.brick.slope as Slope },
    inDraws: t.inDraws,
  }))
}

/** Plan types written out as `planTypes.json` is: one line each, so a saved set diffs cleanly. */
export function planTypesJson(types: PlanType[]): string {
  const fields = (entries: [string, unknown][]) =>
    entries
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ')
  const lines = types.map(({ id, name, colour, brick: b, inDraws }) => {
    const brick = fields([['family', b.family], ['slope', b.slope], ['seed', b.seed], ['guidance', b.guidance], ['blockCount', b.blockCount], ['cornerMeetLimit', b.cornerMeetLimit]])
    return `  { ${fields([['id', id], ['name', name], ['family', colour.family], ['tint', colour.tint]])}, "brick": { ${brick} }, "inDraws": ${inDraws} }`
  })
  return `[\n${lines.join(',\n')}\n]\n`
}

/**
 * Picks `count` Plan types from those in draws, each one not picked yet. It prefers a type whose
 * colour family isn't in `taken` or already picked, then one whose Plan colour isn't, so the Mix
 * shows each as a colour easy to tell apart, and falls back to repeats once the pool runs out.
 */
export function drawPlanTypes(types: PlanType[], count: number, taken: PlanColour[] = [], random: () => number = Math.random): PlanType[] {
  const pool = types.filter((t) => t.inDraws)
  if (pool.length === 0) return []
  const usedFamilies = new Set(taken.map((c) => c.family))
  const usedColours = new Set(taken.map(colourKey))
  const picked: PlanType[] = []
  for (let i = 0; i < count; i++) {
    const fresh = pool.filter((t) => !picked.includes(t))
    const newFamily = fresh.filter((t) => !usedFamilies.has(t.colour.family))
    const newColour = fresh.filter((t) => !usedColours.has(colourKey(t.colour)))
    const from = [newFamily, newColour, fresh].find((f) => f.length > 0) ?? pool
    const type = from[Math.floor(random() * from.length)]!
    picked.push(type)
    usedFamilies.add(type.colour.family)
    usedColours.add(colourKey(type.colour))
  }
  return picked
}
