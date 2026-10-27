import { colourKey, type PlanColour } from './colours'
import { MIX_CASE_COLOURS, nearestMixCase } from './mixCases'

export interface MixSlice {
  value: number
  colour: PlanColour
}

export interface Mix {
  /** Rows of colour keys (see `colourKey`), row 0 at the top; null where nothing has value. */
  cells: (string | null)[][]
  /** Plan colours left out because there were more colours than a Mix case holds. */
  hiddenColours: number
  /** The number of the Mix case it is drawn from, as on the Mix cases page; none when nothing has value. */
  mixCase?: number
}

const SIZE = 4

/**
 * Draws a 4×4 Mix from the Mix case nearest the Plan values, so every Plan colour is one 1×1 to
 * 2×4 piece. Past one Plan colour per Mix case colour, only the largest are shown.
 */
export function buildMix(slices: MixSlice[]): Mix {
  const ranked = rank(slices)
  if (!ranked.length) return { cells: Array.from({ length: SIZE }, () => Array<string | null>(SIZE).fill(null)), hiddenColours: 0 }
  const kept = ranked.slice(0, MIX_CASE_COLOURS.length)
  const mixCase = nearestMixCase(kept.map(([, value]) => value))
  return { cells: mixCase.cells.map((row) => row.map((i) => kept[i]![0])), hiddenColours: ranked.length - kept.length, mixCase: mixCase.number }
}

/** Each Plan colour's total value, largest first; the first listed wins a tie. */
function rank(slices: MixSlice[]): [string, number][] {
  const byKey = new Map<string, number>()
  for (const s of slices) {
    if (s.value > 0) byKey.set(colourKey(s.colour), (byKey.get(colourKey(s.colour)) ?? 0) + s.value)
  }
  return [...byKey].sort((a, b) => b[1] - a[1])
}
