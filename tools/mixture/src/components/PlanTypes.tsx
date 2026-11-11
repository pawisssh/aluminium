import { useMemo, useState } from 'react'
import { Check, Copy, Dices, Plus, Search, Trash2 } from 'lucide-react'
import { BRICK_GRIDS, brickDefaults, generateBrick, type BrickGrid, type BrickSettings } from '@/core/brick'
import { COLOUR_FAMILIES, colourHex, familyTints, type ColourFamily, type Tint } from '@/core/colours'
import { pickedBrick, planTypeBrick, type PickedBrick } from '@/core/pickedBricks'
import { closestBricks, coverMatch, planCover, type CoverCandidate } from '@/core/planCovers'
import { planTypesJson, type PlanType } from '@/core/planTypes'
import { strategyLine, type Strategy } from '@/core/strategy'
import { generateRandomSeed, id } from '@/playground'
import { blockCountRangeFor } from '@/vendor/fnm-core/generator'
import type { PatternFamily, Slope } from '@/vendor/fnm-core/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BrickIcon, CellGrid } from './icons'

const FAMILY_ITEMS = (Object.keys(COLOUR_FAMILIES) as ColourFamily[]).map((f) => ({ value: f, label: COLOUR_FAMILIES[f].label }))
const PATTERN_FAMILIES: { value: PatternFamily; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'rising', label: 'Rising' },
  { value: 'hanging', label: 'Hanging' },
  { value: 'mountain', label: 'Mountain' },
]
const SLOPES: { value: Slope; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'half', label: 'Half' },
  { value: '75', label: '75%' },
]

const gridKey = (g: BrickGrid) => `${g.cols}x${g.rows}`
const percent = (match: number) => `${Math.round(match * 100)}%`
/** Seeds tried per Brick family and Slope each time Closest Bricks looks further. */
const SEEDS_PER_LOOK = 200

