import { useState } from "react"

import type { InsightsRhythmDTO } from "@effy/shared-types"

import { hourWords, rhythmGrid, rhythmSentence, WEEKDAY_NAME, WEEKDAY_SHORT } from "./model"

const STEPS = [12, 24, 36, 50, 64, 78, 90, 100]
/** One hue, light to dark, over the muted ground: the theme's own blue, in either appearance. */
const shade = (step: number | null) =>
  step === null ? "var(--muted)" : `color-mix(in srgb, var(--primary-fill) ${STEPS[step]}%, var(--muted))`

/** When this shop's orders come in, across recent weeks. */
export function Rhythm({ rhythm }: { rhythm: InsightsRhythmDTO | null }) {
  const [reading, setReading] = useState<string | null>(null)
  if (!rhythm) {
    return <p className="text-sm text-muted-foreground">Your week's rhythm appears here after two weeks of orders.</p>
  }
  const { hours, rows, peak } = rhythmGrid(rhythm)
  return (
    <>
      <p className="mb-3.5 max-w-[60ch] text-[17px] leading-[26px] font-semibold">{rhythmSentence(peak)}</p>
      <div
        role="group"
        aria-label="Orders by hour and day"
        className="grid items-center gap-0.5 max-md:gap-px"
        style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(0, 1fr))` }}
      >
        <span />
        {hours.map((h, i) => (
          <span key={h} className="h-4.5 text-center text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {i % 3 === 0 ? hourWords(h).replace(" ", "") : ""}
          </span>
        ))}
        {rows.map((row) => (
          <div key={row.weekday} className="contents">
            <span className="text-xs text-muted-foreground">{WEEKDAY_SHORT[row.weekday]}</span>
            {row.cells.map((c) => {
              const said = `${WEEKDAY_NAME[row.weekday]}, ${hourWords(c.hour)}: ${c.average} ${c.average === "1" ? "order" : "orders"} on average`
              return (
                <button
                  key={c.hour}
                  type="button"
                  aria-label={said}
                  style={{ background: shade(c.step) }}
                  className="aspect-[1.5] w-full min-w-0 cursor-default rounded-[4px] border-0 p-0 hover:outline-2 hover:outline-foreground focus-visible:outline-2 focus-visible:outline-foreground max-md:rounded-[2px]"
                  onPointerEnter={() => setReading(said)}
                  onFocus={() => setReading(said)}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-3 flex items-center gap-0.5 text-xs text-muted-foreground">
        <span className="mr-1.5">Fewer orders</span>
        {STEPS.map((_, i) => (
          <i key={i} className="h-2.5 w-5.5 rounded-[2px]" style={{ background: shade(i) }} />
        ))}
        <span className="ml-1.5">More</span>
      </div>
      <p className="mt-1.5 min-h-5 text-sm text-muted-foreground">{reading ?? `Average of the last ${rhythm.weeks} weeks. Hover a square for its number.`}</p>
    </>
  )
}
