import { colourKey, type ColourFamily, type PlanColour, type Tint } from './colours'
import type { BrickSettings } from './brick'
import { everyJsonField, jsonFields } from './jsonLine'
import type { Strategy } from './strategy'
import type { PatternFamily, Slope } from '@/vendor/fnm-core/types'
// The eight Collections, in the order of the Bricks page in Figma.
import COLLECTION_NAMES from './collections.json'
// The Plan types on the Bricks page in Figma, in its order, then the four that are not exported.
// Kept as data: some official names use words the glossary keeps out of code. One on the Bricks
// page has no Brick here: its Brick is picked from its Strategy and stored in pickedBricks.json.
// The four that are not exported each have a hand-set Brick. The six with no Plan Cover on the plan
// picker (RMF for Retirement, Thai ESG, Definit Global Select, Definit SET Select, Money Market,
// KKP Finsave) stay out of draws.
import PLAN_TYPES from './planTypes.json'

export const COLLECTIONS: readonly string[] = COLLECTION_NAMES

export interface PlanType {
  id: string
  name: string
  colour: PlanColour
  /** The Collection its Brick is filed under: one of the eight. Only an exported Plan type has one (see `isExported`). */
  collection?: string
  /** Every exported Plan type has one; the rest have none. */
  strategy?: Strategy
  /** The hand-set Brick of a Plan type that is not exported. An exported one has none: its Brick is picked from its Strategy (see `planTypeBrick`). */
  brick?: BrickSettings
  /** Whether random draws (a new Plan, a redrawn Plan, a picked Mix case) may pick it. */
  inDraws: boolean
}

export function defaultPlanTypes(): PlanType[] {
  return PLAN_TYPES.map((t) => ({
    id: t.id,
    name: t.name,
    colour: { family: t.family as ColourFamily, tint: t.tint as Tint },
    ...(t.collection !== undefined && { collection: t.collection }),
    ...(t.strategy !== undefined && { strategy: t.strategy as Strategy }),
    ...(t.brick !== undefined && { brick: { ...t.brick, family: t.brick.family as PatternFamily, slope: t.brick.slope as Slope } }),
    inDraws: t.inDraws,
  }))
}

/** A Plan type with one of the eight Collections and a Strategy: one whose Brick goes to the Bricks page in Figma. */
export type ExportedPlanType = PlanType & { collection: string; strategy: Strategy }

/** Whether a Plan type is exported: it has one of the eight Collections and a Strategy. Every place that asks, asks here. */
export function isExported<T extends Pick<PlanType, 'collection' | 'strategy'>>(type: T): type is T & Pick<ExportedPlanType, 'collection' | 'strategy'> {
  return type.collection !== undefined && COLLECTIONS.includes(type.collection) && type.strategy !== undefined
}

/**
 * The exported Plan types, Collection by Collection in the order of the Bricks page in Figma, each
 * Collection in the order given. It throws, naming the Plan type, when one has a Collection but is
 * not exported: with no Strategy, or with a Collection that is not one of the eight.
 */
export function exportedPlanTypes(types: PlanType[]): ExportedPlanType[] {
  for (const type of types) {
    if (type.collection === undefined || isExported(type)) continue
    const named = `Plan type "${type.name}" (${type.id}) has the Collection "${type.collection}"`
    throw new Error(COLLECTIONS.includes(type.collection) ? `${named} but no Strategy: an exported Plan type needs both.` : `${named}, which is not one of the eight in collections.json.`)
  }
  const exported = types.filter(isExported)
  return COLLECTIONS.flatMap((collection) => exported.filter((t) => t.collection === collection))
}

/** A Strategy's fields in the order `planTypes.json` writes them. */
const STRATEGY_FIELDS = ['investmentStyle', 'risk', 'initialCost', 'monthlyCost', 'expectedReturn', 'contentType', 'guesses'] as const satisfies readonly (keyof Strategy)[]

/**
 * Plan types written out as `planTypes.json` is: one line each, so a saved set diffs cleanly. It
 * throws, naming the Plan type, when a Strategy has a field that is not in `STRATEGY_FIELDS`.
 */
export function planTypesJson(types: PlanType[]): string {
  const lines = types.map(({ id, name, colour, collection, strategy: s, brick: b, inDraws }) => {
    const strategy = s && `, "strategy": { ${everyJsonField(s, STRATEGY_FIELDS, `The Strategy of Plan type "${name}" (${id})`)} }`
    const brick = b && `, "brick": { ${jsonFields(b, ['family', 'slope', 'seed', 'guidance', 'blockCount', 'cornerMeetLimit'])} }`
    return `  { ${jsonFields({ id, name, family: colour.family, tint: colour.tint, collection }, ['id', 'name', 'family', 'tint', 'collection'])}${strategy ?? ''}${brick ?? ''}, "inDraws": ${inDraws} }`
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
