import { useState } from 'react'
import { colourKey } from '@/core/colours'
import { caseValues, mixCases, type MixCase } from '@/core/mixCases'
import { CASE_COLOURS } from '@/playground'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MixIcon } from './icons'

const CASES = mixCases(CASE_COLOURS.length)
const COUNTS = [...new Set(CASES.map((c) => c.sizes.length))]
const percent = (cells: number) => `${(cells / 16) * 100}%`

/**
 * Picks how many Plan colours, then a Mix case with that many; the Portfolio being edited gets
 * random values in percent that snap back to it, in random Plan colours. Picking the same case again draws new ones.
 */
export function MixCasePicker({ onPick }: { onPick: (values: number[]) => void }) {
  const [colours, setColours] = useState(4)
  const [picked, setPicked] = useState<number | null>(null)

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Mix cases</h2>
        <p className="text-xs text-muted-foreground">
          Pick how many Plan colours, then a Mix case: this Portfolio gets random values that a 4×4 Ordered Mix snaps back to it, in random Plan colours. Pick it again for new ones.
        </p>
      </div>
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[String(colours)]}
        onValueChange={(v) => {
          if (!v[0]) return
          setColours(Number(v[0]))
          setPicked(null)
        }}
      >
        {COUNTS.map((n) => (
          <ToggleGroupItem key={n} value={String(n)} className="tabular-nums">
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap gap-2">
        {CASES.map((c: MixCase, i) =>
          c.sizes.length !== colours ? null : (
            <button
              key={c.sizes.join('-')}
              type="button"
              className={`flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center hover:bg-muted ${picked === i ? 'bg-muted ring-1 ring-ring' : ''}`}
              onClick={() => {
                setPicked(i)
                onPick(caseValues(c, Math.random))
              }}
            >
              <MixIcon cells={c.cells.map((row) => row.map((k) => colourKey(CASE_COLOURS[k]!)))} size={56} />
              <span className="text-xs tabular-nums">Case #{i + 1}</span>
              <span className="text-[10px] leading-tight text-muted-foreground tabular-nums">{c.sizes.map(percent).join(' / ')}</span>
            </button>
          ),
        )}
      </div>
    </section>
  )
}
