import { buildMix } from '@/core/mix'
import { examplePlans, MIX_EXAMPLES, type MixExample } from '@/playground'
import { MixIcon } from './icons'

/** Ordered Mix examples; picking one loads its shares into the Portfolio being edited. */
export function MixExamples({ onPick }: { onPick: (example: MixExample) => void }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Ordered examples</h2>
        <p className="text-xs text-muted-foreground">Pick one to load its shares into this Portfolio.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {MIX_EXAMPLES.map((example) => {
          const mix = buildMix(examplePlans(example), example.size, { layout: 'ordered', seed: example.name })
          return (
            <button
              key={example.name}
              type="button"
              title={example.shares.map(([, share]) => `${share}%`).join(' / ')}
              className="flex w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-center hover:bg-muted"
              onClick={() => onPick(example)}
            >
              <MixIcon cells={mix.cells} size={56} />
              <span className="text-xs leading-tight">{example.name}</span>
              <span className="text-[10px] text-muted-foreground">{example.size}×{example.size}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
