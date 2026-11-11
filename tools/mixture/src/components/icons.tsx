import { useContext, useMemo } from 'react'
import { generateBrick, type BrickSettings } from '@/core/brick'
import { colourFromKey, colourHex, type PlanColour } from '@/core/colours'
import { BrickGridContext } from './brickGrid'

/** Draws rows of cells as square tiles, `size` along the longer side; a null cell is left empty. */
export function CellGrid({ cells, size, className }: { cells: (string | null)[][]; size: number; className?: string }) {
  const rows = cells.length
  const cols = cells[0]?.length ?? 0
  const cell = size / Math.max(rows, cols, 1)
  return (
    <svg width={cols * cell} height={rows * cell} viewBox={`0 0 ${cols} ${rows}`} shapeRendering="crispEdges" className={className} aria-hidden>
      {cells.flatMap((row, r) => row.map((fill, c) => (fill ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} /> : null)))}
    </svg>
  )
}

/** A Brick drawn on the Brick grid; nothing for a Plan type with no Brick there. */
export function BrickIcon({ brick, colour, size = 36 }: { brick: BrickSettings | undefined; colour: PlanColour; size?: number }) {
  const grid = useContext(BrickGridContext)
  const mask = useMemo(() => (brick ? generateBrick(brick, grid) : []), [brick, grid])
  const fill = colourHex(colour)
  return <CellGrid cells={mask.map((row) => row.map((on) => (on ? fill : null)))} size={size} />
}

/** A Mix from `buildMix`, with each colour key drawn in its colour. */
export function MixIcon({ cells, size = 36, className }: { cells: (string | null)[][]; size?: number; className?: string }) {
  return <CellGrid cells={cells.map((row) => row.map((key) => (key ? colourHex(colourFromKey(key)) : null)))} size={size} className={className} />
}
