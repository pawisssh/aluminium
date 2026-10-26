import { Dices, Trash2 } from 'lucide-react'
import type { PlanType } from '@/core/planTypes'
import type { ShownPlan } from '@/playground'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { BrickIcon } from './icons'

export function PlanEditor({
  plan,
  planTypes,
  share,
  cells,
  totalCells,
  onChange,
  onRedraw,
  onRemove,
}: {
  plan: ShownPlan
  planTypes: PlanType[]
  /** Share of the Portfolio's value, 0 to 100. */
  share: number
  /** Cells this Plan's colour takes in the Mix (shared with Plans of the same colour). */
  cells: number
  totalCells: number
  onChange: (plan: ShownPlan) => void
  /** Swaps the Plan's type for one drawn at random. */
  onRedraw: () => void
  onRemove: () => void
}) {
  const sliderMax = Math.max(500000, Math.ceil(plan.value / 100000) * 100000)
  const typeItems = planTypes.map((t) => ({ value: t.id, label: t.name }))

  return (
    <div className="flex items-start gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-20 items-center justify-center rounded-lg bg-muted">
          <BrickIcon brick={plan.brick} colour={plan.colour} size={64} />
        </div>
        <Button size="sm" variant="secondary" onClick={onRedraw}>
          <Dices /> Draw
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex gap-2">
          <Select items={typeItems} value={plan.typeId} onValueChange={(typeId) => typeId && onChange({ ...plan, typeId: String(typeId) })}>
            <SelectTrigger aria-label="Plan type" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex size-4 items-center justify-center">
                    <BrickIcon brick={t.brick} colour={t.colour} size={16} />
                  </span>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
  )
}
