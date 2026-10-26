import { useMemo } from 'react'
import { Dices, Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { colourFromKey, colourHex, colourKey, COLOUR_FAMILIES } from '@/core/colours'
import { buildMix, type Mix, type MixLayout, type MixSize } from '@/core/mix'
import { baht, examplePlans, generateRandomSeed, initialPlayground, newPlan, newPortfolio, portfolioValue, usePlayground, type Plan, type Portfolio } from '@/playground'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MixIcon } from '@/components/icons'
import { MixExamples } from '@/components/MixExamples'
import { PhonePreview } from '@/components/PhonePreview'
import { PlanEditor } from '@/components/PlanEditor'

export default function App() {
  const [state, setState] = usePlayground()
  const { portfolios, mixSize, mixLayout, selectedId } = state
  const selected = portfolios.find((p) => p.id === selectedId) ?? portfolios[0]

  const mixes = useMemo(
    () => new Map<string, Mix>(portfolios.map((p) => [p.id, buildMix(p.plans, mixSize, { layout: mixLayout, seed: p.mixSeed })])),
    [portfolios, mixSize, mixLayout],
  )

  const updatePortfolio = (p: Portfolio) => setState((s) => ({ ...s, portfolios: s.portfolios.map((q) => (q.id === p.id ? p : q)) }))

  return (
    <div className="flex min-h-svh flex-col gap-8 p-4 lg:flex-row lg:items-start lg:p-8">
      <div className="flex justify-center lg:sticky lg:top-8">
        <PhonePreview portfolios={portfolios} mixes={mixes} selectedId={selected?.id ?? ''} />
      </div>

      <main className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mixture</h1>
            <p className="text-sm text-muted-foreground">How a Portfolio's allocation reads as a Mix, and how each Plan's Brick looks.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Setting label="Mix grid">
              <ToggleGroup variant="outline" spacing={0} value={[String(mixSize)]} onValueChange={(v) => v[0] && setState((s) => ({ ...s, mixSize: Number(v[0]) as MixSize }))}>
                <ToggleGroupItem value="4">4×4</ToggleGroupItem>
                <ToggleGroupItem value="8">8×8</ToggleGroupItem>
              </ToggleGroup>
            </Setting>
            <Setting label="Mix layout">
              <ToggleGroup variant="outline" spacing={0} value={[mixLayout]} onValueChange={(v) => v[0] && setState((s) => ({ ...s, mixLayout: v[0] as MixLayout }))}>
                <ToggleGroupItem value="random">Random</ToggleGroupItem>
                <ToggleGroupItem value="ordered">Ordered</ToggleGroupItem>
              </ToggleGroup>
            </Setting>
            <Button variant="ghost" onClick={() => setState(initialPlayground())}>
              <RotateCcw /> Reset
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={selected?.id} onValueChange={(v) => setState((s) => ({ ...s, selectedId: String(v) }))}>
            <TabsList>
              {portfolios.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>
                  {p.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const p = newPortfolio()
              setState((s) => ({ ...s, portfolios: [...s.portfolios, p], selectedId: p.id }))
            }}
          >
            <Plus /> Portfolio
          </Button>
        </div>

        {selected && (
          <MixExamples
            onPick={(example) =>
              setState((s) => ({
                ...s,
                mixSize: example.size,
                mixLayout: 'ordered',
                portfolios: s.portfolios.map((p) => (p.id === selected.id ? { ...p, plans: examplePlans(example) } : p)),
              }))
            }
          />
        )}

        {selected && (
          <PortfolioEditor
            portfolio={selected}
            mix={mixes.get(selected.id)!}
            totalCells={mixSize * mixSize}
            onChange={updatePortfolio}
            onRemove={
              portfolios.length > 1
                ? () => setState((s) => ({ ...s, portfolios: s.portfolios.filter((p) => p.id !== selected.id), selectedId: s.portfolios.find((p) => p.id !== selected.id)!.id }))
                : undefined
            }
          />
        )}
      </main>
    </div>
  )
}

function PortfolioEditor({
  portfolio,
  mix,
  totalCells,
  onChange,
  onRemove,
}: {
  portfolio: Portfolio
  mix: Mix
  totalCells: number
  onChange: (p: Portfolio) => void
  onRemove?: () => void
}) {
  const total = portfolioValue(portfolio)
  const cellsByKey = new Map<string, number>()
  for (const key of mix.cells.flat()) if (key) cellsByKey.set(key, (cellsByKey.get(key) ?? 0) + 1)
  const setPlan = (plan: Plan) => onChange({ ...portfolio, plans: portfolio.plans.map((p) => (p.id === plan.id ? plan : p)) })

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-lg bg-muted p-3">
            <MixIcon cells={mix.cells} size={192} />
          </div>
          <Button size="sm" variant="secondary" onClick={() => onChange({ ...portfolio, mixSeed: generateRandomSeed() })}>
            <Dices /> Shuffle Mix
          </Button>
          <span className="text-xs text-muted-foreground">seed {portfolio.mixSeed}</span>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex gap-2">
            <Input aria-label="Portfolio name" value={portfolio.name} onChange={(e) => onChange({ ...portfolio, name: e.target.value })} />
            {onRemove && (
              <Button variant="ghost" onClick={onRemove}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{baht(total)}</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Plan colour</th>
                <th className="py-1 text-right font-normal">Value share</th>
                <th className="py-1 text-right font-normal">Cells</th>
                <th className="py-1 text-right font-normal">Shown as</th>
              </tr>
            </thead>
            <tbody>
              {colourRows(portfolio, total).map((row) => {
                const cells = cellsByKey.get(row.key) ?? 0
                return (
                  <tr key={row.key} className="border-t">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="size-3 rounded-sm" style={{ background: colourHex(colourFromKey(row.key)) }} />
                        {row.label}
                        <span className="text-muted-foreground">· {row.names.join(', ')}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{row.share.toFixed(2)}%</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {cells}/{totalCells}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{((cells / totalCells) * 100).toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {mix.hiddenColours > 0 && (
            <p className="flex items-center gap-2 text-sm text-negative">
              <TriangleAlert className="size-4" /> {mix.hiddenColours} Plan colour{mix.hiddenColours > 1 ? 's are' : ' is'} too small to fit in {totalCells} cells and left out.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {portfolio.plans.map((plan) => (
          <PlanEditor
            key={plan.id}
            plan={plan}
            share={total > 0 ? (Math.max(0, plan.value) / total) * 100 : 0}
            cells={cellsByKey.get(colourKey(plan.colour)) ?? 0}
            totalCells={totalCells}
            onChange={setPlan}
            onRemove={() => onChange({ ...portfolio, plans: portfolio.plans.filter((p) => p.id !== plan.id) })}
          />
        ))}
        <Button variant="outline" onClick={() => onChange({ ...portfolio, plans: [...portfolio.plans, newPlan(portfolio.plans)] })}>
          <Plus /> Add plan
        </Button>
      </div>
    </div>
  )
}

/** One row per Plan colour, the way the Mix counts them. */
function colourRows(portfolio: Portfolio, total: number) {
  const rows = new Map<string, { key: string; label: string; names: string[]; share: number }>()
  for (const plan of portfolio.plans) {
    const key = colourKey(plan.colour)
    const row = rows.get(key) ?? { key, label: `${COLOUR_FAMILIES[plan.colour.family].label} ${plan.colour.tint}`, names: [], share: 0 }
    row.names.push(plan.name)
    row.share += total > 0 ? (Math.max(0, plan.value) / total) * 100 : 0
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.share - a.share)
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
