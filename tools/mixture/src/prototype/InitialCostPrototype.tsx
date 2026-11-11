// PROTOTYPE, throwaway: three rules for turning Initial Cost into the largest Block of a Brick,
// switchable via ?rule=A|B|C on the #prototype page. See initialCost.ts; picks.json comes from generate.mjs.
import { useEffect, useState } from 'react'
import { RULES, SIDES, STEPS, shapeOf, stepOf, strategies, type Side, type Strategy } from './initialCost'
import PICKS from './picks.json'

interface Pick {
  id: string
  blocks: number[][]
  top: number[] | null
  exact: boolean
  allowed: number
  repeat: boolean
  settings: string
}
const picks = PICKS as unknown as Record<string, Record<string, Pick[]>>

const STYLE_TEXT = { 'one-time': 'One-time', dca: 'Dollar Cost Average', 'market-timing': 'Market Timing' }
const SLOPE_TEXT = { flat: 'Flat', half: 'Half', '75': '75%' }
const baht = (n: number) => n.toLocaleString('en-US')

const ruleFromUrl = () => RULES.find((r) => r.id === new URLSearchParams(window.location.search).get('rule')) ?? RULES[0]!

function Brick({ pick, side, px, seams }: { pick: Pick; side: Side; px: number; seams: boolean }) {
  const top = pick.blocks.reduce<number[] | null>((a, b) => (!a || b[2]! * b[3]! > a[2]! * a[3]! ? b : a), null)
  return (
    <svg width={px} height={px} viewBox={`0 0 ${side} ${side}`} shapeRendering="crispEdges" className="rounded-sm bg-muted">
      {pick.blocks.map((b, i) => (
        <rect
          key={i}
          x={b[0]}
          y={b[1]}
          width={b[2]}
          height={b[3]}
          className={seams && b === top ? 'fill-amber-500' : 'fill-foreground'}
          stroke={seams ? 'var(--muted)' : undefined}
          strokeWidth={seams ? side / 40 : undefined}
        />
      ))}
    </svg>
  )
}

function Row({ strategy, ruleId, seams }: { strategy: Strategy; ruleId: string; seams: boolean }) {
  const shape = shapeOf(strategy)
  return (
    <tr className="border-t align-top">
      <td className="py-3 pr-4">
        <div className="font-medium">{strategy.name}</div>
        <div className="text-xs text-muted-foreground">
          {STYLE_TEXT[strategy.style]} · {strategy.riskText} → {SLOPE_TEXT[shape.slope]} · {baht(strategy.initialCost)}
        </div>
      </td>
      {SIDES.map((side) => {
        const pick = picks[ruleId]![side]!.find((p) => p.id === strategy.id)!
        return (
          <td key={side} className="py-3 pr-6" title={`${pick.settings} · ${pick.allowed} Bricks ผ่านเงื่อนไข`}>
            <div className="flex items-end gap-2">
              <Brick pick={pick} side={side} px={72} seams={seams} />
              <Brick pick={pick} side={side} px={24} seams={false} />
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {pick.top ? pick.top.join('×') : 'ไม่มี'} {pick.exact ? <span className="text-emerald-600">ตรง</span> : <span className="text-amber-600">ใกล้สุด</span>}
              {pick.repeat && <span className="text-red-600"> · ซ้ำ</span>}
            </div>
          </td>
        )
      })}
    </tr>
  )
}

export function InitialCostPrototype() {
  const [rule, setRule] = useState(ruleFromUrl)
  const [seams, setSeams] = useState(true)
  const cycle = (by: number) => {
    const next = RULES[(RULES.indexOf(rule) + by + RULES.length) % RULES.length]!
    const url = new URL(window.location.href)
    url.searchParams.set('rule', next.id)
    window.history.replaceState(null, '', url)
    setRule(next)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowLeft') cycle(-1)
      if (e.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const collections = [...new Set(strategies.map((s) => s.collection))]
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 pb-28 lg:p-8 lg:pb-28">
      <header>
        <p className="text-xs font-medium tracking-wide text-amber-600 uppercase">Prototype · ทิ้งได้</p>
        <h1 className="text-2xl font-bold">Initial Cost กำหนดขนาด Block ที่ใหญ่ที่สุดอย่างไร</h1>
        <p className="text-sm text-muted-foreground">
          Brick ของ Plan type ที่ส่งออก {strategies.length} ตัว บน Brick grid 4 ขนาด ภายใต้กติกา {RULES.length} แบบ สลับด้วยปุ่มลูกศรหรือแถบด้านล่าง
        </p>
      </header>

      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {rule.id} · {rule.name}
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={seams} onChange={(e) => setSeams(e.target.checked)} />
            แสดงรอยต่อ Block (Block ใหญ่สุดเป็นสีเหลือง)
          </label>
        </div>
        <p className="text-sm text-muted-foreground">{rule.note}</p>
        <table className="mt-3 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-normal">เป้าของ Block ใหญ่สุด</th>
              {STEPS.map((step) => (
                <th key={step} className="py-1 font-normal">
                  {baht(step)}
                </th>
              ))}
              <th className="py-1 font-normal">ตรงเป้า</th>
              <th className="py-1 font-normal">Brick ไม่ซ้ำ</th>
            </tr>
          </thead>
          <tbody>
            {SIDES.map((side) => {
              const all = picks[rule.id]![side]!
              return (
                <tr key={side} className="border-t">
                  <td className="py-1">
                    {side}×{side}
                  </td>
                  {STEPS.map((step, i) => (
                    <td key={step} className="py-1">
                      {rule.target(side, i)}
                    </td>
                  ))}
                  <td className="py-1">
                    {all.filter((p) => p.exact).length}/{all.length}
                  </td>
                  <td className="py-1">
                    {new Set(all.map((p) => JSON.stringify(p.blocks.map((b) => b.join()).sort()))).size}/{all.length}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {collections.map((collection) => (
        <section key={collection}>
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{collection}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-2/5 py-1 font-normal">Plan type · Strategy</th>
                {SIDES.map((side) => (
                  <th key={side} className="py-1 font-normal">
                    {side}×{side}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strategies
                .filter((s) => s.collection === collection)
                .toSorted((a, b) => stepOf(a) - stepOf(b))
                .map((s) => (
                  <Row key={s.id} strategy={s} ruleId={rule.id} seams={seams} />
                ))}
            </tbody>
          </table>
        </section>
      ))}

      <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-3 py-2 text-sm text-white shadow-xl">
        <button className="rounded-full px-2 hover:bg-white/20" onClick={() => cycle(-1)} aria-label="กติกาก่อนหน้า">
          ←
        </button>
        <span className="min-w-40 text-center font-medium">
          {rule.id} ({rule.name})
        </span>
        <button className="rounded-full px-2 hover:bg-white/20" onClick={() => cycle(1)} aria-label="กติกาถัดไป">
          →
        </button>
      </div>
    </div>
  )
}
