import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import type { BrickGrid } from '@/core/brick'
import { BRICK_TEMPLATES, cellsKey, keepsPatternRules, templateBrick, templateSettings, type BrickTemplate } from '@/core/brickTemplates'
import type { PlanColour } from '@/core/colours'
import { defaultTemplatesInDraws } from '@/playground'
import { Button } from '@/components/ui/button'
import { BrickGridPicker } from './PlanTypes'
import { BrickIcon } from './icons'

const IN_DRAWS: PlanColour = { family: 'purple', tint: 100 }
const LEFT_OUT: PlanColour = { family: 'light-grey', tint: 100 }
const SLOPE_LABELS = { flat: 'Flat', half: 'Half', '75': '75%' }

interface Card {
  template: BrickTemplate
  /** Its number in its group, from 1. */
  n: number
  /** The number of the first card in its group drawn with the same cells on this Brick grid. */
  sameAs?: number
  keepsRules: boolean
}

/**
 * The Brick templates page: every Reference Pattern as a Brick on the Brick grid, by Brick family and
 * Slope. The ones in draws are what the Bricks tab's Brick buttons pick from.
 */
export function BrickTemplates({
  templatesInDraws,
  brickGrid,
  onChange,
  onGridChange,
}: {
  templatesInDraws: string[]
  brickGrid: BrickGrid
  onChange: (keys: string[]) => void
  onGridChange: (grid: BrickGrid) => void
}) {
  const inDraws = new Set(templatesInDraws)
  const groups = useMemo(() => {
    const byGroup = new Map<string, Card[]>()
    for (const template of BRICK_TEMPLATES) {
      const group = `${template.family}/${template.slope}`
      const cards = byGroup.get(group) ?? []
      const cells = templateBrick(template, brickGrid)
      const key = cellsKey(cells)
      const first = cards.find((c) => cellsKey(templateBrick(c.template, brickGrid)) === key)
      cards.push({ template, n: cards.length + 1, sameAs: first?.n, keepsRules: keepsPatternRules(cells) })
      byGroup.set(group, cards)
    }
    return [...byGroup.values()]
  }, [brickGrid])
  const all = groups.flat()

  const set = (keys: Iterable<string>) => {
    const wanted = new Set(keys)
    onChange(BRICK_TEMPLATES.filter((t) => wanted.has(t.key)).map((t) => t.key))
  }
  const toggle = (keys: string[], on: boolean) => set(on ? [...inDraws, ...keys] : [...inDraws].filter((k) => !keys.includes(k)))

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <BrickGridPicker brickGrid={brickGrid} onGridChange={onGridChange} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {inDraws.size} of {all.length} in draws
            </span>
            <Button variant="outline" onClick={() => set(all.filter((c) => c.keepsRules).map((c) => c.template.key))}>
              Keep the rules
            </Button>
            <Button variant="outline" title="Leave out a Brick template drawn the same as an earlier one in its group" onClick={() => toggle(all.filter((c) => c.sameAs).map((c) => c.template.key), false)}>
              Drop repeats
            </Button>
            <Button variant="outline" onClick={() => set([])}>
              None
            </Button>
            <Button variant="ghost" onClick={() => onChange(defaultTemplatesInDraws())}>
              <RotateCcw /> Reset
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Each Brick template is one Reference Pattern laid on the Brick grid by area, the way block's Brick gallery draws it. The Bricks tab's Brick, Shuffle all Bricks and new
          Plan type buttons pick only templates in draws; with none in draws they generate a Brick from a new seed. Click a template to put it in draws or leave it out.
        </p>
      </section>

      {groups.map((cards) => {
        const { family, slope } = cards[0]!.template
        const keys = cards.map((c) => c.template.key)
        const on = keys.filter((k) => inDraws.has(k)).length
        return (
          <section key={`${family}/${slope}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold capitalize">
                {family} · {SLOPE_LABELS[slope]}
              </h2>
              <span className="text-sm text-muted-foreground">
                {on} of {cards.length} in draws
              </span>
              <Button size="sm" variant="ghost" onClick={() => toggle(keys, on < cards.length)}>
                {on < cards.length ? 'All' : 'None'}
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {cards.map((card) => (
                <TemplateCard key={card.template.key} card={card} inDraws={inDraws.has(card.template.key)} onToggle={(v) => toggle([card.template.key], v)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TemplateCard({ card, inDraws, onToggle }: { card: Card; inDraws: boolean; onToggle: (inDraws: boolean) => void }) {
  const brick = useMemo(() => templateSettings(card.template), [card.template])
  return (
    <button
      type="button"
      aria-pressed={inDraws}
      title={`Reference ${card.template.reference}`}
      onClick={() => onToggle(!inDraws)}
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs transition-colors ${inDraws ? 'border-primary bg-card ring-1 ring-primary' : 'border-dashed bg-muted/40 text-muted-foreground'}`}
    >
      <span className="flex size-16 items-center justify-center rounded-md bg-muted">
        <BrickIcon brick={brick} colour={inDraws ? IN_DRAWS : LEFT_OUT} size={48} />
      </span>
      <span className="tabular-nums">#{card.n}</span>
      {card.sameAs && <span className="text-muted-foreground">same as #{card.sameAs}</span>}
      {!card.keepsRules && <span className="text-negative">breaks rules</span>}
    </button>
  )
}
