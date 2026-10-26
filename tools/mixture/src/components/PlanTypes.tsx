import { Dices, Plus, Trash2 } from 'lucide-react'
import { BRICK_GRIDS, brickDefaults, type BrickGrid, type BrickSettings } from '@/core/brick'
import { COLOUR_FAMILIES, colourHex, familyTints, type ColourFamily, type Tint } from '@/core/colours'
import type { PlanType } from '@/core/planTypes'
import { generateRandomSeed, id } from '@/playground'
import { blockCountRangeFor } from '@/vendor/fnm-core/generator'
import type { PatternFamily, Slope } from '@/vendor/fnm-core/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BrickIcon } from './icons'

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
          <Button variant="secondary" onClick={() => onChange(planTypes.map((t) => ({ ...t, brick: { ...t.brick, seed: generateRandomSeed() } })))}>
            <Dices /> Shuffle all Bricks
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
  const setBrick = (brick: Partial<BrickSettings>) => onChange({ ...type, brick: { ...type.brick, ...brick } })
  const defaults = brickDefaults(brickGrid)
  const blockCounts = blockCountRangeFor({ ...brickGrid, cellW: 1, cellH: 1 })

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-3 ${type.inDraws ? 'bg-card' : 'border-dashed bg-muted/40'}`}>
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex size-20 items-center justify-center rounded-lg bg-muted">
            <BrickIcon brick={type.brick} colour={type.colour} size={64} />
          </div>
          <Button size="sm" variant="secondary" onClick={() => setBrick({ seed: generateRandomSeed() })}>
            <Dices /> Brick
          </Button>
        </div>
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

      <div className="grid grid-cols-2 gap-2">
        <Field label="Brick family">
          <Select items={PATTERN_FAMILIES} value={type.brick.family} onValueChange={(f) => f && setBrick({ family: f as PatternFamily })}>
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
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[type.brick.slope]} onValueChange={(v) => v[0] && setBrick({ slope: v[0] as Slope })}>
            {SLOPES.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Advanced · seed {type.brick.seed}</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Seed">
            <Input value={type.brick.seed} onChange={(e) => setBrick({ seed: e.target.value })} />
          </Field>
          <NumberField label="Block count" min={blockCounts.min} max={blockCounts.max} value={type.brick.blockCount ?? defaults.blockCount} onChange={(blockCount) => setBrick({ blockCount })} />
          <NumberField label="Guidance %" min={0} max={100} value={type.brick.guidance ?? defaults.guidance} onChange={(guidance) => setBrick({ guidance })} />
          <NumberField label="Corner meets" min={0} max={3} value={type.brick.cornerMeetLimit ?? defaults.cornerMeetLimit} onChange={(cornerMeetLimit) => setBrick({ cornerMeetLimit })} />
        </div>
      </details>

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