/** The Bricks tab: every Plan type a Plan can be, and the Brick grid every Brick is drawn on. */
export function PlanTypes({
  planTypes,
  brickGrid,
  plansByType,
  onChange,
  onGridChange,
}: {
  planTypes: PlanType[]
  brickGrid: BrickGrid
  /** How many Plans, across all Portfolios, are each Plan type. */
  plansByType: Map<string, number>
  onChange: (types: PlanType[]) => void
  onGridChange: (grid: BrickGrid) => void
}) {
  const setType = (type: PlanType) => onChange(planTypes.map((t) => (t.id === type.id ? type : t)))
  const inDraws = planTypes.filter((t) => t.inDraws).length
  const families = Object.keys(COLOUR_FAMILIES) as ColourFamily[]
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4">
        <Field label="Brick grid">
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[gridKey(brickGrid)]}
            onValueChange={(v) => {
              const picked = BRICK_GRIDS.find((g) => gridKey(g.grid) === v[0])
              if (picked) onGridChange(picked.grid)
            }}
          >
            {BRICK_GRIDS.map((g) => (
              <ToggleGroupItem key={gridKey(g.grid)} value={gridKey(g.grid)}>
                {g.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {inDraws} of {planTypes.length} in draws
          </span>
          <Button
            variant="outline"
            title="Copy every Plan type as planTypes.json, to save them as the defaults"
            onClick={() =>
              void navigator.clipboard.writeText(planTypesJson(planTypes)).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }
          >
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy planTypes.json'}
          </Button>
          <Button
            variant="secondary"
            title="New seeds for the hand-set Bricks; an exported Plan type keeps the Brick picked from its Strategy"
            onClick={() => onChange(planTypes.map((t) => (t.collection === undefined && t.brick ? { ...t, brick: { ...t.brick, seed: generateRandomSeed() } } : t)))}
          >
            <Dices /> Shuffle hand-set Bricks
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              onChange([
                {
                  id: id(),
                  name: 'New plan type',
                  colour: { family: families[Math.floor(Math.random() * families.length)]!, tint: 100 },
                  brick: { family: 'auto', slope: 'half', seed: generateRandomSeed() },
                  inDraws: true,
                },
                ...planTypes,
              ])
            }
          >
            <Plus /> Plan type
          </Button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {planTypes.map((type) => (
          <PlanTypeCard
            key={type.id}
            type={type}
            brickGrid={brickGrid}
            plans={plansByType.get(type.id) ?? 0}
            onChange={setType}
            onRemove={() => onChange(planTypes.filter((t) => t.id !== type.id))}
          />
        ))}
      </div>
    </div>
  )
}

function PlanTypeCard({
  type,
  brickGrid,
  plans,
  onChange,
  onRemove,
}: {
  type: PlanType
  brickGrid: BrickGrid
  plans: number
  onChange: (type: PlanType) => void
  onRemove: () => void
}) {
  // An exported Plan type draws the stored Brick the rule picked; only one that is not exported has a hand-set Brick to edit.
  const exported = type.collection !== undefined
  const picked = exported ? pickedBrick(type.id, brickGrid) : undefined
  const handSet = exported ? undefined : type.brick
  const brick = planTypeBrick(type, brickGrid)
  const cover = useMemo(() => planCover(type.id), [type.id])
  const match = useMemo(() => (cover && brick ? coverMatch(generateBrick(brick, brickGrid), cover) : null), [cover, brick, brickGrid])

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-3 ${type.inDraws ? 'bg-card' : 'border-dashed bg-muted/40'}`}>
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex size-20 items-center justify-center rounded-lg bg-muted">
            <BrickIcon brick={brick} colour={type.colour} size={64} />
          </div>
          {handSet && (
            <Button size="sm" variant="secondary" onClick={() => onChange({ ...type, brick: { ...handSet, seed: generateRandomSeed() } })}>
              <Dices /> Brick
            </Button>
          )}
        </div>
        {cover && (
          <div className="flex flex-col items-center gap-1.5" title="This plan's artwork on the plan picker (Figma), as 16×16 cells">
            <div className="flex size-20 items-center justify-center rounded-lg bg-muted">
              <CellGrid cells={cover.map((row) => row.map((on) => (on ? colourHex(type.colour) : null)))} size={64} />
            </div>
            <span className="text-xs text-muted-foreground">{match === null ? 'Plan Cover' : `Match ${percent(match)}`}</span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input aria-label="Plan type name" value={type.name} onChange={(e) => onChange({ ...type, name: e.target.value })} />
          <Select items={FAMILY_ITEMS} value={type.colour.family} onValueChange={(f) => f && onChange({ ...type, colour: { family: f as ColourFamily, tint: familyTints(f as ColourFamily).includes(type.colour.tint) ? type.colour.tint : 100 } })}>
            <SelectTrigger aria-label="Colour family" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FAMILY_ITEMS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  <span className="size-3 rounded-sm" style={{ background: COLOUR_FAMILIES[f.value].tints[100] }} />
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[String(type.colour.tint)]}
            onValueChange={(v) => v[0] && onChange({ ...type, colour: { ...type.colour, tint: Number(v[0]) as Tint } })}
          >
            {familyTints(type.colour.family).map((t) => (
              <ToggleGroupItem key={t} value={String(t)} aria-label={`Tint ${t}`} className="flex-1">
                <span className="size-3 rounded-sm" style={{ background: colourHex({ family: type.colour.family, tint: t }) }} />
                <span className="text-xs">{t}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {type.collection && type.strategy && <CollectionAndStrategy collection={type.collection} strategy={type.strategy} />}

      {picked && <PickedBrickLine brick={picked} brickGrid={brickGrid} />}

      {handSet && <HandSetBrick type={type} brick={handSet} brickGrid={brickGrid} cover={cover} match={match} onChange={(changed) => onChange({ ...type, brick: changed })} />}

      <div className="flex items-center gap-2 border-t pt-3">
        <Label className="flex flex-1 items-center gap-2 text-sm font-normal">
          <Switch checked={type.inDraws} onCheckedChange={(inDraws) => onChange({ ...type, inDraws })} />
          In draws
        </Label>
        {plans > 0 && (
          <span className="text-xs text-muted-foreground">
            {plans} Plan{plans > 1 ? 's' : ''}
          </span>
        )}
        <Button size="icon" variant="ghost" aria-label="Remove plan type" title={plans > 0 ? 'Plans are this type; change them first' : undefined} disabled={plans > 0} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

/** The controls of a hand-set Brick: its Brick family and Slope, Closest Bricks where the Plan type has a Plan Cover, and its seed and Pattern Builder settings. Only a Plan type that is not exported has them. */
function HandSetBrick({
  type,
  brick,
  brickGrid,
  cover,
  match,
  onChange,
}: {
  type: PlanType
  brick: BrickSettings
  brickGrid: BrickGrid
  cover: boolean[][] | undefined
  /** How much the Brick overlaps the Plan Cover; null with no Plan Cover or on a Brick grid that has no score. */
  match: number | null
  onChange: (brick: BrickSettings) => void
}) {
  const setBrick = (change: Partial<BrickSettings>) => onChange({ ...brick, ...change })
  const defaults = brickDefaults(brickGrid)
  const blockCounts = blockCountRangeFor({ ...brickGrid, cellW: 1, cellH: 1 })
  // Closest Bricks found so far, for the Brick grid they were found on, and how far the seeds went.
  const [closest, setClosest] = useState<{ grid: string; to: number; found: CoverCandidate[] } | null>(null)
  const [looking, setLooking] = useState(false)
  const shown = closest?.grid === gridKey(brickGrid) ? closest : null
  const lookFurther = () => {
    if (!cover) return
    const from = shown?.to ?? 0
    setLooking(true)
    // Let the button show it's looking before the search holds up the page.
    setTimeout(() => {
      const found = closestBricks(cover, brickGrid, type.id, { from, tries: SEEDS_PER_LOOK })
      setClosest({ grid: gridKey(brickGrid), to: from + SEEDS_PER_LOOK, found: from === 0 ? found : [...(shown?.found ?? []), ...found].sort((a, b) => b.match - a.match).slice(0, 8) })
      setLooking(false)
    }, 0)
  }

  return (
    <>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Brick family">
        <Select items={PATTERN_FAMILIES} value={brick.family} onValueChange={(f) => f && setBrick({ family: f as PatternFamily })}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PATTERN_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Slope">
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[brick.slope]} onValueChange={(v) => v[0] && setBrick({ slope: v[0] as Slope })}>
          {SLOPES.map((s) => (
            <ToggleGroupItem key={s.value} value={s.value}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </div>

    {cover && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={looking || match === null} title={match === null ? 'Plan Covers are square; pick a square Brick grid' : undefined} onClick={lookFurther}>
            <Search /> {looking ? 'Looking…' : shown ? 'Look further' : 'Closest Bricks'}
          </Button>
          {shown && <span className="text-xs text-muted-foreground">best of {shown.to} seeds per Brick family and Slope</span>}
        </div>
        {shown && (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {shown.found.map((c) => {
              const current = sameBrick(c.brick, brick)
              return (
                <button
                  key={`${c.brick.family}-${c.brick.slope}-${c.brick.seed}`}
                  type="button"
                  title={`${c.brick.family} · ${c.brick.slope} · ${c.brick.seed}`}
                  className={`flex flex-col items-center gap-1 rounded-md border p-1 hover:bg-muted ${current ? 'border-primary ring-1 ring-primary' : ''}`}
                  onClick={() => onChange(c.brick)}
                >
                  <BrickIcon brick={c.brick} colour={type.colour} size={32} />
                  <span className="text-[10px] text-muted-foreground tabular-nums">{percent(c.match)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )}

    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Advanced · seed {brick.seed}</summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Seed">
          <Input value={brick.seed} onChange={(e) => setBrick({ seed: e.target.value })} />
        </Field>
        <NumberField label="Block count" min={blockCounts.min} max={blockCounts.max} value={brick.blockCount ?? defaults.blockCount} onChange={(blockCount) => setBrick({ blockCount })} />
        <NumberField label="Guidance %" min={0} max={100} value={brick.guidance ?? defaults.guidance} onChange={(guidance) => setBrick({ guidance })} />
        <NumberField label="Corner meets" min={0} max={3} value={brick.cornerMeetLimit ?? defaults.cornerMeetLimit} onChange={(cornerMeetLimit) => setBrick({ cornerMeetLimit })} />
      </div>
    </details>
    </>
  )
}

/** What the rule picked for an exported Plan type on the current Brick grid, read-only: it changes by changing the Strategy in `planTypes.json` and running `npm run bricks:pick` again. */
function PickedBrickLine({ brick, brickGrid }: { brick: PickedBrick; brickGrid: BrickGrid }) {
  const family = PATTERN_FAMILIES.find((f) => f.value === brick.family)?.label
  const slope = SLOPES.find((s) => s.value === brick.slope)?.label
  return (
    <p className="text-xs text-muted-foreground" title="Picked from the Strategy by npm run bricks:pick">
      Brick from the Strategy: {family} · {slope} · largest Block {brick.largestBlock.w}×{brick.largestBlock.h} · {brick.exact ? 'meets the Initial Cost target' : 'nearest to the Initial Cost target'}
      {brickGrid.rows !== brickGrid.cols && ` · settings of the ${brickGrid.cols}×${brickGrid.cols} Brick grid`}
    </p>
  )
}

/** An exported Plan type's Collection and its Strategy, read-only: a Strategy is changed in `planTypes.json`. */
function CollectionAndStrategy({ collection, strategy }: { collection: string; strategy: Strategy }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium" title="Collection on the Bricks page in Figma">
        {collection}
      </span>
      {strategyLine(strategy).map((part) => (
        <span key={part.value} className="flex items-center gap-1.5">
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          {part.guess ? (
            <span className="text-muted-foreground italic underline decoration-dashed underline-offset-2" title="A guess: no source for this value yet">
              {part.text} (guess)
            </span>
          ) : (
            part.text
          )}
        </span>
      ))}
    </div>
  )
}

const sameBrick = (a: BrickSettings, b: BrickSettings) =>
  a.family === b.family && a.slope === b.slope && a.seed === b.seed && a.blockCount === b.blockCount && a.guidance === b.guidance && a.cornerMeetLimit === b.cornerMeetLimit

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function NumberField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
    </Field>
  )
}
