import { createContext } from 'react'
import { DEFAULT_BRICK_GRID, type BrickGrid } from '@/core/brick'

/** The Brick grid every `BrickIcon` below it is drawn on. */
export const BrickGridContext = createContext<BrickGrid>(DEFAULT_BRICK_GRID)
