import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { colourFromKey, colourHex, colourKey, COLOUR_FAMILIES } from '@/core/colours'
import { buildMix, type Mix } from '@/core/mix'
import type { PlanType } from '@/core/planTypes'
import { baht, casePlans, initialPlayground, newPlan, newPortfolio, portfolioValue, showPlans, storedPlan, usePlayground, type Portfolio, type ShownPlan } from '@/playground'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BrickGridContext } from '@/components/brickGrid'
import { MixIcon } from '@/components/icons'
import { MixCases } from '@/components/MixCases'
import { MixCasePicker } from '@/components/MixCasePicker'
import { MIX_CASE_COLOURS } from '@/core/mixCases'
import { PhonePreview } from '@/components/PhonePreview'
import { PlanEditor } from '@/components/PlanEditor'
import { PlanTypes } from '@/components/PlanTypes'
// PROTOTYPE, throwaway: the #prototype page (see src/prototype).
import { InitialCostPrototype } from '@/prototype/InitialCostPrototype'

type Page = 'playground' | 'bricks' | 'cases' | 'prototype'
const pageFromHash = (): Page => (window.location.hash === '#prototype' ? 'prototype' : window.location.hash === '#cases' ? 'cases' : window.location.hash === '#bricks' ? 'bricks' : 'playground')

/** The page in the URL hash, so #bricks and #cases can be linked. */
function usePage() {
  const [page, setPage] = useState(pageFromHash)
  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [page, (p: Page) => (window.location.hash = p === 'playground' ? '' : p)] as const
}

export default function App() {
  const [state, setState] = usePlayground()
  const [page, setPage] = usePage()
  const { planTypes, brickGrid, selectedId } = state
  const portfolios = useMemo(() => state.portfolios.map((p) => ({ ...p, plans: showPlans(p.plans, planTypes) })), [state.portfolios, planTypes])
  const selected = portfolios.find((p) => p.id === selectedId) ?? portfolios[0]

  const mixes = useMemo(() => new Map<string, Mix>(portfolios.map((p) => [p.id, buildMix(p.plans)])), [portfolios])

  const plansByType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const plan of state.portfolios.flatMap((p) => p.plans)) counts.set(plan.typeId, (counts.get(plan.typeId) ?? 0) + 1)
    return counts
  }, [state.portfolios])

  const updatePortfolio = (p: Portfolio) =>
    setState((s) => ({ ...s, portfolios: s.portfolios.map((q) => (q.id === p.id ? { ...p, plans: p.plans.map(storedPlan) } : q)) }))

  if (page === 'prototype') return <InitialCostPrototype />

  return (
    <BrickGridContext value={brickGrid}>
      <div className="flex min-h-svh flex-col gap-8 p-4 lg:flex-row lg:items-start lg:p-8">
        {page !== 'cases' && (
          <div className="flex justify-center lg:sticky lg:top-8">
            <PhonePreview portfolios={portfolios} mixes={mixes} selectedId={selected?.id ?? ''} />
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                Mixture <span className="font-mono text-xs font-normal text-muted-foreground">{__BUILD__}</span>
              </h1>
              <p className="text-sm text-muted-foreground">How a Portfolio's allocation reads as a Mix, and how each Plan's Brick looks.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Setting label="Page">
                <ToggleGroup variant="outline" spacing={0} value={[page]} onValueChange={(v) => v[0] && setPage(v[0] as Page)}>
                  <ToggleGroupItem value="playground">Playground</ToggleGroupItem>
                  <ToggleGroupItem value="bricks">Bricks</ToggleGroupItem>
                  <ToggleGroupItem value="cases">Mix cases</ToggleGroupItem>
                </ToggleGroup>
              </Setting>
              {page === 'playground' && (
                <Button variant="ghost" onClick={() => setState(initialPlayground())}>
                  <RotateCcw /> Reset
                </Button>
              )}
            </div>
          </header>

          {page === 'cases' && <MixCases />}

          {page === 'bricks' && (
            <PlanTypes
              planTypes={planTypes}
              brickGrid={brickGrid}
              plansByType={plansByType}
              onChange={(types) => setState((s) => ({ ...s, planTypes: types }))}
              onGridChange={(grid) => setState((s) => ({ ...s, brickGrid: grid }))}
            />
          )}

          {page === 'playground' && (
            <>
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
                    const p = newPortfolio(planTypes)
                    setState((s) => ({ ...s, portfolios: [...s.portfolios, p], selectedId: p.id }))
                  }}
                >
                  <Plus /> Portfolio
                </Button>
              </div>

              {selected && (
                <MixCasePicker
                  onPick={(values) =>
                    setState((s) => ({
                      ...s,
                      portfolios: s.portfolios.map((p) => (p.id === selected.id ? { ...p, plans: casePlans(values, planTypes) } : p)),
                    }))
                  }
                />
              )}

              {selected && (
                <PortfolioEditor
                  portfolio={selected}
                  planTypes={planTypes}
                  mix={mixes.get(selected.id)!}
                  onChange={updatePortfolio}
                  onRemove={
                    portfolios.length > 1
                      ? () => setState((s) => ({ ...s, portfolios: s.portfolios.filter((p) => p.id !== selected.id), selectedId: s.portfolios.find((p) => p.id !== selected.id)!.id }))
                      : undefined
                  }
                />
              )}
            </>
          )}
        </main>
      </div>
    </BrickGridContext>
  )
}

