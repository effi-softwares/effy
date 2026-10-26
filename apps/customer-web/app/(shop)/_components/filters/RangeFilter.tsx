"use client"

import { useEffect, useState } from "react"

/**
 * A number filter (101): from–to in the facet's unit, applied when a field is left or Enter is pressed.
 * The placeholders say the smallest and largest value in view. Native inputs, like the rest of the panel.
 */
export function RangeFilter({
  label,
  unit,
  bounds,
  min,
  max,
  onApply,
}: {
  label: string
  unit: string | null
  bounds: { min: string; max: string }
  min: string
  max: string
  onApply: (min: string, max: string) => void
}) {
  const [lo, setLo] = useState(min)
  const [hi, setHi] = useState(max)
  useEffect(() => {
    setLo(min)
    setHi(max)
  }, [min, max])

  function apply() {
    let a = lo.trim()
    let b = hi.trim()
    if (a !== "" && b !== "" && Number(a) > Number(b)) {
      ;[a, b] = [b, a]
      setLo(a)
      setHi(b)
    }
    if (a !== min || b !== max) onApply(a, b)
  }

  const field = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <input value={lo} onChange={(e) => setLo(e.target.value)} onBlur={apply} inputMode="decimal" placeholder={bounds.min} aria-label={`${label} from`} className={field} />
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      <input value={hi} onChange={(e) => setHi(e.target.value)} onBlur={apply} inputMode="decimal" placeholder={bounds.max} aria-label={`${label} to`} className={field} />
      {unit ? <span className="shrink-0 text-sm text-muted-foreground">{unit}</span> : null}
    </form>
  )
}
