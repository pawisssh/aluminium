import { useMemo, useState } from 'react'
import { COLOUR_FAMILIES, type ColourFamily } from '@/core/colours'
import { buildMix, type MixLayout, type MixSize } from '@/core/mix'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MixIcon } from '@/components/icons'

const FAMILIES = Object.keys(COLOUR_FAMILIES) as ColourFamily[]
const COUNTS = FAMILIES.map((_, i) => i + 1)

/** Every way to pick `k` of `items`, in the order they're listed. */
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]]
  return items.flatMap((item, i) => combinations(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]))
}

const binomial = (n: number, k: number): number => (k === 0 ? 1 : (binomial(n, k - 1) * (n - k + 1)) / k)

/**
 * Every set of colour families a Mix can hold at Tint 100, one Mix per set. Each Plan colour gets
 * an equal value, so where the cells don't split evenly the families listed first get the extra.
 */
export function MixCases({ mixSize, mixLayout }: { mixSize: MixSize; mixLayout: MixLayout }) {
  const [count, setCount] = useState(2)
  const cases = useMemo(
    () =>
      combinations(FAMILIES, count).map((families) => ({
        families,
        mix: buildMix(
          families.map((family) => ({ value: 1, colour: { family, tint: 100 } })),
          mixSize,
          { layout: mixLayout, seed: families.join('+') },
        ),
      })),
    [count, mixSize, mixLayout],
  )
  const total = COUNTS.reduce((a, k) => a + binomial(FAMILIES.length, k), 0)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Plan colours in the Mix (Tint 100)</Label>
          <ToggleGroup variant="outline" spacing={0} value={[String(count)]} onValueChange={(v) => v[0] && setCount(Number(v[0]))}>
            {COUNTS.map((k) => (
              <ToggleGroupItem key={k} value={String(k)}>
                {k}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <p className="text-sm">
          <span className="text-2xl font-bold tabular-nums">{cases.length}</span> cases with {count} of {FAMILIES.length} colour families
          <span className="text-muted-foreground"> · {total} across 1–{FAMILIES.length}</span>
        </p>
        <table className="w-fit text-xs tabular-nums">
          <tbody>
            <tr>
              <th className="pr-3 text-left font-normal text-muted-foreground">Colours</th>
              {COUNTS.map((k) => (
                <td key={k} className={`px-2 text-right ${k === count ? 'font-bold' : ''}`}>
                  {k}
                </td>
              ))}
            </tr>
            <tr>
              <th className="pr-3 text-left font-normal text-muted-foreground">Cases</th>
              {COUNTS.map((k) => (
                <td key={k} className={`px-2 text-right ${k === count ? 'font-bold' : ''}`}>
                  {binomial(FAMILIES.length, k)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Each Plan colour has an equal value, so which one is largest isn't varied: where the cells don't split evenly, the colour listed first gets the extra.
        </p>
      </section>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
        {cases.map(({ families, mix }, i) => {
          const names = families.map((f) => COLOUR_FAMILIES[f].label).join(', ')
          return (
            <figure key={families.join('+')} className="flex flex-col items-center gap-1" title={names}>
              <div className="rounded-md bg-muted p-1.5">
                <MixIcon cells={mix.cells} size={64} />
              </div>
              <figcaption className="text-center text-[10px] leading-tight text-muted-foreground">
                <span className="tabular-nums">#{i + 1}</span>
                {count <= 3 && <span className="block">{names}</span>}
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
