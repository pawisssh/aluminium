import { useMemo } from 'react'
import { generateBrick, type BrickSettings } from '@/core/brick'
import { colourFromKey, colourHex, type PlanColour } from '@/core/colours'

/** Draws rows of cells as square tiles; a null cell is left empty. */
function CellGrid({ cells, size, className }: { cells: (string | null)[][]; size: number; className?: string }) {
  const n = cells.length
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className={className} aria-hidden>
      {cells.flatMap((row, r) => row.map((fill, c) => (fill ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} /> : null)))}
    </svg>
  )
}

export function BrickIcon({ brick, colour, size = 36 }: { brick: BrickSettings; colour: PlanColour; size?: number }) {
  const mask = useMemo(() => generateBrick(brick), [brick])
  const fill = colourHex(colour)
  return <CellGrid cells={mask.map((row) => row.map((on) => (on ? fill : null)))} size={size} />
}

/** A Mix from `buildMix`, with each colour key drawn in its colour. */
export function MixIcon({ cells, size = 36, className }: { cells: (string | null)[][]; size?: number; className?: string }) {
  return <CellGrid cells={cells.map((row) => row.map((key) => (key ? colourHex(colourFromKey(key)) : null)))} size={size} className={className} />
}