function PortfolioEditor({
  portfolio,
  planTypes,
  mix,
  onChange,
  onRemove,
}: {
  portfolio: Portfolio<ShownPlan>
  planTypes: PlanType[]
  mix: Mix
  /** Takes Plans as shown or as stored; only what a Plan stores is kept. */
  onChange: (p: Portfolio) => void
  onRemove?: () => void
}) {
  const total = portfolioValue(portfolio)
  const cellsByKey = new Map<string, number>()
  for (const key of mix.cells.flat()) if (key) cellsByKey.set(key, (cellsByKey.get(key) ?? 0) + 1)
  const setPlan = (plan: ShownPlan) => onChange({ ...portfolio, plans: portfolio.plans.map((p) => (p.id === plan.id ? plan : p)) })

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-lg bg-muted p-3">
            <MixIcon cells={mix.cells} size={192} />
          </div>
          {mix.mixCase && <span className="text-xs text-muted-foreground">Mix case #{mix.mixCase}</span>}
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
                      {cells}/{MIX_CELLS}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{((cells / MIX_CELLS) * 100).toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {mix.hiddenColours > 0 && (
            <p className="flex items-center gap-2 text-sm text-negative">
              <TriangleAlert className="size-4" /> {mix.hiddenColours} Plan colour{mix.hiddenColours > 1 ? 's are' : ' is'} too small to fit a Mix case, which holds up to {MIX_CASE_COLOURS.length} Plan colours, and left out.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {portfolio.plans.map((plan) => (
          <PlanEditor
            key={plan.id}
            plan={plan}
            planTypes={planTypes}
            share={total > 0 ? (Math.max(0, plan.value) / total) * 100 : 0}
            cells={cellsByKey.get(colourKey(plan.colour)) ?? 0}
            totalCells={MIX_CELLS}
            onChange={setPlan}
            onRedraw={() => {
              const next = newPlan(planTypes, portfolio.plans.map((p) => p.colour))
              if (next) setPlan({ ...plan, typeId: next.typeId })
            }}
            onRemove={() => onChange({ ...portfolio, plans: portfolio.plans.filter((p) => p.id !== plan.id) })}
          />
        ))}
        <Button
          variant="outline"
          disabled={!planTypes.some((t) => t.inDraws)}
          onClick={() => {
            const plan = newPlan(planTypes, portfolio.plans.map((p) => p.colour))
            if (plan) onChange({ ...portfolio, plans: [...portfolio.plans, plan] })
          }}
        >
          <Plus /> Add plan
        </Button>
      </div>
    </div>
  )
}

/** Cells in a Mix. */
const MIX_CELLS = 16

/** One row per Plan colour, the way the Mix counts them. */
function colourRows(portfolio: Portfolio<ShownPlan>, total: number) {
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
