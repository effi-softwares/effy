"use client"

import type { CheckoutPointsDTO } from "@effy/shared-types"

import { formatCents } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

import { maxPointsFor } from "./points"

/**
 * "Use points" at checkout (074 US2).
 *
 * ⚠ SHOWN ONLY WHEN THE QUOTE SAYS THE CUSTOMER HAS POINTS — no dead control for everyone else.
 * ⚠ The default is the most they can use (FR-012); the field lets them use fewer. The split shown is
 * the one the order is settled at: the server re-decides it and refuses rather than changes it.
 */
export function PointsControl({
  points,
  totalCents,
  on,
  onToggle,
  chosen,
  onChosen,
  currency,
  disabled,
}: {
  points: CheckoutPointsDTO
  totalCents: number
  on: boolean
  onToggle: (on: boolean) => void
  /** null = "the most I can" */
  chosen: number | null
  onChosen: (n: number | null) => void
  currency: string
  disabled?: boolean
}) {
  const max = maxPointsFor(points, totalCents)
  const value = Math.min(chosen ?? max, max)
  const fmt = (cents: number) => formatMoney(formatCents(cents), currency)

  return (
    <section aria-labelledby="points-heading" className="space-y-3">
      <h2 id="points-heading" className="text-xl font-semibold">
        Effy points
      </h2>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={on}
          disabled={disabled || max === 0}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          Use points{" "}
          <span className="text-muted-foreground">
            — you have {points.usable.toLocaleString("en-AU")} (worth {fmt(points.usable * points.centsPerPoint)})
          </span>
        </span>
      </label>
      {on && max > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="points-amount" className="text-muted-foreground">
            Points to use
          </label>
          <input
            id="points-amount"
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value))
              onChosen(Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : null)
            }}
            className="h-11 w-32 rounded-md border bg-background px-3 tabular-nums"
          />
          <span className="text-muted-foreground">of {max.toLocaleString("en-AU")} you can use on this order</span>
        </div>
      ) : null}
    </section>
  )
}
