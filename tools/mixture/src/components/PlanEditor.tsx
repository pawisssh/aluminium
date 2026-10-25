import { Dices, Trash2 } from 'lucide-react'
import { BRICK_DEFAULTS, type BrickSettings } from '@/core/brick'
import { COLOUR_FAMILIES, TINTS, type ColourFamily, type Tint } from '@/core/colours'
import { generateRandomSeed, type Plan } from '@/playground'
import type { PatternFamily, Slope } from '@/vendor/fnm-core/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
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

export function PlanEditor({
  plan,
  share,
  cells,
  totalCells,
  onChange,
  onRemove,
}: {
  plan: Plan
  /** Share of the Portfolio's value, 0 to 100. */
  share: number
  /** Cells this Plan's colour takes in the Mix (shared with Plans of the same colour). */
  cells: number
  totalCells: number
  onChange: (plan: Plan) => void
  onRemove: () => void
}) {
  const setBrick = (brick: Partial<BrickSettings>) => onChange({ ...plan, brick: { ...plan.brick, ...brick } })
  const sliderMax = Math.max(500000, Math.ceil(plan.value / 100000) * 100000)

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-lg bg-muted p-2">
            <BrickIcon brick={plan.brick} colour={plan.colour} size={64} />
          </div>
          <Button size="sm" variant="secondary" onClick={() => setBrick({ seed: generateRandomSeed() })}>
            <Dices /> Brick
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex gap-2">
            <Input aria-label="Plan name" value={plan.name} onChange={(e) => onChange({ ...plan, name: e.target.value })} />
            <Button size="icon" variant="ghost" aria-label="Remove plan" onClick={onRemove}>
              <Trash2 />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Input
              aria-label="Value in baht"
              type="number"
              min={0}
              step={1000}
              className="w-36"
              value={plan.value}
              onChange={(e) => onChange({ ...plan, value: Math.max(0, Number(e.target.value) || 0) })}
            />
            <Slider className="flex-1" min={0} max={sliderMax} step={1000} value={[plan.value]} onValueChange={(v) => onChange({ ...plan, value: (v as number[])[0] ?? 0 })} />
          </div>
          <p className="text-sm text-muted-foreground">
            {share.toFixed(2)}% of the Portfolio · colour takes {cells}/{totalCells} cells ({((cells / totalCells) * 100).toFixed(2)}%)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Colour">
          <Select items={FAMILY_ITEMS} value={plan.colour.family} onValueChange={(f) => onChange({ ...plan, colour: { ...plan.colour, family: f as ColourFamily } })}>
            <SelectTrigger className="w-full">
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
        </Field>
        <Field label="Tint">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[String(plan.colour.tint)]}
            onValueChange={(v) => v[0] && onChange({ ...plan, colour: { ...plan.colour, tint: Number(v[0]) as Tint } })}
          >
            {TINTS.map((t) => (
              <ToggleGroupItem key={t} value={String(t)} aria-label={`Tint ${t}`}>
                <span className="size-3 rounded-sm" style={{ background: COLOUR_FAMILIES[plan.colour.family].tints[t] }} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field label="Brick family">
          <Select items={PATTERN_FAMILIES} value={plan.brick.family} onValueChange={(f) => setBrick({ family: f as PatternFamily })}>
            <SelectTrigger className="w-full">
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
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[plan.brick.slope]} onValueChange={(v) => v[0] && setBrick({ slope: v[0] as Slope })}>
            {SLOPES.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Advanced · seed {plan.brick.seed}</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Seed">
            <Input value={plan.brick.seed} onChange={(e) => setBrick({ seed: e.target.value })} />
          </Field>
          <NumberField label="Block count" min={1} max={6} value={plan.brick.blockCount ?? BRICK_DEFAULTS.blockCount} onChange={(blockCount) => setBrick({ blockCount })} />
          <NumberField label="Guidance %" min={0} max={100} value={plan.brick.guidance ?? BRICK_DEFAULTS.guidance} onChange={(guidance) => setBrick({ guidance })} />
          <NumberField label="Corner meets" min={0} max={3} value={plan.brick.cornerMeetLimit ?? BRICK_DEFAULTS.cornerMeetLimit} onChange={(cornerMeetLimit) => setBrick({ cornerMeetLimit })} />
        </div>
      </details>
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
