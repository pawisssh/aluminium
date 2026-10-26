import { useMemo } from 'react'
import { COLOUR_FAMILIES, colourHex, colourKey } from '@/core/colours'
import { caseColourKeys, MIX_CASE_COLOURS, MIX_CASES, PIECE_SIZES, pieceShare, type MixCase } from '@/core/mixCases'
import { MixIcon } from '@/components/icons'

const SHAPES: Record<number, string> = { 16: '4×4', 14: '2×4 + 2×3', 12: '2×4 + 2×2', 8: '2×4', 6: '2×3', 4: '2×2', 2: '2×1', 1: '1×1' }

/** Every 4×4 Mix case, grouped by how many Plan colours it holds; the nth colour of a case is drawn in the nth Mix case colour. */
export function MixCases() {
  const groups = useMemo(() => {
    const byColours = new Map<number, MixCase[]>()
    for (const c of MIX_CASES) byColours.set(c.sizes.length, [...(byColours.get(c.sizes.length) ?? []), c])
    return [...byColours]
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <p className="text-sm">
          <span className="text-2xl font-bold tabular-nums">{MIX_CASES.length}</span> Mix cases on a 4×4 grid with up to {MIX_CASE_COLOURS.length} Plan colours
        </p>
        <table className="w-fit text-xs tabular-nums">
          <tbody>
            <tr>
              <th className="pr-3 text-left font-normal text-muted-foreground">Colours</th>
              {groups.map(([k]) => (
                <td key={k} className="px-2 text-right">
                  {k}
                </td>
              ))}
            </tr>
            <tr>
              <th className="pr-3 text-left font-normal text-muted-foreground">Cases</th>
              {groups.map(([k, cases]) => (
                <td key={k} className="px-2 text-right">
                  {cases.length}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Each Plan colour is one piece: {PIECE_SIZES.map((s) => `${SHAPES[s]} (${pieceShare(s)})`).join(', ')}, a Side's width by its rows. Largest first, each goes in the left
          Side while it fits, then the right, top to bottom. Only the largest can be bigger, from 75% up: it takes the whole left Side and a 2×2 or larger
          piece at the top of the right. Between 50% and 75% it takes exactly the left Side.
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {MIX_CASE_COLOURS.map((colour, i) => (
            <span key={colourKey(colour)} className="flex items-center gap-1">
              <span className="size-3 rounded-sm" style={{ background: colourHex(colour) }} />
              {i + 1}. {COLOUR_FAMILIES[colour.family].label} {colour.tint}
            </span>
          ))}
        </div>
      </section>

      {groups.map(([k, cases]) => (
        <section key={k} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {k} Plan colour{k > 1 ? 's' : ''} <span className="font-normal text-muted-foreground">· {cases.length}</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3">
            {cases.map((c) => {
              const shares = c.sizes.map(pieceShare).join(' / ')
              return (
                <figure key={c.sizes.join('-')} className="flex flex-col items-center gap-1" title={c.sizes.map((s) => SHAPES[s]).join(', ')}>
                  <div className="rounded-md bg-muted p-1.5">
                    <MixIcon cells={caseColourKeys(c)} size={64} />
                  </div>
                  <figcaption className="text-center text-[10px] leading-tight text-muted-foreground">
                    <span className="tabular-nums">#{c.number}</span>
                    <span className="block tabular-nums">{shares}</span>
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
