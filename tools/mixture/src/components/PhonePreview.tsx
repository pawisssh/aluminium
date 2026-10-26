import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Mix } from '@/core/mix'
import { baht, portfolioValue, type Portfolio, type ShownPlan } from '@/playground'
import { BrickIcon, MixIcon } from './icons'

/** The Portfolios list from the Dashboard 3.0 Figma frame, drawn with the live Bricks and Mixes. */
export function PhonePreview({ portfolios, mixes, selectedId }: { portfolios: Portfolio<ShownPlan>[]; mixes: Map<string, Mix>; selectedId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(selectedId)
  // Follow the Portfolio picked in the editor.
  const [followedId, setFollowedId] = useState(selectedId)
  if (followedId !== selectedId) {
    setFollowedId(selectedId)
    setExpandedId(selectedId)
  }
  const netWorth = portfolios.reduce((a, p) => a + portfolioValue(p), 0)

  return (
    <div className="relative h-[874px] w-[402px] shrink-0 overflow-hidden rounded-[56px] border-[10px] border-neutral-900 bg-background shadow-2xl">
      <div className="absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-brand to-background" />
      <div className="relative flex h-full flex-col">
        <div className="flex h-[54px] items-center justify-between px-8 pt-2 text-[15px] font-medium">
          <span>9:41</span>
          <span className="h-[30px] w-[110px] rounded-full bg-neutral-900" />
          <span className="w-8" />
        </div>
        <header className="flex flex-col items-center py-3">
          <span className="text-xs text-muted-foreground">Net Worth</span>
          <span className="text-base font-medium">{baht(netWorth)}</span>
        </header>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-6">
          {portfolios.map((p) => {
            const value = portfolioValue(p)
            const share = netWorth > 0 ? (value / netWorth) * 100 : 0
            const expanded = expandedId === p.id
            const mix = mixes.get(p.id)
            return (
              <section key={p.id} className="rounded-2xl bg-card">
                <button type="button" className="flex h-[72px] w-full items-center gap-3 px-4 text-left" onClick={() => setExpandedId(expanded ? null : p.id)}>
                  {mix && <MixIcon cells={mix.cells} size={expanded ? 36 : 20} />}
                  <span className="flex flex-1 flex-col">
                    <span className="text-base font-medium">{p.name}</span>
                    <span className="text-sm text-muted-foreground">{share.toFixed(2)}%</span>
                  </span>
                  <span className="text-base">{baht(value)}</span>
                  {expanded ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
                </button>
                {expanded && (
                  <ul className="px-4 pb-2">
                    {p.plans.map((plan) => (
                      <li key={plan.id} className="flex min-h-[72px] items-center gap-3 border-t border-black/5">
                        <span className="flex size-9 shrink-0 items-center justify-center">
                          <BrickIcon brick={plan.brick} colour={plan.colour} />
                        </span>
                        <span className="flex-1 text-base text-black/65">{plan.name}</span>
                        <span className="flex flex-col items-end">
                          <span className="text-base">{baht(plan.value)}</span>
                          <span className={`text-sm ${plan.change >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {plan.change >= 0 ? '+' : ''}
                            {plan.change.toFixed(2)}%
                          </span>
                        </span>
                        <ChevronRight className="size-5" />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
