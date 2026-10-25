/**
 * Plan colours: the 12 colour families from neon `theme/tokens/colors.json`, at the four solid Tints.
 * Copied in so Mixture runs on its own.
 */
export const TINTS = [100, 75, 50, 25] as const
export type Tint = (typeof TINTS)[number]

export const COLOUR_FAMILIES = {
  'yellow': { label: 'Yellow', tints: { 100: '#f2f93c', 75: '#f5fb6d', 50: '#f9fc9e', 25: '#fcfece' } },
  'green': { label: 'Green', tints: { 100: '#00e76b', 75: '#40ed90', 50: '#80f3b5', 25: '#bff9da' } },
  'blue': { label: 'Blue', tints: { 100: '#50cfff', 75: '#7cdbff', 50: '#a8e7ff', 25: '#d3f3ff' } },
  'purple': { label: 'Purple', tints: { 100: '#aa46c3', 75: '#bf74d2', 50: '#d5a3e1', 25: '#ead1f0' } },
  'navy': { label: 'Navy', tints: { 100: '#01172b', 75: '#415160', 50: '#808b95', 25: '#c0c5ca' } },
  'light-grey': { label: 'Light Grey', tints: { 100: '#a6bfcc', 75: '#bccfd9', 50: '#d3dfe6', 25: '#e9eff2' } },
  'red': { label: 'Red', tints: { 100: '#f73232', 75: '#f96565', 50: '#fb9999', 25: '#fdcccc' } },
  'orange': { label: 'Orange', tints: { 100: '#f26414', 75: '#f58b4f', 50: '#f9b28a', 25: '#fcd8c4' } },
  'indigo': { label: 'Indigo', tints: { 100: '#1817e7', 75: '#5251ed', 50: '#8c8bf3', 25: '#c5c5f9' } },
  'violet': { label: 'Violet', tints: { 100: '#6b46c3', 75: '#9074d2', 50: '#b5a3e1', 25: '#dad1f0' } },
  'teal': { label: 'Teal', tints: { 100: '#46c3a4', 75: '#74d2bb', 50: '#a3e1d2', 25: '#d1f0e8' } },
  'magenta': { label: 'Magenta', tints: { 100: '#f73294', 75: '#f965af', 50: '#fb99ca', 25: '#fdcce4' } },
} as const satisfies Record<string, { label: string; tints: Record<Tint, string> }>

export type ColourFamily = keyof typeof COLOUR_FAMILIES

export interface PlanColour {
  family: ColourFamily
  tint: Tint
}

/** Two Plans with the same key share a Plan colour. */
export function colourKey(colour: PlanColour): string {
  return `${colour.family}-${colour.tint}`
}

export function colourFromKey(key: string): PlanColour {
  const cut = key.lastIndexOf('-')
  return { family: key.slice(0, cut) as ColourFamily, tint: Number(key.slice(cut + 1)) as Tint }
}

export function colourHex(colour: PlanColour): string {
  return COLOUR_FAMILIES[colour.family].tints[colour.tint]
}
